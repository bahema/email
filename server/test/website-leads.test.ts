import {EditorialStore} from '../src/content/editorial.js';
import {pageMetadata} from '../src/seo.js';
import {publicBootstrap} from '../src/public-bootstrap.js';
import {renderPublic} from '../../client/src/public/server-render.tsx';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer,type AddressInfo,type Socket } from 'node:net';
import { mkdtempSync,rmSync,rmdirSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp,errorHandler,type AppOptions } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrations.js';
import { hashPassword,decryptSecret,encryptSecret,tokenHash } from '../src/security/crypto.js';
import { SettingsStore } from '../src/settings/store.js';
import { ContentStore } from '../src/content/store.js';
import { ContactStore,canReceiveMarketing } from '../src/contacts/store.js';
import { countryInfo,countryOptions } from '../src/contacts/countries.js';
import { TransactionalWorker } from '../src/mail/worker.js';

const key='ef'.repeat(32),password='fictional-phase34-password';
const hash=hashPassword(password);
const options:AppOptions={secureCookies:false,sessionHours:8,siteUrl:'http://localhost:5173',allowLoopbackOrigins:true,encryptionKey:key,timezone:'Africa/Kigali',environment:'test'};
async function fixture(){
  const directory=mkdtempSync(join(tmpdir(),'affiliate-phase34-'));
  const db=openDatabase(':memory:');migrate(db);db.prepare('INSERT INTO admin(id,email,password_hash) VALUES(1,?,?)').run('owner@example.test',await hash);
  const settings=new SettingsStore(db,key,options.siteUrl,options.timezone),content=new ContentStore(db,settings),contacts=new ContactStore(db,settings,content,key);
  const app=createApp(db,6,{...options,uploadDir:directory});app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie='',csrf='';
  async function request(path:string,method='GET',body?:unknown,authenticated=false){const response=await fetch(base+path,{method,headers:{...(authenticated?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});const set=response.headers.getSetCookie().at(-1);if(set)cookie=set.split(';')[0]!;const data=await response.json();if(data.csrfToken)csrf=data.csrfToken;return{status:response.status,data};}
  await request('/api/auth/session');assert.equal((await request('/api/auth/login','POST',{email:'owner@example.test',password},true)).status,200);
  async function upload(name:string,buffer:Uint8Array,visibility='public'){
    const form=new FormData();form.append('file',new Blob([buffer as BlobPart]),name);form.append('visibility',visibility);const response=await fetch(base+'/api/admin/media',{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf},body:form});return{status:response.status,data:await response.json()};
  }
  return{db,settings,content,contacts,base,request,upload,cookie:()=>cookie,close:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();for(const filename of readdirSync(directory))rmSync(join(directory,filename));rmdirSync(directory);}};
}
const signup=(source={type:'footer',id:'footer'},email='subscriber@example.test')=>({name:'Demo Subscriber',email,country:'RW',consent:true,source,utm:{utm_source:'demo',utm_campaign:'phase34'},website:''});
const offer=(slug='demo-offer',action='affiliate')=>({kind:'offer',slug,title:'Demo offer',position:0,status:'active',data:{description:'Fictional test offer',category:'Software',imageId:null,resourceId:null,action,destination:action==='affiliate'?'https://example.com/affiliate-test':'',ctaLabel:'View offer',tags:['software']}});
function queuedLinks(db:ReturnType<typeof openDatabase>,id?:number){const row=id?db.prepare('SELECT * FROM transactional_outbox WHERE id=?').get(id):db.prepare("SELECT * FROM transactional_outbox WHERE purpose='confirmation' ORDER BY id DESC LIMIT 1").get();assert.ok(row);const payload=JSON.parse(decryptSecret(String(row.payload),key,'contact-mail'));return{confirm:payload.text.match(/\/confirm\/([a-f0-9]{64})/)[1] as string,unsubscribe:payload.text.match(/\/unsubscribe\/([a-f0-9]{64})/)[1] as string};}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=','base64');

test('country mapping covers all six continents and documented transcontinental choices',()=>{
  for(const [code,continent] of [['RW','Africa'],['JP','Asia'],['DE','Europe'],['US','North America'],['BR','South America'],['AU','Oceania']])assert.equal(countryInfo(code!).continent,continent);
  assert.equal(countryInfo(' rw ').code,'RW');assert.equal(countryInfo('TR').continent,'Asia');assert.equal(countryInfo('RU').continent,'Asia');
  assert.throws(()=>countryInfo('AQ'));assert.throws(()=>countryInfo('XX'));assert.ok(countryOptions.length>200);
});

test('CMS publishes active content, strips affiliate URLs, moderates reviews and tracks redirects',async()=>{
  const f=await fixture();try{
    const saved=await f.request('/api/admin/content/items','POST',offer(),true);assert.equal(saved.status,201);
    const pending=f.content.saveItem({kind:'review',slug:'review',title:'Test review',position:0,status:'pending',data:{name:'Demo',rating:5,text:'Fictional review',avatarId:null}});
    const site=(await f.request('/api/public/site')).data;assert.ok(!JSON.stringify(site).includes('https://example.com/affiliate-test'));assert.equal(site.items[0].data.href,'/go/demo-offer');assert.equal(site.items.some((item:{kind:string})=>item.kind==='review'),false);
    const {id,...review}=pending;f.content.saveItem({...review,status:'approved'},id);assert.equal((await f.request('/api/public/site')).data.items.some((item:{kind:string})=>item.kind==='review'),true);
  }finally{await f.close();}
});

