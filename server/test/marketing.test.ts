import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer,type AddressInfo,type Socket } from 'node:net';
import { mkdtempSync,readdirSync,rmSync,rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrations.js';
import { createApp,errorHandler,type AppOptions } from '../src/app.js';
import { hashPassword,tokenHash } from '../src/security/crypto.js';
import { SettingsStore } from '../src/settings/store.js';
import { ContentStore } from '../src/content/store.js';
import { ContactStore } from '../src/contacts/store.js';
import { NewsletterStore,renderEmail,type Newsletter } from '../src/marketing/newsletters.js';
import { SegmentStore } from '../src/marketing/segments.js';
import { CampaignStore } from '../src/marketing/campaigns.js';
import { MarketingWorker } from '../src/marketing/worker.js';
import type { MarketingSender } from '../src/settings/email.js';
const password='fictional-phase56-password',key='ab'.repeat(32),hash=hashPassword(password);
const options:AppOptions={secureCookies:false,sessionHours:8,siteUrl:'http://localhost:5173',allowLoopbackOrigins:true,encryptionKey:key,timezone:'Africa/Kigali',environment:'test'};
const content=()=>({title:'Demo newsletter',subject:'Welcome {name}',preheader:'Fictional newsletter preview',html:'<h1>Hello {name}</h1><p>Demo content.</p><a href="https://example.com/resource">Read more</a><p><a href="{unsubscribeUrl}">Leave the list</a></p>',status:'ready'});
async function fixture(sender?:MarketingSender,persistent=false){
 const directory=mkdtempSync(join(tmpdir(),'affiliate-phase56-')),path=persistent?join(directory,'test.sqlite'):':memory:';
 const db=openDatabase(path);const version=migrate(db);db.prepare('INSERT INTO admin(id,email,password_hash) VALUES(1,?,?)').run('owner@example.test',await hash);
 const settings=new SettingsStore(db,key,options.siteUrl,options.timezone),newsletters=new NewsletterStore(db),segments=new SegmentStore(db),campaigns=new CampaignStore(db),contacts=new ContactStore(db,settings,new ContentStore(db,settings),key);
 const app=createApp(db,version,{...options,uploadDir:directory,marketingSender:sender});app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;let cookie='',csrf='';
 async function request(path:string,method='GET',body?:unknown,auth=true){const response=await fetch(base+path,{method,headers:{...(auth?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});const set=response.headers.getSetCookie().at(-1);if(set)cookie=set.split(';')[0]!;const data=await response.json();if(data.csrfToken)csrf=data.csrfToken;return{status:response.status,data};}
 await request('/api/auth/session');assert.equal((await request('/api/auth/login','POST',{email:'owner@example.test',password})).status,200);
 function contact(status='confirmed',country='RW',continent='Africa',email='subscriber@example.test',name='Demo Subscriber'){return Number(db.prepare("INSERT INTO contacts(name,email,country,continent,status,source_type,source_id,source_label,confirmed_at) VALUES(?,?,?,?,?,'footer','footer','Footer',?)").run(name,email,country,continent,status,status==='confirmed'?new Date().toISOString():null).lastInsertRowid);}
 function smtp(){settings.save('smtp',{host:'127.0.0.1',port:587,encryption:'starttls',username:'',fromName:'Demo',fromEmail:'sender@example.test',replyTo:''});}
 return{db,path,base,settings,newsletters,segments,campaigns,contacts,request,contact,smtp,cookie:()=>cookie,close:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));if(db.isOpen)db.close();for(const file of readdirSync(directory))rmSync(join(directory,file));rmdirSync(directory);}};
}

