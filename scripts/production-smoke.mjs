import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

// Never open the live database, load its encryption key or start delivery workers.
const scratch=mkdtempSync(join(tmpdir(),'affiliate-production-smoke-'));
const socket=createServer();
await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port;
await new Promise(resolve=>socket.close(resolve));
const child=spawn(process.execPath,['server/dist/server/src/index.js'],{
  env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),
    SITE_URL:'https://example.test',DATABASE_PATH:join(scratch,'test.sqlite'),
    UPLOAD_DIR:join(scratch,'uploads'),SETTINGS_ENCRYPTION_KEY:randomBytes(32).toString('hex'),
    PREVIEW_ONLY:'true',TRUST_PROXY:'false'},
  stdio:['ignore','pipe','pipe']
});
let output='';
child.stdout.on('data',data=>{output+=data.toString();});
child.stderr.on('data',data=>{output+=data.toString();});
const exited=new Promise(resolve=>child.once('exit',resolve));
try{
  let healthy=false,lastResponse='';
  for(let attempt=0;attempt<120;attempt++){
    if(child.exitCode!==null)throw new Error('Compiled server exited before readiness: '+output.slice(-2000));
    try{
      const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1000)});
      const body=await response.json();
      lastResponse=JSON.stringify({status:response.status,body});
      if(response.ok&&body.status==='ok'){healthy=true;break;}
    }catch(error){lastResponse=error.message;}
    await pause(250);
  }
  assert.ok(healthy,'Compiled server must become healthy: '+lastResponse+' '+output.slice(-2000));
  const page=await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(5000)});
  assert.equal(page.status,200);
  const html=await page.text();
  assert.match(html,/data-rendered="true"/);
  assert.match(html,/rel="canonical" href="https:\/\/example.test\/"/);
  const logo=await fetch(`http://127.0.0.1:${port}/brand/33-items-logo.jpg`);
  assert.equal(logo.status,200);
  assert.match(logo.headers.get('content-type'),/image\/jpeg/);
  console.log('Production smoke passed: plain Node startup, health, rendered homepage and bundled logo. Isolated data; delivery paused.');
}finally{
  child.kill('SIGTERM');
  await Promise.race([exited,pause(5000)]);
  if(child.exitCode===null&&!child.signalCode)child.kill('SIGKILL');
}