test('affiliate redirects store outbound events and respect tracking opt-out and inactive status',async()=>{
  const f=await fixture();try{
    const saved=f.content.saveItem(offer());const response=await fetch(f.base+'/go/demo-offer',{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://example.com/affiliate-test');assert.equal(f.db.prepare("SELECT count(*) AS n FROM events WHERE type='affiliate_clicked'").get()?.n,1);
    f.settings.save('tracking',{...f.settings.read().tracking,affiliateClicks:false});assert.equal((await fetch(f.base+'/go/demo-offer',{redirect:'manual'})).status,302);assert.equal(f.db.prepare("SELECT count(*) AS n FROM events WHERE type='affiliate_clicked'").get()?.n,1);
    const {id,...data}=saved;f.content.saveItem({...data,status:'inactive'},id);assert.equal((await fetch(f.base+'/go/demo-offer',{redirect:'manual'})).status,404);assert.equal((await fetch(f.base+'/go/missing',{redirect:'manual'})).status,404);
  }finally{await f.close();}
});

test('saved heroes can be selected and unsafe CMS inputs are rejected',async()=>{
  const f=await fixture();try{
    const hero=f.content.saveItem({kind:'hero',slug:'header',title:'Header',position:0,status:'active',data:{type:'lead_capture',tags:['guide'],slides:[{headline:'Join us',description:'Demo',imageId:null,videoId:null,ctaLabel:'Subscribe',action:'lead_capture',destination:'',offerId:null}]}});
    assert.equal((await f.request('/api/admin/content/sections/homepage','PUT',{activeHeroId:hero.id},true)).status,200);assert.equal((await f.request('/api/public/site')).data.sections.homepage.activeHeroId,hero.id);
    assert.equal((await f.request('/api/admin/content/items','POST',{...offer(),data:{...offer().data,destination:'javascript:alert(1)'}},true)).status,400);
    assert.equal((await f.request('/api/admin/content/sections/theme','PUT',{primary:'url(javascript:bad)',secondary:'#000000',accent:'#ffffff',background:'#ffffff'},true)).status,400);
    assert.equal((await f.request(`/api/admin/content/items/${hero.id}`,'DELETE',undefined,true)).status,409);
    assert.equal((await f.request('/api/admin/content')).status,401);
  }finally{await f.close();}
});

test('uploads validate real content, enforce privacy and prevent deletion of referenced assets',async()=>{
  const f=await fixture();try{
    const good=await f.upload('pixel.png',png);assert.equal(good.status,201);const id=good.data.id;
    assert.equal((await fetch(f.base+good.data.url)).status,200);assert.equal((await f.upload('fake.pdf',new TextEncoder().encode('<script>bad</script>'))).status,400);assert.equal((await f.upload('image.jpg',png)).status,400);assert.equal((await f.upload('dangerous.exe.png',png)).status,400);
    const privateAsset=await f.upload('private.png',png,'private');assert.equal((await fetch(f.base+`/media/${privateAsset.data.id}`)).status,404);assert.equal((await fetch(f.base+privateAsset.data.url,{headers:{Cookie:f.cookie()}})).status,200);
    assert.equal((await f.request('/api/admin/content/items','POST',{...offer('private-image'),data:{...offer().data,imageId:privateAsset.data.id}},true)).status,400);
    const saved=f.content.saveItem({...offer(),data:{...offer().data,imageId:id}});assert.equal((await f.request(`/api/admin/media/${id}`,'DELETE',undefined,true)).status,409);
    const {id:itemId,...item}=saved;f.content.saveItem({...item,data:{...item.data,imageId:null}},itemId);
    f.settings.save('general',{...f.settings.read().general,logoUrl:`http://localhost:5173/media/${id}?v=1`});assert.equal((await f.request(`/api/admin/media/${id}`,'DELETE',undefined,true)).status,409);
    f.settings.save('general',{...f.settings.read().general,logoUrl:''});assert.equal((await f.request(`/api/admin/media/${id}`,'DELETE',undefined,true)).status,200);assert.equal((await fetch(f.base+`/media/${id}`)).status,404);
    f.settings.save('uploads',{allowedExtensions:['txt'],maxSizeMb:1});assert.equal((await f.upload('large.txt',new Uint8Array(2*1024*1024))).status,413);
  }finally{await f.close();}
});

test('lead creation preserves consent/UTM/source, canonicalizes email and queues encrypted confirmation',async()=>{
  const f=await fixture();try{
    const response=await f.request('/api/public/subscribe','POST',signup(undefined,'Subscriber@Example.test'));assert.equal(response.status,202);assert.ok(!('token' in response.data));assert.ok(!('contactId' in response.data));
    const row=f.db.prepare('SELECT * FROM contacts').get()!;assert.equal(row.email,'subscriber@example.test');assert.equal(row.status,'pending');assert.equal(row.continent,'Africa');assert.equal(row.country,'RW');assert.equal(row.source_id,'footer');
    const submission=f.db.prepare('SELECT * FROM lead_submissions').get()!;assert.equal(submission.consent_text,f.settings.read().compliance.consentText);assert.equal(JSON.parse(String(submission.utm)).utm_source,'demo');
    const links=queuedLinks(f.db),job=f.db.prepare('SELECT * FROM transactional_outbox').get()!;assert.ok(!String(job.payload).includes(links.confirm));assert.ok(f.db.prepare('SELECT token_hash FROM contact_tokens WHERE token_hash=?').get(tokenHash(links.confirm)));assert.equal(f.db.prepare('SELECT token_hash FROM contact_tokens WHERE token_hash=?').get(links.confirm),undefined);
    assert.equal((await f.request('/api/public/subscribe','POST',{...signup(),name:'Changed identity'})).status,202);assert.equal(f.db.prepare('SELECT count(*) AS n FROM contacts').get()?.n,1);assert.equal(f.db.prepare('SELECT count(*) AS n FROM transactional_outbox').get()?.n,1);assert.equal(f.db.prepare('SELECT name FROM contacts').get()?.name,'Demo Subscriber');
  }finally{await f.close();}
});

test('forms reject missing consent, invalid countries and inactive or forged sources without creating contacts',async()=>{
  const f=await fixture();try{
    assert.equal((await f.request('/api/public/subscribe','POST',{...signup(),consent:false})).status,400);assert.equal((await f.request('/api/public/subscribe','POST',{...signup(),country:'XX'})).status,400);assert.equal((await f.request('/api/public/subscribe','POST',{...signup(),tags:['forged']})).status,400);
    assert.equal((await f.request('/api/public/subscribe','POST',signup({type:'offer',id:'999'}))).status,404);
    const item=f.content.saveItem({...offer('disabled','lead_capture'),status:'inactive'});assert.equal((await f.request('/api/public/subscribe','POST',signup({type:'offer',id:String(item.id)}))).status,404);
    assert.equal((await f.request('/api/public/subscribe','POST',{...signup(),website:'bot.example'})).status,202);assert.equal(f.db.prepare('SELECT count(*) AS n FROM contacts').get()?.n,0);
  }finally{await f.close();}
});

test('confirmation is explicit, idempotent and retains source tags without duplicate activity',async()=>{
  const f=await fixture();try{
    const item=f.content.saveItem(offer('interest','lead_capture'));await f.request('/api/public/subscribe','POST',signup({type:'offer',id:String(item.id)}));const links=queuedLinks(f.db);
    assert.equal((await f.request(`/api/public/confirm/${links.confirm}`)).status,200);assert.equal(f.db.prepare('SELECT status FROM contacts').get()?.status,'pending');assert.equal(f.db.prepare('SELECT count(*) AS n FROM contact_tags').get()?.n,0);
    assert.equal((await f.request(`/api/public/confirm/${links.confirm}`,'POST',{})).status,200);assert.equal(f.db.prepare('SELECT status FROM contacts').get()?.status,'confirmed');assert.equal(f.contacts.contact(1).tags[0]?.name,'software');
    assert.equal((await f.request(`/api/public/confirm/${links.confirm}`,'POST',{})).status,200);assert.equal(f.db.prepare("SELECT count(*) AS n FROM events WHERE type='lead_confirmed'").get()?.n,1);assert.equal(f.db.prepare('SELECT count(*) AS n FROM contact_tags').get()?.n,1);
    await f.request('/api/public/subscribe','POST',signup({type:'offer',id:String(item.id)}));assert.equal(f.db.prepare('SELECT count(*) AS n FROM transactional_outbox').get()?.n,1);
  }finally{await f.close();}
});

test('expired links cannot confirm; resend rotates the token without fabricating fresh consent',async()=>{
  const f=await fixture();try{
    f.contacts.signup(signup());const first=queuedLinks(f.db);f.db.prepare('UPDATE contact_tokens SET expires_at=? WHERE token_hash=?').run(Date.now()-1,tokenHash(first.confirm));assert.equal((await f.request(`/api/public/confirm/${first.confirm}`,'POST',{})).status,410);
    f.db.prepare('UPDATE contacts SET last_confirmation_at=?').run(Date.now()-61000);assert.equal((await f.request('/api/public/resend','POST',{email:'subscriber@example.test'})).status,202);const next=queuedLinks(f.db);assert.notEqual(first.confirm,next.confirm);assert.equal(f.db.prepare('SELECT count(*) AS n FROM lead_submissions').get()?.n,1);assert.equal((await f.request(`/api/public/confirm/${next.confirm}`,'POST',{})).status,200);
  }finally{await f.close();}
});

test('unsubscribe cancels queued emails and fresh consent must be confirmed before resubscription',async()=>{
  const f=await fixture();try{
    f.contacts.signup(signup());const first=queuedLinks(f.db);f.contacts.confirm(first.confirm);assert.equal(canReceiveMarketing(f.contacts.contact(1).status),true);
    assert.equal((await f.request(`/api/public/unsubscribe/${first.unsubscribe}`)).status,200);assert.equal(f.contacts.contact(1).status,'confirmed');assert.equal((await f.request(`/api/public/unsubscribe/${first.unsubscribe}`,'POST',{})).status,200);assert.equal(f.contacts.contact(1).status,'unsubscribed');assert.equal(canReceiveMarketing(f.contacts.contact(1).status),false);
    assert.equal((await f.request(`/api/public/confirm/${first.confirm}`,'POST',{})).status,409);assert.equal((await f.request(`/api/public/unsubscribe/${first.unsubscribe}`,'POST',{})).status,200);
    f.settings.save('compliance',{...f.settings.read().compliance,doubleOptIn:false});f.contacts.signup(signup());assert.equal(f.contacts.contact(1).status,'unsubscribed');const next=queuedLinks(f.db);assert.notEqual(next.confirm,first.confirm);f.contacts.confirm(next.confirm);assert.equal(f.contacts.contact(1).status,'confirmed');
  }finally{await f.close();}
});

test('suppression prevents public reactivation and any transactional send',async()=>{
  const f=await fixture();try{
    f.contacts.signup(signup());const links=queuedLinks(f.db);f.db.prepare("UPDATE contacts SET status='suppressed' WHERE id=1").run();f.settings.save('smtp',{host:'localhost',port:587,encryption:'starttls',username:'',fromName:'Demo',fromEmail:'sender@example.test',replyTo:''});let sends=0;const worker=new TransactionalWorker(f.db,f.settings,key,async()=>{sends++;});await worker.tick();assert.equal(sends,0);assert.equal(f.db.prepare('SELECT status FROM transactional_outbox').get()?.status,'cancelled');assert.throws(()=>f.contacts.confirm(links.confirm));f.contacts.signup(signup());assert.equal(f.contacts.contact(1).status,'suppressed');
    for(const status of ['pending','unsubscribed','bounced','complained','suppressed'])assert.equal(canReceiveMarketing(status),false);
  }finally{await f.close();}
});

test('durable worker waits for SMTP configuration and sends each eligible job only once',async()=>{
  const f=await fixture();try{
    f.contacts.signup(signup());let sends=0;const sender=async(_settings:unknown,recipient:string,_subject:string,text:string)=>{assert.equal(recipient,'subscriber@example.test');assert.match(text,/\/confirm\/[a-f0-9]{64}/);sends++;};const worker=new TransactionalWorker(f.db,f.settings,key,sender);await worker.tick();assert.equal(sends,0);assert.equal(f.db.prepare('SELECT attempts FROM transactional_outbox').get()?.attempts,0);
    f.settings.save('smtp',{host:'localhost',port:587,encryption:'starttls',username:'',fromName:'Demo',fromEmail:'sender@example.test',replyTo:''});await Promise.all([worker.tick(),worker.tick(),new TransactionalWorker(f.db,f.settings,key,sender).tick()]);await worker.tick();assert.equal(sends,1);assert.equal(f.db.prepare('SELECT status FROM transactional_outbox').get()?.status,'sent');assert.equal(f.db.prepare("SELECT count(*) AS n FROM events WHERE type='confirmation_sent'").get()?.n,1);
    const logs=await f.request('/api/admin/contacts/outbox','GET',undefined,true);assert.ok(!JSON.stringify(logs.data).includes(queuedLinks(f.db).confirm));assert.ok(!('payload' in logs.data[0]));
  }finally{await f.close();}
});

test('connection failures retry safely; ambiguous processing after interruption is not resent',async()=>{
  const f=await fixture();try{
    f.contacts.signup(signup());f.settings.save('smtp',{host:'localhost',port:587,encryption:'starttls',username:'',fromName:'Demo',fromEmail:'sender@example.test',replyTo:''});let attempts=0;const worker=new TransactionalWorker(f.db,f.settings,key,async()=>{attempts++;throw Object.assign(new Error('sensitive provider failure'),{code:'ECONNREFUSED'});});
    for(let n=0;n<3;n++){f.db.prepare('UPDATE transactional_outbox SET scheduled_at=0').run();await worker.tick();}assert.equal(attempts,3);assert.equal(f.db.prepare('SELECT status FROM transactional_outbox').get()?.status,'failed');assert.ok(!String(f.db.prepare('SELECT last_error FROM transactional_outbox').get()?.last_error).includes('sensitive'));
    f.db.prepare("UPDATE transactional_outbox SET status='processing',claimed_at=?").run(Date.now()-121000);await worker.tick();assert.equal(attempts,3);assert.match(String(f.db.prepare('SELECT last_error FROM transactional_outbox').get()?.last_error),/uncertain/);
  }finally{await f.close();}
});

test('admin can filter contacts and edit tags without exposing token payloads',async()=>{
  const f=await fixture();try{
    f.contacts.signup(signup());f.contacts.confirm(queuedLinks(f.db).confirm);const update=await f.request('/api/admin/contacts/1/tags','PUT',{tags:['business','guide']},true);assert.equal(update.status,200);assert.equal(update.data.tags.length,2);
    const list=await f.request('/api/admin/contacts?continent=Africa&status=confirmed','GET',undefined,true);assert.equal(list.data.total,1);assert.equal(list.data.contacts[0].email,'subscriber@example.test');assert.equal((await f.request('/api/admin/contacts')).status,401);
    const detail=await f.request('/api/admin/contacts/1','GET',undefined,true);assert.equal(detail.data.submissions.length,1);assert.ok(!JSON.stringify(detail.data).includes(queuedLinks(f.db).confirm));
  }finally{await f.close();}
});




test('live signup confirmation and unsubscribe work through the scheduled worker and local SMTP capture',async()=>{
  const f=await fixture(),sockets=new Set<Socket>(),messages:string[]=[];
  let receive:(message:string)=>void=()=>{};
  const received=new Promise<string>(resolve=>{receive=resolve;});
  const smtp=createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 local.test ESMTP\r\n');
    let buffer='',data=false,message='';
    socket.on('data',chunk=>{buffer+=chunk;let at:number;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at).replace(/\r$/,'');buffer=buffer.slice(at+1);
      if(data){if(line==='.'){messages.push(message);receive(message);message='';data=false;socket.write('250 Captured locally\r\n');}else message+=line+'\n';}
      else if(/^(EHLO|HELO) /i.test(line))socket.write('250-local.test\r\n250 PIPELINING\r\n');
      else if(line==='DATA'){data=true;socket.write('354 Send message\r\n');}
      else if(line==='QUIT')socket.end('221 Bye\r\n');else socket.write('250 OK\r\n');
    }});
  });
  smtp.listen(0,'127.0.0.1');await new Promise<void>(resolve=>smtp.once('listening',resolve));
  let stop:(()=>Promise<void>)|undefined;
  try{
    f.settings.save('smtp',{host:'127.0.0.1',port:(smtp.address() as AddressInfo).port,encryption:'none',username:'',fromName:'Local test',fromEmail:'sender@example.test',replyTo:''});
    assert.equal((await f.request('/api/public/subscribe','POST',signup())).status,202);
    // The worker progresses on its own timer without admin/browser requests.
    stop=new TransactionalWorker(f.db,f.settings,key).start();
    const timeout=setTimeout(()=>receive('TIMEOUT'),10000);const raw=await received;clearTimeout(timeout);assert.notEqual(raw,'TIMEOUT');
    await stop();stop=undefined;
    assert.match(raw,/Content-Type: multipart\/alternative/i);assert.match(raw,/Content-Type: text\/html/i);assert.match(raw,/Content-Type: multipart\/related/i);assert.match(raw,/Content-ID: <system-logo@33-items>/i);assert.match(raw,/cid:system-logo@33-items/);const text=raw.replace(/=\n/g,'');const confirm=text.match(/\/confirm\/([a-f0-9]{64})/)?.[1],unsubscribe=text.match(/\/unsubscribe\/([a-f0-9]{64})/)?.[1];assert.ok(confirm);assert.ok(unsubscribe);assert.equal(messages.length,1);assert.equal(f.db.prepare('SELECT status FROM transactional_outbox').get()?.status,'sent');
    assert.equal((await f.request(`/api/public/confirm/${confirm}`,'POST',{})).status,200);assert.equal(f.contacts.contact(1).status,'confirmed');
    assert.equal((await f.request(`/api/public/unsubscribe/${unsubscribe}`,'POST',{})).status,200);assert.equal(f.contacts.contact(1).status,'unsubscribed');assert.equal(canReceiveMarketing(f.contacts.contact(1).status),false);
  }finally{if(stop)await stop();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>smtp.close(()=>resolve()));await f.close();}
});