test('newsletter APIs sanitize active HTML, preserve safe formatting, duplicate drafts and enforce admin/CSRF',async()=>{
 let tests=0;const f=await fixture(async(_smtp,recipient,email)=>{tests++;assert.equal(recipient,'test@example.test');assert.match(email.subject,/^\[TEST\]/);assert.ok(!email.html.includes('/email/open/'));});try{
  assert.equal((await f.request('/api/admin/newsletters','GET',undefined,false)).status,401);
  const unsafe={...content(),html:'<script>alert(1)</script><p onclick="alert(1)" style="color:#123456;position:absolute;background-image:url(https://evil.test)">Hello {name}</p><a href="javascript:alert(1)">Bad</a><img src="data:text/html,evil" onerror="alert(1)"><iframe src="https://evil.test"></iframe><p><strong>Safe</strong></p>'};
  const saved=await f.request('/api/admin/newsletters','POST',unsafe);assert.equal(saved.status,201);assert.ok(!/script|onclick|onerror|iframe|javascript:|position|background-image|data:text/.test(saved.data.html));assert.match(saved.data.html,/color:#123456/);assert.match(saved.data.html,/<strong>Safe/);
  const duplicate=await f.request(`/api/admin/newsletters/${saved.data.id}/duplicate`,'POST',{});assert.equal(duplicate.data.status,'draft');assert.notEqual(duplicate.data.id,saved.data.id);
  const preview=await f.request('/api/admin/newsletter-preview','POST',content());assert.equal(preview.status,200);assert.match(preview.data.html,/Demo Subscriber/);assert.match(preview.data.html,/\/unsubscribe/);assert.match(preview.data.html,/commission/);
  await f.request(`/api/admin/newsletters/${saved.data.id}/test`,'POST',{recipient:'test@example.test'});assert.equal(tests,1);
  assert.equal((await f.request('/api/admin/newsletters','POST',{...content(),subject:'Bad\r\nBcc: evil@example.test'})).status,400);
  const response=await fetch(f.base+'/api/admin/newsletters',{method:'POST',headers:{'Content-Type':'application/json',Cookie:f.cookie()},body:JSON.stringify(content())});assert.equal(response.status,403);
  const email=renderEmail({...content(),status:'ready',id:1} as Newsletter,f.settings.read(),'<img onerror=alert(1)>','https://example.test/unsubscribe/example');assert.match(email.html,/&lt;img onerror=alert\(1\)&gt;/);assert.ok(!email.html.includes('<img onerror'));
 }finally{await f.close();}
});

test('newsletter assets and frozen campaign assets stay protected from deletion',async()=>{
 const f=await fixture();try{
  const asset=Number(f.db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES('demo.png','demo.png','image/png',10,'png','image','public')").run().lastInsertRowid);
  const newsletter=f.newsletters.save({...content(),html:`<p><img src="/media/${asset}"></p>`});
  assert.equal((await f.request(`/api/admin/media/${asset}`,'DELETE')).status,409);
  const campaign=f.campaigns.save({name:'Demo campaign',newsletterId:newsletter.id,audience:{type:'all'}});f.campaigns.launch(campaign.id,Date.now()+10000);
  f.newsletters.save(content(),newsletter.id);assert.equal((await f.request(`/api/admin/media/${asset}`,'DELETE')).status,409);
  assert.equal((await f.request(`/api/admin/newsletters/${newsletter.id}`,'DELETE')).status,409);
  f.db.prepare("UPDATE media SET visibility='private' WHERE id=?").run(asset);assert.throws(()=>f.newsletters.save({...content(),html:`<img src="/media/${asset}">`}));
 }finally{await f.close();}
});

test('AND/OR segmentation resolves tags, dates, sources and engagement with parameterized rules',async()=>{
 const f=await fixture();try{
  const one=f.contact(),two=f.contact('confirmed','DE','Europe','europe@example.test'),pending=f.contact('pending','RW','Africa','pending@example.test');
  f.contacts.setTags(one,['business']);f.db.prepare("UPDATE contacts SET last_open_at=?,created_at=? WHERE id=?").run(new Date().toISOString(),'2026-01-01T00:00:00.000Z',one);
  const segment={name:'Confirmed Africa',mode:'and',rules:[{field:'status',operator:'eq',value:'confirmed'},{field:'continent',operator:'eq',value:'Africa'}]};
  assert.equal(f.segments.preview(segment).eligible,1);assert.equal(f.segments.preview({...segment,mode:'or'}).matched,3);
  assert.equal(f.segments.preview({name:'Tagged',mode:'and',rules:[{field:'tag',operator:'eq',value:'BUSINESS'},{field:'opened_within',operator:'within',value:'30'}]}).eligible,1);
  assert.equal(f.segments.preview({name:'Old',mode:'and',rules:[{field:'created_at',operator:'before',value:'2026-02-01T00:00:00.000Z'}]}).matched,1);
  assert.equal(f.segments.preview({name:'No injection',mode:'and',rules:[{field:'source_id',operator:'eq',value:"' OR 1=1 --"}]}).matched,0);
  assert.throws(()=>f.segments.compile({name:'Bad field',mode:'and',rules:[{field:'email',operator:'eq',value:'example'}]}));
  assert.throws(()=>f.segments.compile({name:'Bad operator',mode:'and',rules:[{field:'source_id',operator:'within',value:'1'}]}));
 }finally{await f.close();}
});

test('segment recipient resolution enforces confirmed status even for OR rules or selected blocked contacts',async()=>{
 const f=await fixture();try{
  const one=f.contact();for(const [i,status] of ['pending','unsubscribed','bounced','complained','suppressed'].entries())f.contact(status,'RW','Africa',`blocked${i}@example.test`);
  const segment=f.segments.save({name:'All Africa',mode:'or',rules:[{field:'continent',operator:'eq',value:'Africa'},{field:'status',operator:'eq',value:'pending'}]});
  assert.equal(f.campaigns.preview({type:'segment',segmentId:segment.id}).eligible,1);
  assert.equal(f.campaigns.preview({type:'contacts',contactIds:[one,2,3,4,5,6]}).eligible,1);
  assert.equal((await f.request('/api/admin/segments/'+segment.id+'/preview','POST',{})).data.matched,6);
  assert.equal(f.segments.preview({name:'Injection',mode:'and',rules:[{field:'source_id',operator:'eq',value:"' OR 1=1 --"},{field:'country',operator:'eq',value:'XX'}]}).matched,0);
 }finally{await f.close();}
});

test('scheduled campaigns freeze content/rules and resolve current recipients only when due',async()=>{
 const f=await fixture();try{
  const first=f.contact(),newsletter=f.newsletters.save(content()),segment=f.segments.save({name:'Africa',mode:'and',rules:[{field:'continent',operator:'eq',value:'Africa'}]});
  const campaign=f.campaigns.save({name:'Scheduled demo',newsletterId:newsletter.id,audience:{type:'segment',segmentId:segment.id}}),now=Date.now();f.campaigns.launch(campaign.id,now+60000);
  f.newsletters.save({...content(),subject:'Changed after launch'},newsletter.id);f.segments.save({name:'Europe now',mode:'and',rules:[{field:'continent',operator:'eq',value:'Europe'}]},segment.id);
  const worker=new MarketingWorker(f.db,f.settings,async()=>assert.fail('No SMTP configured'));await worker.tick(now);assert.equal(f.db.prepare('SELECT count(*) n FROM email_queue').get()?.n,0);
  f.contacts.unsubscribeContact(first);const next=f.contact('confirmed','RW','Africa','later@example.test');await worker.tick(now+60001);
  const jobs=f.db.prepare('SELECT * FROM email_queue').all();assert.equal(jobs.length,1);assert.equal(jobs[0]!.contact_id,next);assert.equal(jobs[0]!.subject,'Welcome {name}');assert.equal(jobs[0]!.status,'pending');
  assert.throws(()=>f.campaigns.launch(campaign.id,now));assert.throws(()=>f.campaigns.save({name:'Edit',newsletterId:newsletter.id,audience:{type:'all'}},campaign.id));
 }finally{await f.close();}
});

test('marketing workers use durable claims, shared throttling and one job per campaign/contact',async()=>{
 const f=await fixture();try{
  f.smtp();f.contact();f.contact('confirmed','JP','Asia','second@example.test');const newsletter=f.newsletters.save(content()),campaign=f.campaigns.save({name:'Demo',newsletterId:newsletter.id,audience:{type:'all'}}),now=Date.now();f.campaigns.launch(campaign.id,now);
  let sent=0;const sender:MarketingSender=async(_smtp,_recipient,email,messageId)=>{sent++;assert.match(email.html,/Unsubscribe/);assert.match(messageId,/campaign-/);};
  const a=new MarketingWorker(f.db,f.settings,sender),b=new MarketingWorker(f.db,f.settings,sender);await Promise.all([a.tick(now),b.tick(now)]);assert.equal(sent,1);await b.tick(now+1000);assert.equal(sent,1);await a.tick(now+2000);assert.equal(sent,2);await b.tick(now+4000);assert.equal(sent,2);assert.equal(f.campaigns.get(campaign.id).status,'sent');
  assert.equal(f.db.prepare('SELECT count(*) n FROM email_queue').get()?.n,2);
 }finally{await f.close();}
});

test('pause, resume and cancel control pending jobs without duplicating completed sends',async()=>{
 const f=await fixture();try{
  f.smtp();f.contact();f.contact('confirmed','RW','Africa','second@example.test');const newsletter=f.newsletters.save(content()),campaign=f.campaigns.save({name:'Demo',newsletterId:newsletter.id,audience:{type:'all'}}),now=Date.now();f.campaigns.launch(campaign.id,now);f.campaigns.control(campaign.id,'pause');let sent=0;const worker=new MarketingWorker(f.db,f.settings,async()=>{sent++;});await worker.tick(now);assert.equal(sent,0);assert.equal(f.db.prepare('SELECT count(*) n FROM email_queue').get()?.n,0);
  f.campaigns.control(campaign.id,'resume');await worker.tick(now+2000);assert.equal(sent,1);f.campaigns.control(campaign.id,'pause');await worker.tick(now+4000);assert.equal(sent,1);f.campaigns.control(campaign.id,'resume');f.campaigns.control(campaign.id,'cancel');await worker.tick(now+6000);assert.equal(sent,1);assert.equal(f.campaigns.get(campaign.id).status,'cancelled');assert.equal(f.db.prepare("SELECT count(*) n FROM email_queue WHERE status='cancelled'").get()?.n,1);
 }finally{await f.close();}
});

test('unsubscribe and suppression after queue resolution prevent marketing sends',async()=>{
 const f=await fixture();try{
  const contact=f.contact(),newsletter=f.newsletters.save(content()),campaign=f.campaigns.save({name:'Demo',newsletterId:newsletter.id,audience:{type:'all'}}),now=Date.now();f.campaigns.launch(campaign.id,now);let sent=0;const worker=new MarketingWorker(f.db,f.settings,async()=>{sent++;});await worker.tick(now);assert.equal(f.db.prepare('SELECT status FROM email_queue').get()?.status,'pending');
  f.contacts.unsubscribeContact(contact);f.smtp();await worker.tick(now+2000);assert.equal(sent,0);assert.equal(f.db.prepare('SELECT status FROM email_queue').get()?.status,'cancelled');
  f.db.prepare("UPDATE contacts SET status='confirmed' WHERE id=?").run(contact);const second=f.campaigns.save({name:'Second demo',newsletterId:newsletter.id,audience:{type:'all'}});f.campaigns.launch(second.id,now+4000);f.campaigns.resolveDue(now+4000);f.db.prepare("UPDATE contacts SET status='suppressed' WHERE id=?").run(contact);await worker.tick(now+6000);assert.equal(sent,0);
 }finally{await f.close();}
});

test('marketing failures retry safe connection errors, redact errors and stop uncertain resends',async()=>{
 const f=await fixture();try{
  f.smtp();f.contact();const newsletter=f.newsletters.save(content()),campaign=f.campaigns.save({name:'Demo',newsletterId:newsletter.id,audience:{type:'all'}}),now=Date.now();f.campaigns.launch(campaign.id,now);let attempts=0;const worker=new MarketingWorker(f.db,f.settings,async()=>{attempts++;throw Object.assign(new Error('secret provider password'),{code:'ECONNREFUSED'});});
  await worker.tick(now);await worker.tick(now+30001);await worker.tick(now+90002);assert.equal(attempts,3);assert.equal(f.campaigns.get(campaign.id).status,'failed');assert.ok(!String(f.db.prepare('SELECT last_error FROM email_queue').get()?.last_error).includes('secret'));
  f.db.prepare("UPDATE email_queue SET status='processing',claimed_at=?").run(now-130000);await worker.tick(now+100000);assert.equal(attempts,3);assert.match(String(f.db.prepare('SELECT last_error FROM email_queue').get()?.last_error),/uncertain/);
 }finally{await f.close();}
});

test('safe tracking records unique events and disabling tracking preserves link delivery',async()=>{
 let html='';const f=await fixture();try{
  f.smtp();const contact=f.contact(),newsletter=f.newsletters.save(content()),campaign=f.campaigns.save({name:'Track demo',newsletterId:newsletter.id,audience:{type:'all'}}),now=Date.now();f.settings.save('tracking',{...f.settings.read().tracking,opens:true});f.campaigns.launch(campaign.id,now);await new MarketingWorker(f.db,f.settings,async(_smtp,_recipient,email)=>{html=email.html;}).tick(now);
  const raw=html.match(/\/email\/open\/([a-f0-9]{64})/)?.[1];assert.ok(raw);assert.equal(f.db.prepare('SELECT tracking_token_hash FROM email_queue').get()?.tracking_token_hash,tokenHash(raw));assert.ok(!JSON.stringify(f.campaigns.deliveries(campaign.id)).includes(raw));
  await fetch(f.base+`/email/open/${raw}.gif`);await fetch(f.base+`/email/open/${raw}.gif`);assert.equal(f.db.prepare("SELECT count(*) n FROM events WHERE type='email_opened'").get()?.n,1);
  const click=await fetch(f.base+`/email/click/${raw}/1`,{redirect:'manual'});assert.equal(click.status,302);assert.equal(click.headers.get('location'),'https://example.com/resource');await fetch(f.base+`/email/click/${raw}/1`,{redirect:'manual'});assert.equal(f.db.prepare("SELECT count(*) n FROM events WHERE type='email_clicked'").get()?.n,1);assert.ok(f.contacts.contact(contact).last_click_at);
  assert.equal(f.segments.preview({name:'Engaged',mode:'and',rules:[{field:'campaign_opened',operator:'eq',value:String(campaign.id)}]}).eligible,1);
  f.settings.save('tracking',{...f.settings.read().tracking,opens:false,emailClicks:false});assert.equal((await fetch(f.base+`/email/click/${raw}/1`,{redirect:'manual'})).status,302);assert.equal(f.db.prepare("SELECT count(*) n FROM events WHERE type='email_clicked'").get()?.n,1);
  assert.equal((await fetch(f.base+`/email/click/${'ff'.repeat(32)}/1`,{redirect:'manual'})).status,404);assert.equal((await fetch(f.base+`/email/click/${raw}/999`,{redirect:'manual'})).status,404);
  assert.match(html,/href="http:\/\/localhost:5173\/unsubscribe\/[a-f0-9]{64}"/);
 }finally{await f.close();}
});

test('scheduled queue state survives reopening the SQLite database',async()=>{
 const f=await fixture(undefined,true);try{
  f.contact();const newsletter=f.newsletters.save(content()),campaign=f.campaigns.save({name:'Persistent demo',newsletterId:newsletter.id,audience:{type:'all'}}),now=Date.now();f.campaigns.launch(campaign.id,now);await new MarketingWorker(f.db,f.settings,async()=>assert.fail('SMTP absent')).tick(now);
  f.db.close();const reopened=openDatabase(f.path);try{assert.equal(migrate(reopened),20);assert.equal(reopened.prepare('SELECT status FROM email_queue').get()?.status,'pending');assert.equal(new CampaignStore(reopened).get(campaign.id).status,'sending');}finally{reopened.close();}
 }finally{await f.close();}
});

test('HTTP newsletter to scheduled campaign delivers through local SMTP without browser requests, then unsubscribe excludes future campaigns',async()=>{
 const f=await fixture(),sockets=new Set<Socket>();let received:(raw:string)=>void=()=>{};const captured=new Promise<string>(resolve=>{received=resolve;});
 const smtp=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 local.test ESMTP\r\n');let buffer='',data=false,message='';socket.on('data',chunk=>{buffer+=chunk;let at:number;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at).replace(/\r$/,'');buffer=buffer.slice(at+1);if(data){if(line==='.'){received(message);data=false;socket.write('250 Captured\r\n');}else message+=line+'\n';}else if(/^(EHLO|HELO) /i.test(line))socket.write('250-local.test\r\n250 PIPELINING\r\n');else if(line==='DATA'){data=true;socket.write('354 Send\r\n');}else if(line==='QUIT')socket.end('221 Bye\r\n');else socket.write('250 OK\r\n');}});});
 smtp.listen(0,'127.0.0.1');await new Promise<void>(resolve=>smtp.once('listening',resolve));let stop:(()=>Promise<void>)|undefined;
 try{
  f.settings.save('smtp',{host:'127.0.0.1',port:(smtp.address() as AddressInfo).port,encryption:'none',username:'',fromName:'Demo',fromEmail:'sender@example.test',replyTo:''});f.settings.save('compliance',{...f.settings.read().compliance,doubleOptIn:false});
  assert.equal((await f.request('/api/public/subscribe','POST',{name:'Demo Reader',email:'reader@example.test',country:'RW',consent:true,source:{type:'footer',id:'footer'}},false)).status,202);
  const newsletter=(await f.request('/api/admin/newsletters','POST',content())).data,segment=(await f.request('/api/admin/segments','POST',{name:'African readers',mode:'and',rules:[{field:'continent',operator:'eq',value:'Africa'}]})).data;
  const campaign=(await f.request('/api/admin/campaigns','POST',{name:'Scheduled demo',newsletterId:newsletter.id,audience:{type:'segment',segmentId:segment.id}})).data;
  assert.equal((await f.request(`/api/admin/campaigns/${campaign.id}/launch`,'POST',{mode:'schedule',scheduledAt:new Date(Date.now()+1500).toISOString()})).status,202);
  stop=new MarketingWorker(f.db,f.settings).start();const timeout=setTimeout(()=>received('TIMEOUT'),10000);const raw=await captured;clearTimeout(timeout);assert.notEqual(raw,'TIMEOUT');await stop();stop=undefined;
  assert.match(raw,/List-Unsubscribe:/i);assert.match(raw,/List-Unsubscribe-Post: List-Unsubscribe=One-Click/i);assert.match(raw,/Demo Reader/);assert.equal(f.campaigns.get(campaign.id).status,'sent');
  const body=raw.replace(/=\n/g,'').replace(/=3D/g,'='),unsubscribe=body.match(/\/unsubscribe\/([a-f0-9]{64})/)?.[1];assert.ok(unsubscribe);
  const endpoint=f.base+`/api/public/unsubscribe/${unsubscribe}/one-click`;
  assert.equal((await fetch(endpoint)).status,405);assert.equal(f.campaigns.preview({type:'all'}).eligible,1);
  assert.equal((await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=wrong'})).status,400);
  assert.equal((await fetch(f.base+'/api/public/unsubscribe/'+ 'ab'.repeat(32)+'/one-click',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'})).status,400);
  for(let i=0;i<2;i++)assert.equal((await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'})).status,200);
  assert.equal(f.campaigns.preview({type:'all'}).eligible,0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM events WHERE type='unsubscribed'").get()?.n,1);
  const deliveries=await f.request(`/api/admin/campaigns/${campaign.id}/deliveries`);assert.equal(deliveries.data.jobs[0].status,'sent');assert.ok(!JSON.stringify(deliveries.data).includes(unsubscribe));
 }finally{if(stop)await stop();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>smtp.close(()=>resolve()));await f.close();}
});


test('a connection closed with uncertain SMTP acceptance is never automatically retried',async()=>{
 const f=await fixture();try{
  f.smtp();f.contact();const newsletter=f.newsletters.save(content()),campaign=f.campaigns.save({name:'Uncertain delivery demo',newsletterId:newsletter.id,audience:{type:'all'}}),now=Date.now();f.campaigns.launch(campaign.id,now);let attempts=0;
  const worker=new MarketingWorker(f.db,f.settings,async()=>{attempts++;throw Object.assign(new Error('private provider details'),{code:'ECONNECTION',command:'CONN'});});await worker.tick(now);await worker.tick(now+60000);
  assert.equal(attempts,1);assert.equal(f.campaigns.get(campaign.id).status,'failed');assert.match(String(f.db.prepare('SELECT last_error FROM email_queue').get()?.last_error),/uncertain/);
 }finally{await f.close();}
});

test('cancelling during an in-flight send keeps its actual delivery result and cancels later jobs',async()=>{
 const f=await fixture();let release:()=>void=()=>{};try{
  f.smtp();f.contact();f.contact('confirmed','RW','Africa','second@example.test');const newsletter=f.newsletters.save(content()),campaign=f.campaigns.save({name:'In-flight demo',newsletterId:newsletter.id,audience:{type:'all'}}),now=Date.now();f.campaigns.launch(campaign.id,now);
  let entered:()=>void=()=>{};const sending=new Promise<void>(resolve=>{entered=resolve;});const worker=new MarketingWorker(f.db,f.settings,async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});});
  const tick=worker.tick(now);await sending;f.campaigns.control(campaign.id,'cancel');release();await tick;
  assert.equal(f.campaigns.get(campaign.id).status,'cancelled');assert.equal(f.db.prepare("SELECT count(*) n FROM email_queue WHERE status='sent'").get()?.n,1);assert.equal(f.db.prepare("SELECT count(*) n FROM email_queue WHERE status='cancelled'").get()?.n,1);
 }finally{release();await f.close();}
});


test('multi-country and continent segments remain reusable, parameterized and confirmed-only for campaigns',async()=>{
 const f=await fixture();try{
  f.contact('confirmed','RW','Africa','rw@example.test');f.contact('confirmed','KE','Africa','ke@example.test');f.contact('confirmed','FR','Europe','fr@example.test');f.contact('pending','KE','Africa','pending@example.test');f.contact('suppressed','RW','Africa','blocked@example.test');
  const data={name:'East Africa',mode:'and',rules:[{field:'country',operator:'in',value:'RW|KE'}]};
  const saved=await f.request('/api/admin/segments','POST',data);assert.equal(saved.status,201);assert.equal(saved.data.rules[0].value,'RW|KE');
  assert.equal(f.segments.preview(data).matched,4);assert.equal(f.segments.preview(data).eligible,2);
  const audience=await f.request('/api/admin/audience-preview','POST',{type:'segment',segmentId:saved.data.id});assert.equal(audience.status,200);assert.equal(audience.data.eligible,2);
  assert.equal(f.segments.preview({name:'Continents',mode:'and',rules:[{field:'continent',operator:'in',value:'Africa|Europe'}]}).eligible,3);
  assert.equal(f.segments.preview({name:'Injection',mode:'and',rules:[{field:'country',operator:'in',value:"RW|ZZ') OR 1=1 --"}]}).matched,2);
  for(const rule of [{field:'source_id',operator:'in',value:'a|b'},{field:'country',operator:'in',value:'RW||KE'},{field:'country',operator:'in',value:''}])assert.equal((await f.request('/api/admin/segments','POST',{name:'Invalid',mode:'and',rules:[rule]})).status,400);
 }finally{await f.close();}
});

test('email centre locks system confirmation copy and tests never create subscriber tokens',async()=>{
 let sent=0;const f=await fixture(async(_smtp,_recipient,email)=>{sent++;assert.match(email.subject,/^\[TEST\]/);assert.match(email.text,/demo-preview/);});try{
  assert.equal((await f.request('/api/admin/email-centre','GET',undefined,false)).status,401);
  const before=(await f.request('/api/admin/content')).data.sections.signup;
  const template={confirmationSubject:'Please confirm {siteName}',confirmationBody:'Hi {name}, confirm your address.'};assert.equal((await f.request('/api/admin/confirmation-template','PUT',template)).status,409);
  const after=(await f.request('/api/admin/content')).data.sections.signup;assert.equal(after.headline,before.headline);assert.equal(after.confirmationSubject,before.confirmationSubject);
  const preview=await f.request('/api/admin/confirmation-preview','POST',template);assert.equal(preview.status,200);assert.match(preview.data.text,/confirm\/demo-preview/);assert.match(preview.data.text,/unsubscribe\/demo-preview/);
  assert.equal((await f.request('/api/admin/confirmation-test','POST',{recipient:'test@example.test'})).status,200);assert.equal(sent,1);assert.equal(f.db.prepare('SELECT count(*) n FROM contact_tokens').get()!.n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM transactional_outbox').get()!.n,0);
  assert.equal((await f.request('/api/admin/confirmation-template','PUT',{...template,confirmationSubject:'bad\nsubject'})).status,409);
  const n=f.newsletters.save(content()),c=f.campaigns.save({name:'Original',newsletterId:n.id,audience:{type:'all'}});const copy=await f.request('/api/admin/campaigns/'+c.id+'/duplicate','POST',{});assert.equal(copy.status,201);assert.equal(copy.data.status,'draft');assert.notEqual(copy.data.id,c.id);
 }finally{await f.close();}
});

test('segment workspace previews paginate eligible and excluded audiences without changing send eligibility',async()=>{
 const f=await fixture();try{
  for(let i=0;i<38;i++)f.contact(i<31?'confirmed':'pending','RW','Africa',`segment-${i}@example.test`);
  const input={name:'Africa readers',mode:'and',rules:[{field:'continent',operator:'eq',value:'Africa'}]};
  const p=await f.request('/api/admin/segment-preview?page=2&view=eligible','POST',input);assert.equal(p.status,200);assert.equal(p.data.matched,38);assert.equal(p.data.eligible,31);assert.equal(p.data.total,31);assert.equal(p.data.contacts.length,6);assert.ok(p.data.contacts.every((c:{status:string})=>c.status==='confirmed'));
  const excluded=await f.request('/api/admin/segment-preview?view=excluded','POST',input);assert.equal(excluded.data.total,7);assert.ok(excluded.data.contacts.every((c:{status:string})=>c.status==='pending'));
  const broad=await f.request('/api/admin/segment-preview?view=all','POST',{...input,mode:'or',rules:[{field:'status',operator:'eq',value:'confirmed'},{field:'country',operator:'eq',value:'US'}]});assert.equal(broad.data.matched,31);
  assert.equal((await f.request('/api/admin/segment-preview?page=0','POST',input)).status,400);assert.equal((await f.request('/api/admin/segment-preview?view=invalid','POST',input)).status,400);assert.equal((await f.request('/api/admin/segment-options','GET',undefined,false)).status,401);
 }finally{await f.close();}
});

test('segment workspace duplication and connection restrictions preserve frozen campaigns and paused schedules',async()=>{
 const f=await fixture();try{
  const contact=f.contact(),n=f.newsletters.save(content()),s=f.segments.save({name:'Africa',mode:'and',rules:[{field:'continent',operator:'eq',value:'Africa'}]});f.contacts.setTags(contact,['tools']);
  const c=f.campaigns.save({name:'Audience draft',newsletterId:n.id,audience:{type:'segment',segmentId:s.id}});
  const opts=await f.request('/api/admin/segment-options');assert.equal(opts.data.tags[0].name,'tools');assert.equal(opts.data.sources[0].source_label,'Footer');assert.equal(opts.data.campaigns[0].id,c.id);
  const connections=await f.request(`/api/admin/segments/${s.id}/connections`);assert.equal(connections.data.campaigns[0].status,'draft');assert.equal((await f.request(`/api/admin/segments/${s.id}`,'DELETE')).status,409);
  const copy=await f.request(`/api/admin/segments/${s.id}/duplicate`,'POST',{});assert.equal(copy.status,201);assert.notEqual(copy.data.id,s.id);assert.equal((await f.request(`/api/admin/segments/${copy.data.id}/connections`)).data.campaigns.length,0);
  f.campaigns.launch(c.id,Date.now()+60000);const frozen=f.campaigns.get(c.id).audience;f.segments.save({name:'Europe instead',mode:'and',rules:[{field:'continent',operator:'eq',value:'Europe'}]},s.id);assert.deepEqual(f.campaigns.get(c.id).audience,frozen);
  const schedule=f.campaigns.saveRecurring({name:'Paused daily',newsletterId:n.id,audience:{type:'segment',segmentId:s.id},interval:'daily',timezone:'Africa/Kigali',localTime:'09:00',startDate:new Date().toISOString().slice(0,10)})!;
  assert.equal((await f.request(`/api/admin/segments/${s.id}/connections`)).data.schedules[0].status,'paused');assert.equal((await f.request(`/api/admin/segments/${s.id}`,'DELETE')).status,409);
  f.db.prepare('DELETE FROM recurring_campaigns WHERE id=?').run(schedule.id);assert.equal((await f.request(`/api/admin/segments/${s.id}`,'DELETE')).status,200);assert.deepEqual(f.campaigns.get(c.id).audience,frozen);
 }finally{await f.close();}
});


test('direct continent send is idempotent, reuses a saved campaign and excludes unconfirmed contacts',async()=>{
 const f=await fixture();try{
  f.smtp();f.contact('confirmed','RW','Africa','africa@example.test');f.contact('confirmed','JP','Asia','asia@example.test');f.contact('confirmed','DE','Europe','europe@example.test');f.contact('pending','RW','Africa','pending@example.test');f.contact('unsubscribed','JP','Asia','unsubscribed@example.test');
  const saved=await f.request('/api/admin/newsletters','POST',{...content(),status:'draft'});assert.equal(saved.status,201);const n=saved.data;
  const original=f.campaigns.save({name:'Saved campaign',newsletterId:n.id,audience:{type:'all'}});
  const d={requestKey:crypto.randomUUID(),campaignId:original.id,newsletterId:n.id,continents:['Africa','Asia'],revision:n.updated_at};
  assert.equal((await f.request('/api/admin/broadcast-send','POST',d,false)).status,401);
  const [a,b]=await Promise.all([f.request('/api/admin/broadcast-send','POST',d),f.request('/api/admin/broadcast-send','POST',d)]);assert.equal(a.status,202);assert.equal(b.status,202);assert.equal(a.data.id,original.id);assert.equal(b.data.id,original.id);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()!.n,1);
  assert.equal((await f.request('/api/admin/broadcast-send','POST',{...d,continents:['Europe']})).status,409);
  const sent:string[]=[];const worker=new MarketingWorker(f.db,f.settings,async(_smtp,to)=>{sent.push(to);});const now=Date.now()+2100;await worker.tick(now);await worker.tick(now+2100);await worker.tick(now+4200);assert.deepEqual(sent.sort(),['africa@example.test','asia@example.test']);assert.equal(f.db.prepare('SELECT count(*) n FROM email_queue').get()!.n,2);
  assert.equal((await f.request('/api/admin/broadcast-send','POST',d)).data.id,original.id);await worker.tick(now+6300);assert.equal(sent.length,2);
 }finally{await f.close();}
});

test('direct send rejects unsaved revisions, empty audiences, missing SMTP and protected funnel links',async()=>{
 const f=await fixture();try{
  f.contact();const n=(await f.request('/api/admin/newsletters','POST',content())).data;const d={requestKey:crypto.randomUUID(),newsletterId:n.id,continents:['Africa'],revision:n.updated_at};
  assert.equal((await f.request('/api/admin/broadcast-send','POST',d)).status,400);f.smtp();
  assert.equal((await f.request('/api/admin/broadcast-send','POST',{...d,revision:'stale'})).status,409);
  assert.equal((await f.request('/api/admin/broadcast-send','POST',{...d,continents:[]})).status,400);
  assert.equal((await f.request('/api/admin/broadcast-send','POST',{...d,continents:['Oceania']})).status,400);
  assert.equal((await f.request('/api/admin/broadcast-send','POST',{...d,continents:['Invalid']})).status,400);
  const resource=(await f.request('/api/admin/newsletters','POST',{...content(),html:'<a href="{downloadUrl}">Download</a>'})).data;
  assert.equal((await f.request('/api/admin/broadcast-send','POST',{...d,newsletterId:resource.id,revision:resource.updated_at})).status,400);
  assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()!.n,0);
 }finally{await f.close();}
});


test('saved email libraries separate newsletter and campaign workspaces and paginate searches',async()=>{
 const f=await fixture();try{
  const newsletter=f.newsletters.save({...content(),title:'Newsletter-only',workspace:'newsletter'}),campaign=f.newsletters.save({...content(),title:'Campaign-only',workspace:'campaign'});
  for(let i=0;i<26;i++)f.newsletters.save({...content(),title:'Campaign entry '+i,workspace:'campaign'});
  const n=await f.request('/api/admin/saved-email-library?workspace=newsletter');assert.equal(n.status,200);assert.deepEqual(n.data.items.map((r:{id:number})=>r.id),[newsletter.id]);
  const c=await f.request('/api/admin/saved-email-library?workspace=campaign&page=2');assert.equal(c.data.total,27);assert.equal(c.data.items.length,2);
  const search=await f.request('/api/admin/saved-email-library?workspace=campaign&search=Campaign-only');assert.deepEqual(search.data.items.map((r:{id:number})=>r.id),[campaign.id]);
  assert.equal((await f.request('/api/admin/saved-email-library?workspace=campaign','GET',undefined,false)).status,401);
  assert.equal(f.newsletters.duplicate(campaign.id).workspace,'campaign');
 }finally{await f.close();}
});

test('saved send history reuses frozen content and archive keeps delivery and idempotency records',async()=>{
 const f=await fixture();try{
  const n=f.newsletters.save({...content(),title:'Campaign original',subject:'Original subject',workspace:'campaign'}),c=f.campaigns.save({name:'Sent promotion',newsletterId:n.id,audience:{type:'all'}});
  f.campaigns.launch(c.id,Date.now());f.newsletters.save({...content(),title:'Changed current email',subject:'New subject',workspace:'campaign'},n.id);
  f.db.prepare("UPDATE campaigns SET status='sent',completed_at=? WHERE id=?").run(new Date().toISOString(),c.id);
  f.db.prepare('INSERT INTO broadcast_requests(request_key,fingerprint,campaign_id) VALUES(?,?,?)').run('fixture-request','fixture-fingerprint',c.id);
  const history=await f.request('/api/admin/saved-email-history?workspace=campaign&status=sent');assert.equal(history.data.total,1);assert.equal(history.data.items[0].subject,'Original subject');
  assert.equal((await f.request('/api/admin/saved-email-history?workspace=newsletter')).data.total,0);
  const reused=await f.request(`/api/admin/campaigns/${c.id}/reuse-email`,'POST',{workspace:'campaign'});assert.equal(reused.status,201);assert.equal(reused.data.subject,'Original subject');assert.equal(reused.data.status,'draft');assert.notEqual(reused.data.id,n.id);
  const preview=await f.request(`/api/admin/campaigns/${c.id}/preview`);assert.equal(preview.data.subject,'Original subject');
  assert.equal((await f.request(`/api/admin/campaigns/${c.id}`,'DELETE')).status,200);assert.equal(f.campaigns.history('campaign').total,0);assert.equal(f.db.prepare('SELECT count(*) n FROM broadcast_requests').get()?.n,1);assert.equal(f.campaigns.get(c.id).status,'sent');
  assert.equal((await f.request(`/api/admin/newsletters/${n.id}`,'DELETE')).status,200);assert.equal(f.newsletters.list('campaign').some(r=>r.id===n.id),false);assert.equal(f.newsletters.get(n.id).subject,'New subject');
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{await f.close();}
});

test('active campaign deletion and archived draft relaunch are blocked without changing queues',async()=>{
 const f=await fixture();try{
  const n=f.newsletters.save({...content(),workspace:'campaign'}),c=f.campaigns.save({name:'Active send',newsletterId:n.id,audience:{type:'all'}});f.campaigns.launch(c.id,Date.now());
  assert.equal((await f.request(`/api/admin/campaigns/${c.id}`,'DELETE')).status,409);assert.equal(f.campaigns.get(c.id).status,'scheduled');
  const draft=f.campaigns.save({name:'Draft deleted',newsletterId:n.id,audience:{type:'all'}});f.campaigns.archive(draft.id);assert.throws(()=>f.campaigns.launch(draft.id,Date.now()),/already been launched/);assert.throws(()=>f.campaigns.save({name:'Changed',newsletterId:n.id,audience:{type:'all'}},draft.id),/Only drafts/);
 }finally{await f.close();}
});