test('editable presentation headings and palettes persist and appear in public site data',async()=>{
 const f=await fixture();try{
  const initial=(await f.request('/api/public/site')).data.sections.presentation;
  assert.ok(initial.offersHeadline);
  const input={...initial,heroEyebrow:'Our independent picks',offersHeadline:'Explore our library',offersDescription:'Tools and reading selected by the owner',heroSecondaryHref:'/p/guide'};
  assert.equal((await f.request('/api/admin/content/sections/presentation','PUT',input,true)).status,200);
  const theme={primary:'#245c85',secondary:'#152c45',accent:'#9c5928',background:'#f5f8fc'};
  assert.equal((await f.request('/api/admin/content/sections/theme','PUT',theme,true)).status,200);
  const published=(await f.request('/api/public/site')).data;
  assert.deepEqual(published.sections.presentation,input);for(const [key,value] of Object.entries(theme))assert.equal(published.sections.theme[key],value);assert.equal(published.sections.theme.navBackground,'#1b283b');
  assert.equal((await f.request('/api/admin/content/sections/presentation','PUT',{...input,heroSecondaryHref:'javascript:alert(1)'},true)).status,400);
  assert.equal((await f.request('/api/admin/content/sections/presentation','PUT',input)).status,401);
 }finally{await f.close();}
});

test('media library filters and paginates safely and exposes saved usage and public origin',async()=>{
 const f=await fixture();try{
 assert.equal((await f.request('/api/admin/media/library')).status,401);
 for(let i=0;i<27;i++)f.db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES(?,?,'image/png',10,'png','image',?)").run(`library-${i}.png`,`fixture-${i}.png`,i===0?'private':'public');
 f.settings.save('domains',{publicUrl:'https://example.test'});
 const all=await f.request('/api/admin/media/library', 'GET',undefined,true);assert.equal(all.status,200);assert.equal(all.data.total,27);assert.equal(all.data.assets.length,24);assert.equal(all.data.pages,2);assert.equal(all.data.publicOrigin,'https://example.test');assert.equal(all.data.stats.bytes,270);
 const second=await f.request('/api/admin/media/library?page=2','GET',undefined,true);assert.equal(second.data.assets.length,3);assert.ok(!all.data.assets.some((a:{id:number})=>second.data.assets.some((b:{id:number})=>a.id===b.id)));
 const filtered=await f.request('/api/admin/media/library?visibility=private&category=image&search=library-0','GET',undefined,true);assert.equal(filtered.data.total,1);
 const id=all.data.assets[0].id;f.content.saveItem({...offer('media-library-use'),data:{...offer().data,imageId:id}});
 const details=await f.request(`/api/admin/media/${id}/details`,'GET',undefined,true);assert.ok(details.data.usage.length);assert.equal((await f.request(`/api/admin/media/${id}`,'DELETE',undefined,true)).status,409);
 assert.equal((await f.request('/api/admin/media/library?page=-1','GET',undefined,true)).status,400);
 assert.equal((await f.request('/api/admin/media/library?search=%25','GET',undefined,true)).data.total,0);
 assert.equal((await f.request('/api/admin/media/999999/details','GET',undefined,true)).status,404);
 }finally{await f.close();}
});

test('resends cancel obsolete queued confirmations and delivery replaces legacy snapshots with current system HTML',async()=>{
 const f=await fixture();try{
  f.contacts.signup(signup());const first=queuedLinks(f.db);
  f.contacts.signup(signup());assert.equal(f.db.prepare("SELECT count(*) n FROM transactional_outbox WHERE status='pending'").get()!.n,1);
  f.db.prepare('UPDATE contacts SET last_confirmation_at=?').run(Date.now()-61000);f.contacts.resendConfirmation('subscriber@example.test');
  assert.equal(f.db.prepare("SELECT count(*) n FROM transactional_outbox WHERE status='cancelled'").get()!.n,1);
  const row=f.db.prepare("SELECT id,payload FROM transactional_outbox WHERE status='pending'").get()!;
  const old=JSON.parse(decryptSecret(String(row.payload),key,'contact-mail'));old.subject='Old confirmation';old.html='<p>Old hand written template</p>';
  f.db.prepare('UPDATE transactional_outbox SET payload=? WHERE id=?').run(encryptSecret(JSON.stringify(old),key,'contact-mail'),row.id as number);
  f.settings.save('smtp',{host:'localhost',port:587,encryption:'starttls',username:'',fromName:'Demo',fromEmail:'sender@example.test',replyTo:''});
  let sends=0;const worker=new TransactionalWorker(f.db,f.settings,key,async(_smtp,_recipient,subject,text,_id,html)=>{sends++;assert.notEqual(subject,'Old confirmation');assert.ok(!html?.includes('Old hand written template'));assert.match(html!,/Hello Demo Subscriber/);assert.match(html!,/What happens next/);assert.ok(!text.includes(first.confirm));});
  await worker.tick();await worker.tick();assert.equal(sends,1);
 }finally{await f.close();}
});


test('repeating a normalized email in the same pending or completed journey creates no extra acquisition',async()=>{
 const f=await fixture();try{
  const first=await f.request('/api/public/subscribe','POST',signup(undefined,' Reader@Example.test '));
  f.db.prepare('UPDATE contacts SET last_confirmation_at=?').run(Date.now()-61000);
  f.db.prepare("UPDATE lead_submissions SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 minutes')").run();
  const repeated=await f.request('/api/public/subscribe','POST',signup({type:'newsletter',id:'newsletter'},'reader@example.test'));
  assert.deepEqual(repeated.data,first.data);assert.equal(repeated.status,202);
  for(const table of ['contacts','lead_submissions','transactional_outbox'])assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table}`).get()?.n,1,table);
  f.contacts.confirm(queuedLinks(f.db).confirm);
  await f.request('/api/public/subscribe','POST',signup(undefined,'READER@example.test'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM lead_submissions').get()?.n,1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM events WHERE type='lead_confirmed'").get()?.n,1);
 }finally{await f.close();}
});
test('confirmation recovery preserves one acquisition and does not reveal recipient status',async()=>{
 const f=await fixture();try{
  f.contacts.signup(signup());const original=queuedLinks(f.db);f.contacts.confirm(original.confirm);
  f.db.prepare('UPDATE contacts SET last_confirmation_at=?').run(Date.now()-61000);
  const known=await f.request('/api/public/resend','POST',{email:'subscriber@example.test',source:{type:'newsletter',id:'newsletter'}});
  const missing=await f.request('/api/public/resend','POST',{email:'missing@example.test',source:{type:'footer',id:'footer'}});assert.deepEqual(known.data,missing.data);assert.equal(known.status,202);
  const fresh=queuedLinks(f.db);assert.notEqual(fresh.confirm,original.confirm);f.contacts.confirm(fresh.confirm);f.contacts.confirm(fresh.confirm);
  assert.equal(f.db.prepare('SELECT count(*) n FROM lead_submissions').get()?.n,1);assert.equal(f.db.prepare("SELECT count(*) n FROM events WHERE type='lead_confirmed'").get()?.n,1);
  const count=f.db.prepare('SELECT count(*) n FROM transactional_outbox').get()?.n;
  f.db.prepare('UPDATE contacts SET last_confirmation_at=?').run(Date.now()-61000);
  await f.request('/api/public/resend','POST',{email:'subscriber@example.test',source:{type:'offer',id:'999'}});assert.equal(f.db.prepare('SELECT count(*) n FROM transactional_outbox').get()?.n,count);
  f.contacts.unsubscribe(original.unsubscribe);f.db.prepare('UPDATE contacts SET last_confirmation_at=?').run(Date.now()-61000);
  const optedOut=await f.request('/api/public/resend','POST',{email:'subscriber@example.test',source:{type:'footer',id:'footer'}});assert.deepEqual(optedOut.data,missing.data);assert.equal(f.contacts.contact(1).status,'unsubscribed');assert.equal(f.db.prepare('SELECT count(*) n FROM transactional_outbox').get()?.n,count);
  f.contacts.signup(signup());f.db.prepare('UPDATE contacts SET last_confirmation_at=?').run(Date.now()-61000);
  f.contacts.resendConfirmation('subscriber@example.test',{type:'footer',id:'footer'});assert.equal(f.contacts.contact(1).status,'unsubscribed');f.contacts.confirm(queuedLinks(f.db).confirm);assert.equal(f.contacts.contact(1).status,'confirmed');
 }finally{await f.close();}
});


test('owner bulk actions queue cooldown-limited confirmations and atomically delete only never-confirmed pending contacts',async()=>{
 const f=await fixture();try{
  for(const email of ['batch-a@example.test','batch-b@example.test'])f.contacts.signup({name:'Batch',email,country:'RW',consent:true,source:{type:'footer',id:'footer'}});
  const ids=f.db.prepare('SELECT id FROM contacts ORDER BY id').all().map(r=>Number(r.id));
  assert.equal((await f.request('/api/admin/contacts/pending-actions','POST',{ids,action:'resend'})).status,401);
  let r=await f.request('/api/admin/contacts/pending-actions','POST',{ids,action:'resend'},true);assert.equal(r.status,200);assert.equal(r.data.queued,0);assert.equal(r.data.skipped,2);
  f.db.prepare('UPDATE contacts SET last_confirmation_at=0').run();
  r=await f.request('/api/admin/contacts/pending-actions','POST',{ids,action:'resend'},true);assert.equal(r.status,200);assert.equal(r.data.queued,2);
  assert.equal((await f.request('/api/admin/contacts/pending-actions','POST',{ids:[ids[0],ids[0]],action:'delete'},true)).status,400);
  f.db.prepare("UPDATE contacts SET status='confirmed',confirmed_at=? WHERE id=?").run(new Date().toISOString(),ids[1]!);
  assert.equal((await f.request('/api/admin/contacts/pending-actions','POST',{ids,action:'delete'},true)).status,409);assert.equal(f.db.prepare('SELECT count(*) n FROM contacts').get()?.n,2);
  r=await f.request('/api/admin/contacts/pending-actions','POST',{ids:[ids[0]],action:'delete'},true);assert.equal(r.status,200);assert.equal(r.data.deleted,1);
  for(const table of ['contacts','transactional_outbox','contact_tokens','lead_submissions','events'])assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table} WHERE ${table==='contacts'?'id':'contact_id'}=?`).get(ids[0]!)?.n,0);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{await f.close();}
});

test('bulk pending deletion refuses in-flight confirmation and former confirmed history',async()=>{
 const f=await fixture();try{
  f.contacts.signup({name:'Pending',email:'protected-pending@example.test',country:'RW',consent:true,source:{type:'footer',id:'footer'}});const id=Number(f.db.prepare('SELECT id FROM contacts').get()?.id);
  f.db.prepare("UPDATE transactional_outbox SET status='processing'").run();assert.throws(()=>f.contacts.pendingBatch([id],'delete'),/cannot be deleted/);
  f.db.prepare("UPDATE transactional_outbox SET status='pending'").run();f.db.prepare('UPDATE contacts SET confirmed_at=? WHERE id=?').run(new Date().toISOString(),id);assert.throws(()=>f.contacts.pendingBatch([id],'delete'),/cannot be deleted/);assert.equal(f.db.prepare('SELECT count(*) n FROM contacts').get()?.n,1);
 }finally{await f.close();}
});


test('editorial owner APIs protect drafts, validate publication and preserve product references',async()=>{
 const f=await fixture();try{
  const product=f.content.saveItem(offer()),payload={kind:'collection',slug:'selected-tools',title:'Selected tools',status:'draft',position:0,data:{description:'Independent selections',productIds:[product.id],featured:true}};
  assert.equal((await f.request('/api/admin/content/editorial','POST',payload)).status,401);
  const draft=await f.request('/api/admin/content/editorial','POST',payload,true);assert.equal(draft.status,201);assert.equal((await f.request('/api/public/site')).data.editorial.length,0);
  assert.equal((await f.request('/api/admin/content/editorial','POST',{...payload,status:'active',slug:'empty',data:{productIds:[]}},true)).status,400);
  const live=await f.request('/api/admin/content/editorial/'+draft.data.id,'PUT',{...payload,status:'active'},true);assert.equal(live.status,200);assert.equal((await f.request('/api/public/site')).data.editorial[0].title,'Selected tools');
  assert.throws(()=>f.content.remove(product.id),/guides or collections/);
  const {id,...input}=product;f.content.saveItem({...input,status:'inactive'},id);assert.equal(new EditorialStore(f.db).publicPages().length,0);
  assert.equal((await f.request('/api/admin/content/editorial','POST',{...payload,slug:'forged',data:{productIds:[999999]}},true)).status,400);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{await f.close();}
});

test('published guides have server metadata and escaped SSR content while drafts are noindex and absent from sitemap',async()=>{
 const f=await fixture();try{
  const store=new EditorialStore(f.db),guide=store.save({kind:'guide',slug:'choose-tools',title:'Choosing useful tools',status:'active',data:{description:'Read provider terms',body:'## Compare the details\n\n<script>doNotRun()</script>\n\n- Read limitations\n- Check prices',featured:true}});
  store.save({kind:'guide',slug:'private-draft',title:'Private draft',status:'draft',data:{body:'Private editorial content'}});
  assert.equal(pageMetadata(f.db,f.settings,'/guides/'+guide.slug).noindex,false);assert.equal(pageMetadata(f.db,f.settings,'/guides/private-draft').notFound,true);
  const bootstrap=publicBootstrap(f.db,f.settings,'/guides/'+guide.slug,'localhost'),html=renderPublic(bootstrap,'/guides/'+guide.slug);assert.match(html,/Choosing useful tools/);assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>doNotRun'));assert.match(html,/<h2>Compare the details<\/h2>/);
  const sitemap=await fetch(f.base+'/sitemap.xml').then(r=>r.text());assert.match(sitemap,/guides\/choose-tools/);assert.ok(!sitemap.includes('private-draft'));
  const duplicate=await f.request('/api/admin/content/editorial','POST',{kind:'guide',slug:guide.slug,title:'Duplicate',status:'draft',data:{}},true);assert.equal(duplicate.status,409);
  assert.equal((await f.request('/api/admin/content/editorial','POST',{kind:'guide',slug:'empty-guide',title:'Empty',status:'active',data:{}},true)).status,400);
 }finally{await f.close();}
});

test('editorial links reuse active lead pages and protect related guide and public media references',async()=>{
 const f=await fixture();try{
  const store=new EditorialStore(f.db),guide=store.save({kind:'guide',slug:'base-guide',title:'Base guide',status:'active',data:{body:'Useful information'}}),related=store.save({kind:'guide',slug:'related-guide',title:'Related guide',status:'draft',data:{guideIds:[guide.id]}});
  assert.throws(()=>store.remove(guide.id),/related pages/);store.remove(related.id);store.remove(guide.id);
  assert.throws(()=>store.save({kind:'guide',slug:'private-cover',title:'Private',data:{imageId:9999}}),/public/);
  assert.throws(()=>store.save({kind:'guide',slug:'bad-funnel',title:'Bad funnel',data:{leadPageId:9999}}),/lead page/);
  f.content.saveSection('discovery',{savedEnabled:false,compareEnabled:false,savedHeading:'My shortlist',collectionsHeading:'Our collections',guidesHeading:'Learn more'});
  const site=f.content.publicSite();assert.equal(site.sections.discovery?.savedEnabled,false);assert.equal(site.sections.discovery?.savedHeading,'My shortlist');assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{await f.close();}
});


test('initial public signup forms include the backend country list and continent mappings before browser fetches',async()=>{
 const f=await fixture();try{
  const bootstrap=publicBootstrap(f.db,f.settings,'/','localhost');assert.equal(bootstrap.countries.length,countryOptions.length);assert.equal(bootstrap.countries.find(c=>c.code==='RW')?.continent,'Africa');
  const html=renderPublic(bootstrap,'/');assert.match(html,/>Rwanda<\/option>/);assert.ok(!html.includes('Country list unavailable'));
  const response=await f.request('/api/public/countries');assert.equal(response.status,200);assert.deepEqual(response.data,bootstrap.countries);
 }finally{await f.close();}
});
