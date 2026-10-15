import { TransactionalWorker } from '../src/mail/worker.js';
import { HeroHeader } from '../../client/src/public/HeroHeader.js';
import { get as httpGet } from 'node:http';
import { FunnelDomains } from '../src/lead-pages/domains.js';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { leadTemplates,templateData } from '../../client/src/admin/leadTemplates.js';
import { ProductFacts } from '../../client/src/public/ProductFacts.js';
import { PublicFooter } from '../../client/src/public/PublicFooter.js';
import { ResourceView } from '../../client/src/public/ResourceView.js';
import { LeadExperience } from '../../client/src/public/LeadExperience.js';
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
import { LeadPageStore,pageTypes } from '../src/lead-pages/store.js';
import { AutomationStore } from '../src/automations/store.js';
import { LocalStorage } from '../src/media/storage.js';
import { decryptSecret } from '../src/security/crypto.js';
import { pageMetadata,renderPageHtml } from '../src/seo.js';
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
 async function request(path:string,method='GET',body?:unknown,auth=true){const response=await fetch(base+path,{method,headers:{Connection:'close',...(auth?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});const set=response.headers.getSetCookie().at(-1);if(set)cookie=set.split(';')[0]!;const data=await response.json();if(data.csrfToken)csrf=data.csrfToken;return{status:response.status,data};}
 await request('/api/auth/session');assert.equal((await request('/api/auth/login','POST',{email:'owner@example.test',password})).status,200);
 function contact(status='confirmed',country='RW',continent='Africa',email='subscriber@example.test',name='Demo Subscriber'){return Number(db.prepare("INSERT INTO contacts(name,email,country,continent,status,source_type,source_id,source_label,confirmed_at) VALUES(?,?,?,?,?,'footer','footer','Footer',?)").run(name,email,country,continent,status,status==='confirmed'?new Date().toISOString():null).lastInsertRowid);}
 function smtp(){settings.save('smtp',{host:'127.0.0.1',port:587,encryption:'starttls',username:'',fromName:'Demo',fromEmail:'sender@example.test',replyTo:''});}
 return{pages:new LeadPageStore(db),automations:new AutomationStore(db),directory,db,path,base,settings,newsletters,segments,campaigns,contacts,request,contact,smtp,cookie:()=>cookie,close:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));if(db.isOpen)db.close();for(const file of readdirSync(directory))rmSync(join(directory,file));rmdirSync(directory);}};
}


const pageInput=(resourceId:number|null=null,automationId:number|null=null)=>({name:'Demo lead page',slug:'demo-guide',type:'lead_magnet',status:'active',data:{headline:'Get the demo guide',subheadline:'Fictional guide',description:'Demo content',body:'Some instructions',cta:'Get guide',imageId:null,videoId:null,resourceId,automationId,tags:['guide'],confirmationSubject:'Confirm your guide',confirmationBody:'Hello {name}\n{confirmationUrl}\n{unsubscribeUrl}',successHeadline:'Your guide is ready',successMessage:'Download below.',returnLabel:'Return',returnUrl:'/',offerId:null,questions:[]}});
const connectedPage=(f:Awaited<ReturnType<typeof fixture>>,input=pageInput())=>({...input,data:{...input.data,directNewsletterId:f.newsletters.save(content()).id}});
const signup=(email='subscriber@example.test',answers={})=>({name:'Demo Reader',email,country:'RW',consent:true,source:{type:'lead_page',id:'demo-guide'},answers});
function confirmation(db:ReturnType<typeof openDatabase>){const row=db.prepare("SELECT payload FROM transactional_outbox WHERE purpose='confirmation' ORDER BY id DESC LIMIT 1").get()!;return JSON.parse(decryptSecret(String(row.payload),key,'contact-mail')).text.match(/\/confirm\/([a-f0-9]{64})/)[1] as string;}
function resource(f:Awaited<ReturnType<typeof fixture>>){const bytes=Buffer.from('Fictional private guide.');const storageName=new LocalStorage(f.directory).save(bytes,'txt');return Number(f.db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES('demo-guide.txt',?,'text/plain',?,'txt','document','private')").run(storageName,bytes.length).lastInsertRowid);}
function sequence(f:Awaited<ReturnType<typeof fixture>>,status='running'){const n=f.newsletters.save({...content(),html:'<p>Welcome {name}</p><a href="{downloadUrl}">Download guide</a><a href="https://example.com/resource">Learn more</a>'});const a=f.automations.save({name:'Demo sequence',status,steps:[{delayMinutes:0,newsletterId:n.id},{delayMinutes:1,newsletterId:n.id},{delayMinutes:3,newsletterId:n.id}]});return{n,a};}

test('lead-page CRUD validates presets, privacy, duplicate slugs and inactive public access',async()=>{
 const f=await fixture();try{
  const connected=connectedPage(f);const saved=await f.request('/api/admin/lead-pages','POST',connected);assert.equal(saved.status,201);const result=await f.request('/api/public/lead-pages/demo-guide','GET',undefined,false);assert.equal(result.status,200);assert.ok(!('confirmationBody' in result.data.data));assert.ok(!('resourceId' in result.data.data));
  assert.equal((await f.request('/api/admin/lead-pages','GET',undefined,false)).status,401);assert.equal((await f.request('/api/admin/lead-pages','POST',connected)).status,409);
  const p=f.pages.get(saved.data.id);f.pages.save({...pageInput(),status:'inactive'},p.id);assert.equal((await f.request('/api/public/lead-pages/demo-guide','GET',undefined,false)).status,404);assert.equal((await f.request('/api/public/subscribe','POST',signup(),false)).status,404);assert.equal(f.db.prepare('SELECT count(*) n FROM contacts').get()?.n,0);
  assert.throws(()=>f.pages.save({...pageInput(),slug:'other',data:{...pageInput().data,returnUrl:'javascript:alert(1)'}}));
 }finally{await f.close();}
});

test('page questions retain validated answers and lead pages require confirmation even with global single opt-in',async()=>{
 const f=await fixture();try{
  f.pages.save({...pageInput(),type:'survey',data:{...pageInput().data,questions:[{key:'interest',label:'What interests you?',required:true,options:['Books','Tools']}]}});f.settings.save('compliance',{...f.settings.read().compliance,doubleOptIn:false});
  assert.equal((await f.request('/api/public/subscribe','POST',signup(),false)).status,400);assert.equal((await f.request('/api/public/subscribe','POST',signup('subscriber@example.test',{interest:'Invalid'}),false)).status,400);assert.equal(f.db.prepare('SELECT count(*) n FROM contacts').get()?.n,0);
  assert.equal((await f.request('/api/public/subscribe','POST',signup('subscriber@example.test',{interest:'Books'}),false)).status,202);assert.equal(f.contacts.contact(1).status,'pending');assert.equal(JSON.parse(String(f.db.prepare('SELECT page_snapshot FROM lead_submissions').get()?.page_snapshot)).answers.interest,'Books');
  f.contacts.confirm(confirmation(f.db));assert.equal(f.contacts.contact(1).status,'confirmed');assert.deepEqual(f.contacts.contact(1).tags.map(t=>t.name),['guide']);
 }finally{await f.close();}
});

test('confirmation unlocks the original private resource and enrolls exactly once after page edits/deactivation',async()=>{
 const f=await fixture();try{
  const media=resource(f),{a}=sequence(f),p=f.pages.save(pageInput(media,a.id));f.contacts.signup(signup());const raw=confirmation(f.db);assert.equal(f.db.prepare('SELECT count(*) n FROM automation_enrollments').get()?.n,0);assert.equal(f.contacts.inspect(raw,'confirm').downloadUrl,null);
  f.pages.save({...pageInput(),status:'inactive'},p.id);const confirmed=f.contacts.confirm(raw);assert.ok(confirmed.downloadUrl);assert.equal(confirmed.headline,'Your guide is ready');f.contacts.confirm(raw);assert.equal(f.db.prepare('SELECT count(*) n FROM automation_enrollments').get()?.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()?.n,3);
  assert.equal((await fetch(f.base+'/media/'+media)).status,404);const response=await fetch(f.base+confirmed.downloadUrl);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition')||'',/attachment/);assert.equal(await response.text(),'Fictional private guide.');assert.equal(f.db.prepare("SELECT count(*) n FROM events WHERE type='resource_downloaded'").get()?.n,1);
  assert.equal((await f.request('/api/admin/media/'+media,'DELETE')).status,409);assert.equal((await f.request('/api/public/subscribe','POST',signup('another@example.test'),false)).status,404);
 }finally{await f.close();}
});

test('download links reject forged, expired and unsubscribed access',async()=>{
 const f=await fixture();try{
  f.pages.save(pageInput(resource(f)));f.contacts.signup(signup());const info=f.contacts.confirm(confirmation(f.db));assert.ok(info.downloadUrl);assert.equal((await fetch(f.base+'/download/'+ 'ab'.repeat(32))).status,404);
  f.db.prepare('UPDATE download_tokens SET expires_at=0').run();assert.equal((await fetch(f.base+info.downloadUrl)).status,410);const next=f.contacts.inspect(confirmation(f.db),'confirm');f.contacts.unsubscribeContact(1);assert.equal((await fetch(f.base+next.downloadUrl)).status,403);
 }finally{await f.close();}
});

test('sequence timing, snapshots and shared worker delivery survive page deactivation and automation edits',async()=>{
 const f=await fixture();try{
  f.smtp();const {n,a}=sequence(f),p=f.pages.save(pageInput(resource(f),a.id));f.contacts.signup(signup());f.contacts.confirm(confirmation(f.db));const campaigns=f.db.prepare('SELECT * FROM campaigns ORDER BY automation_step_position').all(),now=Number(campaigns[0]!.scheduled_at);assert.equal(Number(campaigns[1]!.scheduled_at)-now,60000);assert.equal(Number(campaigns[2]!.scheduled_at)-now,180000);
  f.pages.save({...pageInput(),status:'inactive'},p.id);f.newsletters.save({...content(),subject:'Changed for future enrollments'},n.id);let sends=0;const worker=new MarketingWorker(f.db,f.settings,async(_s,_r,email)=>{sends++;assert.match(email.html,/\/download\/[a-f0-9]{64}/);assert.equal(email.subject,'Welcome Demo Reader');});
  await worker.tick(now);assert.equal(sends,1);await worker.tick(now+59999);assert.equal(sends,1);await worker.tick(now+60000);assert.equal(sends,2);await worker.tick(now+180000);assert.equal(sends,3);assert.equal(f.db.prepare('SELECT status FROM automation_enrollments').get()?.status,'completed');assert.equal(f.campaigns.list().length,0);
 }finally{await f.close();}
});

test('paused automation holds enrollments and resumes overdue steps; unsubscribe cancels permanently',async()=>{
 const f=await fixture();try{
  f.smtp();const {a}=sequence(f,'paused');f.pages.save(pageInput(null,a.id));f.contacts.signup(signup());f.contacts.confirm(confirmation(f.db));const now=Date.now();let sends=0;const worker=new MarketingWorker(f.db,f.settings,async()=>{sends++;});await worker.tick(now+200000);assert.equal(sends,0);
  f.automations.save({name:a.name,status:'running',steps:a.steps},a.id);await worker.tick(now+200001);assert.equal(sends,1);f.contacts.unsubscribeContact(1);await worker.tick(now+202002);assert.equal(sends,1);assert.equal(f.db.prepare('SELECT status FROM automation_enrollments').get()?.status,'cancelled');f.db.prepare("UPDATE contacts SET status='confirmed' WHERE id=1").run();f.automations.enroll(a.id,1,1);assert.equal(f.db.prepare('SELECT count(*) n FROM automation_enrollments').get()?.n,1);
 }finally{await f.close();}
});
test('sequence state survives SQLite reopen and ready newsletter deletion is blocked',async()=>{
 const f=await fixture(undefined,true);try{
  const {n,a}=sequence(f);f.pages.save(pageInput(null,a.id));f.contacts.signup(signup());f.contacts.confirm(confirmation(f.db));assert.throws(()=>f.newsletters.remove(n.id));assert.equal((await f.request('/api/admin/campaigns/1/pause','POST',{})).status,409);
  f.db.close();const reopened=openDatabase(f.path);try{assert.equal(migrate(reopened),18);assert.equal(reopened.prepare('SELECT count(*) n FROM automation_enrollments').get()?.n,1);assert.equal(reopened.prepare('SELECT count(*) n FROM campaigns').get()?.n,3);}finally{reopened.close();}
 }finally{await f.close();}
});

test('automation begins on its scheduler without further browser requests',async()=>{
 const f=await fixture();let stop:(()=>Promise<void>)|undefined;try{
  f.smtp();const n=f.newsletters.save(content()),a=f.automations.save({name:'Timer demo',status:'running',steps:[{delayMinutes:0,newsletterId:n.id}]});f.pages.save(pageInput(null,a.id));f.contacts.signup(signup());f.contacts.confirm(confirmation(f.db));let receive:()=>void=()=>{};const received=new Promise<void>(resolve=>{receive=resolve;});stop=new MarketingWorker(f.db,f.settings,async()=>{receive();}).start();let timeout:ReturnType<typeof setTimeout>;await Promise.race([received,new Promise<void>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('Worker timeout')),5000);})]).finally(()=>clearTimeout(timeout));await stop();stop=undefined;assert.equal(f.db.prepare('SELECT status FROM automation_enrollments').get()?.status,'completed');
 }finally{if(stop)await stop();await f.close();}
});


test('a replaced page token cannot confirm a new source for an already confirmed subscriber',async()=>{
 const f=await fixture();try{
  f.contact();f.pages.save(pageInput());f.contacts.signup(signup());const old=confirmation(f.db);f.db.prepare('UPDATE contacts SET last_confirmation_at=0 WHERE id=1').run();f.contacts.resendConfirmation('subscriber@example.test',{type:'lead_page',id:'demo-guide'});const fresh=confirmation(f.db);assert.equal(f.db.prepare('SELECT count(*) n FROM lead_submissions').get()?.n,1);assert.notEqual(fresh,old);assert.equal(f.contacts.inspect(old,'confirm').completed,false);assert.throws(()=>f.contacts.confirm(old));f.contacts.confirm(fresh);assert.equal(f.contacts.inspect(fresh,'confirm').completed,true);
 }finally{await f.close();}
});


test('draft edits preserve the published page and acquisition snapshot until explicitly published',async()=>{
 const f=await fixture();try{
  const live=f.pages.save(pageInput());
  const connected=connectedPage(f);const changed={...connected,data:{...connected.data,headline:'An unpublished headline',layout:'focused'}};
  const saved=await f.request(`/api/admin/lead-pages/${live.id}/draft`,'PUT',changed);
  assert.equal(saved.status,200);assert.equal(saved.data.hasUnpublishedChanges,true);
  assert.equal(f.pages.active(live.slug).data.headline,'Get the demo guide');
  await f.request('/api/public/subscribe','POST',signup());
  const snapshot=JSON.parse(String(f.db.prepare('SELECT page_snapshot FROM lead_submissions').get()?.page_snapshot));
  assert.equal(snapshot.headline,'Get the demo guide');
  assert.equal((await f.request(`/api/admin/lead-pages/${live.id}/publish`,'POST',{})).status,200);
  assert.equal(f.pages.active(live.slug).data.headline,'An unpublished headline');
  assert.equal(f.pages.get(live.id).hasUnpublishedChanges,false);
  assert.equal((await f.request(`/api/admin/lead-pages/${live.id}/draft`,'PUT',{...changed,slug:'changed-live-url'})).status,409);
 }finally{await f.close();}
});

test('draft creation, duplication and pause are authorized operations with separate public visibility',async()=>{
 const f=await fixture();try{
  assert.equal((await f.request('/api/admin/lead-pages/drafts','POST',pageInput(),false)).status,401);
  const draft=await f.request('/api/admin/lead-pages/drafts','POST',connectedPage(f));
  assert.equal(draft.status,201);assert.equal(draft.data.status,'draft');
  assert.equal((await f.request('/api/public/lead-pages/demo-guide')).status,404);
  await f.request(`/api/admin/lead-pages/${draft.data.id}/publish`,'POST',{});
  const a=await f.request(`/api/admin/lead-pages/${draft.data.id}/duplicate`,'POST',{});
  const b=await f.request(`/api/admin/lead-pages/${draft.data.id}/duplicate`,'POST',{});
  assert.equal(a.data.status,'draft');assert.notEqual(a.data.slug,b.data.slug);
  assert.equal((await f.request(`/api/admin/lead-pages/${draft.data.id}/pause`,'POST',{})).data.status,'inactive');
  assert.equal((await f.request('/api/public/lead-pages/demo-guide')).status,404);
  const response=await fetch(`${f.base}/api/admin/lead-pages/${draft.data.id}/publish`,{method:'POST',headers:{Cookie:f.cookie(),'Content-Type':'application/json'},body:'{}'});
  assert.equal(response.status,403);
 }finally{await f.close();}
});

test('published resources stay pinned while editing a different draft resource',async()=>{
 const f=await fixture();try{
  const old=resource(f),next=resource(f),live=f.pages.save(pageInput(old));
  const connected=connectedPage(f,pageInput(next));const saved=f.pages.save({...connected,data:{...connected.data,headline:'Changed'}},live.id,true);
  assert.equal(saved.hasUnpublishedChanges,true);
  const usage=()=>f.db.prepare('SELECT media_id FROM media_usage WHERE owner_key=? ORDER BY media_id').all(`lead_page:${live.id}`).map(r=>Number(r.media_id));
  assert.deepEqual(usage(),[old,next]);assert.equal(f.pages.active(live.slug).data.resourceId,old);
  f.pages.publish(live.id);assert.deepEqual(usage(),[next]);assert.equal(f.pages.active(live.slug).data.resourceId,next);
 }finally{await f.close();}
});

test('lead reporting counts actual submissions and confirmations without invented visits',async()=>{
 const f=await fixture();try{
  const p=f.pages.save(pageInput());
  await f.request('/api/public/subscribe','POST',signup());
  await f.request('/api/public/subscribe','POST',{...signup('another@example.test')});
  await f.request(`/api/public/confirm/${confirmation(f.db)}`,'POST',{});
  const r=await f.request(`/api/admin/lead-pages/${p.id}/report?days=30`);
  assert.equal(r.status,200);assert.equal(r.data.submissions,2);assert.equal(r.data.contacts,2);assert.equal(r.data.confirmed,1);assert.equal(r.data.downloads,0);assert.ok(!('visits' in r.data));
  assert.equal((await f.request(`/api/admin/lead-pages/${p.id}/report?days=0`)).status,400);
 }finally{await f.close();}
});

test('SEO uses published copy, escapes owner text and excludes private token URLs',async()=>{
 const f=await fixture();try{
  const input=pageInput();input.data.headline='Guide <script>alert(1)</script> & resources';
  const p=f.pages.save(input);
  f.pages.save({...pageInput(),data:{...pageInput().data,headline:'Draft only'}},p.id,true);
  const meta=pageMetadata(f.db,f.settings,'/p/demo-guide');
  assert.ok(meta.title.includes('Guide <script>'));assert.equal(meta.noindex,false);
  const html=renderPageHtml('<html><head><title>Default</title></head><body><div id="root"></div></body></html>',meta);
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('og:title'));assert.ok(html.includes('twitter:card'));assert.ok(html.includes('rel="canonical"'));
  const token=pageMetadata(f.db,f.settings,'/confirm/private-token');
  assert.equal(token.noindex,true);assert.ok(!token.canonical.includes('private-token'));
  assert.equal(pageMetadata(f.db,f.settings,'/p/missing').notFound,true);
  assert.equal(pageMetadata(f.db,f.settings,'/resources/%invalid').notFound,true);
  const sitemap=await fetch(f.base+'/sitemap.xml');const xml=await sitemap.text();
  assert.ok(xml.includes('/p/demo-guide'));assert.ok(!xml.includes('/admin'));assert.ok(!xml.includes('-copy'));
  await f.request(`/api/admin/lead-pages/${p.id}/pause`,'POST',{});
  assert.ok(!(await (await fetch(f.base+'/sitemap.xml')).text()).includes('/p/demo-guide'));
  const robots=await (await fetch(f.base+'/robots.txt')).text();assert.ok(robots.includes('Disallow: /confirm/'));assert.ok(robots.includes('Sitemap:'));
 }finally{await f.close();}
});


test('resource sharing metadata distinguishes offer and upcoming records with matching slugs',async()=>{
 const f=await fixture();try{
  const content=new ContentStore(f.db,f.settings),common={slug:'same-name',position:0,status:'active',data:{description:'A useful resource',category:'General',imageId:null,resourceId:null,action:'lead_capture',destination:'',ctaLabel:'Join',tags:[]}};
  content.saveItem({...common,kind:'offer',title:'Current resource'});
  content.saveItem({...common,kind:'upcoming',title:'Future event',data:{...common.data,startDate:'',endDate:''}});
  assert.ok(pageMetadata(f.db,f.settings,'/resources/offer/same-name').title.includes('Current resource'));
  assert.ok(pageMetadata(f.db,f.settings,'/resources/upcoming/same-name').title.includes('Future event'));
  const sitemap=await (await fetch(f.base+'/sitemap.xml')).text();
  assert.ok(sitemap.includes('/resources/offer/same-name'));assert.ok(sitemap.includes('/resources/upcoming/same-name'));
  const apiResult=await fetch(f.base+'/api/public/site');assert.equal(apiResult.headers.get('x-robots-tag'),'noindex, nofollow');
 }finally{await f.close();}
});

test('homepage features require published content and public summaries use published snapshots',async()=>{
 const f=await fixture();try{
  const store=new ContentStore(f.db,f.settings),page=f.pages.save(pageInput(resource(f)));
  store.saveSection('homepage',{activeHeroId:null,featuredOfferId:null,featuredLeadPageId:page.id});
  assert.throws(()=>store.saveSection('homepage',{activeHeroId:null,featuredOfferId:99999,featuredLeadPageId:null}));
  const draft=pageInput();draft.data.headline='Private unfinished headline';f.pages.save(draft,page.id,true);
  const result=await f.request('/api/public/site','GET',undefined,false);assert.equal(result.status,200);
  const summary=result.data.leadPages.find((p:{id:number})=>p.id===page.id);
  assert.equal(summary.headline,'Get the demo guide');assert.equal(summary.hasResource,true);
  for(const key of ['resourceId','confirmationBody','confirmationSubject','automationId','questions'])assert.equal(key in summary,false);
  f.pages.pause(page.id);assert.equal(store.publicSite().leadPages?.length,0);
  assert.throws(()=>store.saveSection('homepage',{activeHeroId:null,featuredLeadPageId:page.id}));
 }finally{await f.close();}
});
test('resource brand and benefits persist without invented commercial fields',async()=>{
 const f=await fixture();try{
  const store=new ContentStore(f.db,f.settings),input={kind:'offer',title:'Useful tool',slug:'useful-tool',position:0,status:'active',data:{description:'Owner supplied description',category:'Tools',brand:'Owner supplied creator',highlights:['Simple workflow','Useful export'],imageId:null,resourceId:null,action:'internal',destination:'https://example.com',ctaLabel:'Explore',tags:[]}};
  const item=store.saveItem(input);store.saveSection('homepage',{activeHeroId:null,featuredOfferId:item.id});
  const live=store.publicSite().items.find(i=>i.id===item.id)!;assert.equal(live.data.brand,input.data.brand);assert.deepEqual(live.data.highlights,input.data.highlights);assert.equal('rating' in live.data,false);assert.equal('price' in live.data,false);
  assert.throws(()=>store.remove(item.id));assert.throws(()=>store.saveItem({...input,slug:'too-many-benefits',data:{...input.data,highlights:Array(6).fill('Benefit')}}));
 }finally{await f.close();}
});

test('all seven saved header types can replace the active header without losing homepage features',async()=>{
 const f=await fixture();try{
  const store=new ContentStore(f.db,f.settings),offer=store.saveItem({kind:'offer',title:'Header resource',slug:'header-resource',position:0,status:'active',data:{description:'Useful resource',category:'Tools',action:'affiliate',destination:'https://example.com/tool',ctaLabel:'Explore',tags:[]}});
  const homepage={activeHeroId:null,featuredOfferId:offer.id,featuredLeadPageId:null};
  const videoId=Number(f.db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES('header.mp4','header-fixture.mp4','video/mp4',40,'mp4','video','public')").run().lastInsertRowid);
  for(const type of ['image','video','slider','lead_capture','featured_offer','announcement','collection']){
   const input={kind:'hero',title:type+' header',slug:type.replace('_','-')+'-header',position:0,status:'draft',data:{type,slides:[{headline:type+' campaign',description:'Saved replacement',videoId:type==='video'?videoId:null,ctaLabel:'Explore',action:'affiliate',offerId:offer.id,destination:''}],tags:[],featuredOfferId:type==='featured_offer'?offer.id:null,collectionOfferIds:type==='collection'?[offer.id]:[]}};
   const saved=await f.request('/api/admin/content/items','POST',input);assert.equal(saved.status,201);
   assert.throws(()=>store.saveSection('homepage',{...homepage,activeHeroId:saved.data.id}));
   const published=await f.request('/api/admin/content/items/'+saved.data.id,'PUT',{...input,status:'active'});assert.equal(published.status,200);
   const active=await f.request('/api/admin/content/sections/homepage','PUT',{...homepage,activeHeroId:saved.data.id});assert.equal(active.status,200);assert.equal(active.data.homepage.featuredOfferId,offer.id);
   const site=(await f.request('/api/public/site','GET',undefined,false)).data;assert.equal(site.sections.homepage.activeHeroId,saved.data.id);const hero=site.items.find((i:{id:number})=>i.id===saved.data.id);assert.equal(hero.data.type,type);assert.equal(new URL(hero.data.slides[0].href,'http://local').pathname,'/go/header-resource');assert.equal(new URL(hero.data.slides[0].href,'http://local').searchParams.get('hero'),String(hero.id));
  }
  assert.throws(()=>store.remove(offer.id));
  const invalid={kind:'hero',title:'Invalid feature',slug:'invalid-feature',status:'draft',data:{type:'featured_offer',slides:[{headline:'Headline',description:'',action:'none'}],tags:[]}};
  assert.equal((await f.request('/api/admin/content/items','POST',invalid)).status,400);
  assert.equal((await f.request('/api/admin/content/items','POST',{...invalid,data:{...invalid.data,type:'collection',collectionOfferIds:[offer.id,offer.id]}})).status,400);
 }finally{await f.close();}
});

test('lead publication requires a related ready email on every public write path',async()=>{
 const f=await fixture();try{
  const draft=await f.request('/api/admin/lead-pages/drafts','POST',pageInput());assert.equal(draft.status,201);
  assert.equal((await f.request(`/api/admin/lead-pages/${draft.data.id}/publish`,'POST',{})).data.error.code,'EMAIL_REQUIRED');
  assert.equal((await f.request('/api/admin/lead-pages','POST',{...pageInput(),slug:'blocked'})).status,400);
  const n=f.newsletters.save({...content(),status:'draft'}),bad={...pageInput(),data:{...pageInput().data,directNewsletterId:n.id}};
  assert.equal((await f.request(`/api/admin/lead-pages/${draft.data.id}/draft`,'PUT',bad)).status,400);
  const ready=f.newsletters.save(content(),n.id),connected={...bad,data:{...bad.data,directNewsletterId:ready.id}};
  assert.equal((await f.request(`/api/admin/lead-pages/${draft.data.id}/draft`,'PUT',connected)).status,200);
  assert.equal((await f.request(`/api/admin/lead-pages/${draft.data.id}/publish`,'POST',{})).status,200);
  const publicPage=(await f.request('/api/public/lead-pages/demo-guide','GET',undefined,false)).data;
  assert.equal('directNewsletterId' in publicPage.data,false);assert.throws(()=>f.newsletters.remove(ready.id));assert.throws(()=>f.newsletters.save({...content(),status:'draft'},ready.id));
 }finally{await f.close();}
});
test('immediate page email freezes at signup, targets only that lead and sends once after confirmation',async()=>{
 const f=await fixture();try{
  f.smtp();f.contact('confirmed','US','North America','unrelated@example.test');
  const n=f.newsletters.save({...content(),subject:'Your original offer',html:'<p>Original offer for {name}</p><a href="{downloadUrl}">Get resource</a>'});
  const p=f.pages.save({...pageInput(resource(f)),data:{...pageInput(resource(f)).data,directNewsletterId:n.id}});
  f.contacts.signup(signup());assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()?.n,0);
  f.newsletters.save({...content(),subject:'Changed email for future people'},n.id);f.pages.pause(p.id);
  const raw=confirmation(f.db);f.contacts.confirm(raw);f.contacts.confirm(raw);
  const campaign=f.db.prepare('SELECT * FROM campaigns WHERE lead_submission_id IS NOT NULL').get()!;assert.equal(JSON.parse(String(campaign.snapshot)).subject,'Your original offer');
  assert.equal(JSON.parse(String(campaign.audience)).contactIds.length,1);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()?.n,1);
  let sends=0;const worker=new MarketingWorker(f.db,f.settings,async(_settings,to,email)=>{sends++;assert.equal(to,'subscriber@example.test');assert.equal(email.subject,'Your original offer');assert.match(email.html,/Original offer for Demo Reader/);assert.match(email.html,/\/download\/[a-f0-9]{64}/);assert.match(email.html,/unsubscribe/);});
  await worker.tick(Date.now()+3000);await worker.tick(Date.now()+6000);assert.equal(sends,1);assert.equal(f.db.prepare('SELECT count(*) n FROM email_queue').get()?.n,1);
 }finally{await f.close();}
});
test('unsubscribing before immediate delivery cancels it and geographic campaigns remain independent',async()=>{
 const f=await fixture();try{
  f.smtp();const n=f.newsletters.save(content()),p=f.pages.save({...pageInput(),data:{...pageInput().data,directNewsletterId:n.id}});
  f.contact('confirmed','US','North America','american@example.test');f.contacts.signup(signup());f.contacts.confirm(confirmation(f.db));const lead=f.db.prepare("SELECT id FROM contacts WHERE email='subscriber@example.test'").get()!;f.contacts.unsubscribeContact(Number(lead.id));
  let sends=0;const worker=new MarketingWorker(f.db,f.settings,async(_s,to)=>{sends++;assert.equal(to,'american@example.test');});await worker.tick(Date.now()+3000);assert.equal(sends,0);
  const segment=f.segments.save({name:'North America',mode:'and',rules:[{field:'continent',operator:'eq',value:'North America'}]}),broadcast=f.campaigns.save({name:'Geographic promotion',newsletterId:n.id,audience:{type:'segment',segmentId:segment.id}});f.campaigns.launch(broadcast.id,Date.now());await worker.tick(Date.now()+6000);assert.equal(sends,1);
  assert.equal(f.campaigns.list().filter(c=>c.lead_submission_id).length,1);assert.equal(f.campaigns.list().filter(c=>!c.lead_submission_id).length,1);
 }finally{await f.close();}
});
test('campaign deadlines reject new contacts while preserving earlier acquisitions',async()=>{
 const f=await fixture();try{
  const input={...pageInput(),type:'limited_campaign',data:{...pageInput().data,endsAt:new Date(Date.now()+100000).toISOString()}},p=f.pages.save(input);f.contacts.signup(signup());const raw=confirmation(f.db);
  f.pages.save({...input,data:{...input.data,endsAt:new Date(Date.now()-1000).toISOString()}},p.id);
  assert.throws(()=>f.contacts.signup(signup('late@example.test')),/campaign has ended/);assert.equal(f.db.prepare('SELECT count(*) n FROM contacts').get()?.n,1);assert.equal(f.contacts.confirm(raw).completed,true);
 }finally{await f.close();}
});
test('recommendations use confirmed answer snapshots and hide unavailable offers',async()=>{
 const f=await fixture();try{
  const offer=new ContentStore(f.db,f.settings).saveItem({kind:'offer',title:'Book recommendation',slug:'book-recommendation',status:'active',data:{description:'Real owner content',category:'Books',action:'affiliate',destination:'https://example.com/book'}});
  const input={...pageInput(),type:'recommendation',data:{...pageInput().data,questions:[{key:'goal',label:'Your goal',required:true,options:['Read','Work']}],recommendations:[{questionKey:'goal',answer:'Read',offerId:offer.id,message:'A reading resource for your stated interest.'}]}};
  f.pages.save(input);f.contacts.signup(signup('subscriber@example.test',{goal:'Read'}));const raw=confirmation(f.db);assert.deepEqual(f.contacts.inspect(raw,'confirm').recommendations,[]);
  const result=f.contacts.confirm(raw);assert.equal(result.recommendations[0]?.href,'/go/book-recommendation');assert.equal(result.recommendations[0]?.affiliate,true);
  f.db.prepare("UPDATE content_items SET status='inactive' WHERE id=?").run(offer.id);assert.deepEqual(f.contacts.inspect(raw,'confirm').recommendations,[]);
  assert.throws(()=>f.pages.save({...input,slug:'bad-rule',data:{...input.data,recommendations:[{...input.data.recommendations[0],answer:'Unknown'}]}}));
 }finally{await f.close();}
});

test('all requested templates save, publish and render distinct structured page families',async()=>{
 const f=await fixture();try{
  const n=f.newsletters.save(content()),families=new Set<string>();
  for(const [type,label] of leadTemplates){const data={...pageInput().data,...templateData(type),headline:label,description:'Fictional preview content',directNewsletterId:n.id};const saved=f.pages.save({...pageInput(),name:label,slug:type.replaceAll('_','-'),type,status:'draft',data},undefined,true);f.pages.publish(saved.id);
   const live=f.pages.active(saved.slug),html=renderToStaticMarkup(createElement(LeadExperience,{page:live,consentText:'Fictional consent text',preview:true}));assert.match(html,/lead-content-section/);assert.match(html,/lead-optin/);const family=html.match(/lead-family-([a-z]+)/)?.[1];assert.ok(family);families.add(family!);
   if(type==='comparison'){assert.match(html,/block-comparison/);assert.match(html,/Add content in the editor/);}if(type==='calculator')assert.match(html,/ROI calculator/);if(type==='multistep')assert.match(html,/Step 1 of 3/);
  }
  assert.equal(families.size,8);assert.equal(leadTemplates.length,36);assert.deepEqual(leadTemplates.map(t=>t[0]).sort(),[...pageTypes].sort());
 }finally{await f.close();}
});

test('detailed products persist through admin and render safely in shared full-page previews',async()=>{
 const f=await fixture();try{
  const input={kind:'offer',title:'Useful product',slug:'detailed-product',status:'active',position:0,data:{description:'Short introduction',category:'Tools',action:'internal',destination:'https://example.com/product',brand:'Owner supplied brand',overview:'Full product explanation\nWith practical details',audience:'Small business owners',included:['Export tools','Setup guide'],limitations:['Requires an internet connection'],specifications:[{label:'Format',value:'Web application'}],faqs:[{question:'How does it work?',answer:'Read the setup guide. <script>alert(1)</script>'}]}};
  const saved=await f.request('/api/admin/content/items','POST',input);assert.equal(saved.status,201);
  const live=(await f.request('/api/public/site','GET',undefined,false)).data.items.find((i:{id:number})=>i.id===saved.data.id);assert.equal(live.data.overview,input.data.overview);assert.deepEqual(live.data.specifications,input.data.specifications);assert.deepEqual(live.data.included,input.data.included);
  const html=renderToStaticMarkup(createElement(ResourceView,{item:live,disclosure:'Owner supplied disclosure',onSignup:()=>{},preview:true}));assert.match(html,/Small business owners/);assert.match(html,/What you get/);assert.match(html,/Requires an internet connection/);assert.match(html,/How does it work/);assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('share-tools'));
  assert.equal((await f.request('/api/admin/content/items','POST',{...input,slug:'too-many-features',data:{...input.data,included:Array(13).fill('Feature')}})).status,400);
  const upcoming=await f.request('/api/admin/content/items','POST',{...input,kind:'upcoming',slug:'upcoming-detail'});assert.equal(upcoming.status,201);assert.equal(upcoming.data.data.audience,input.data.audience);
 }finally{await f.close();}
});


test('advanced metadata shares published facts, escapes JSON-LD and excludes private tokens',async()=>{
 const f=await fixture();try{
  const input=pageInput();input.data.headline='Guide </script><script>alert(1)</script>';f.pages.save(input);
  const meta=pageMetadata(f.db,f.settings,'/p/demo-guide');
  assert.equal(meta.imageWidth,445);assert.equal(meta.imageHeight,447);assert.equal(meta.imageType,'image/jpeg');
  const html=renderPageHtml('<html><head><title>Default</title></head><body><div id="root"></div></body></html>',meta);
  for(const key of ['og:site_name','og:locale','og:image:alt','og:image:width','twitter:image:alt','theme-color','application-name','page-structured-data'])assert.ok(html.includes(key));
  const json=html.match(/<script type="application\/ld\+json" id="page-structured-data">(.*?)<\/script>/s)![1]!;
  assert.ok(!json.includes('<'));const data=JSON.parse(json);assert.equal(data['@context'],'https://schema.org');
  assert.ok(data['@graph'].some((v:Record<string,unknown>)=>v['@type']==='Organization'));
  assert.ok(data['@graph'].some((v:Record<string,unknown>)=>v['@type']==='BreadcrumbList'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  for(const path of ['/confirm/secret-test-token','/unsubscribe/secret-test-token','/admin/content']){
   const r=await fetch(f.base+'/api/public/page-metadata?path='+encodeURIComponent(path));assert.equal(r.status,200);const m=await r.json() as typeof meta;
   assert.equal(m.noindex,true);assert.equal(m.structuredData,null);assert.ok(!JSON.stringify(m).includes('secret-test-token'));
   assert.ok(!renderPageHtml('<head></head>',m).includes('application/ld+json'));
  }
  const api=await fetch(f.base+'/api/public/page-metadata?path='+encodeURIComponent('/p/demo-guide?tracking=private'));
  const m=await api.json() as typeof meta;assert.equal(m.title,meta.title);assert.ok(!m.canonical.includes('tracking'));assert.equal(api.headers.get('cache-control'),'no-store');
 }finally{await f.close();}
});


test('footer contact and social fields persist safely and older footers receive defaults',async()=>{
 const f=await fixture();try{
  const store=new ContentStore(f.db,f.settings);const original=store.sections().footer;
  const data={...original,address:'Example address <script>bad()</script>',hours:'Weekdays',helpfulText:'Helpful owner information',contactEmail:'support@example.test',contactPhone:'+250 123 456 789',socialLinks:[{platform:'YouTube',url:'https://www.youtube.com/@example'},{platform:'Meta Business Suite',url:'https://business.facebook.com/'},{platform:'Custom profile',url:'https://example.test/profile'}]};
  const saved=await f.request('/api/admin/content/sections/footer','PUT',data);assert.equal(saved.status,200);
  const site=await (await fetch(f.base+'/api/public/site')).json();assert.equal(site.sections.footer.address,data.address);assert.equal(site.sections.footer.socialLinks.length,3);
  const html=renderToStaticMarkup(createElement(PublicFooter,{name:'Test site',footer:site.sections.footer,signup:site.sections.signup,eyebrow:'Subscribe',consentText:'',disclosure:'Affiliate disclosure',preview:true}));
  assert.ok(html.includes('YouTube'));assert.ok(html.includes('Meta Business Suite'));assert.ok(html.includes('Custom profile'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>bad()'));
  assert.ok(html.includes('Cookie settings'));assert.ok(!html.includes('<form'));assert.ok(html.includes('aria-hidden="true"'));
  const invalid=await f.request('/api/admin/content/sections/footer','PUT',{...data,socialLinks:[{platform:'Facebook',url:'javascript:alert(1)'}]});assert.equal(invalid.status,400);
  const tooMany=await f.request('/api/admin/content/sections/footer','PUT',{...data,socialLinks:Array(13).fill(data.socialLinks[0])});assert.equal(tooMany.status,400);
  const {address,hours,helpfulText,socialLinks,...legacy}=original;const legacySaved=await f.request('/api/admin/content/sections/footer','PUT',legacy);assert.equal(legacySaved.status,200);
  const after=store.sections().footer;assert.equal(after.address,'');assert.deepEqual(after.socialLinks,[]);
 }finally{await f.close();}
});


test('product prices and delivery terms validate, persist and render without fabricated defaults',async()=>{
 const f=await fixture();try{
  const input={kind:'offer',slug:'priced-resource',title:'Example physical item',position:0,status:'active',data:{description:'Example details',category:'Tools',action:'affiliate',destination:'https://example.test/item',priceMode:'fixed',priceAmount:120,currency:'USD',compareAtPrice:150,priceNote:'Check provider taxes',badgeLabel:'Example badge',deliveryType:'physical',condition:'refurbished',availability:'preorder',deliveryRegions:'Owner-defined regions',deliveryEstimate:'Provider estimate',deliveryCostNote:'Shipping calculated by provider',returnsPolicy:'Provider return policy',deliveryTerms:'Owner text <script>alert(1)</script>'}};
  const saved=await f.request('/api/admin/content/items','POST',input);assert.equal(saved.status,201);
  const site=await (await fetch(f.base+'/api/public/site',{headers:{Connection:'close'}})).json();const item=site.items.find((i:{slug:string})=>i.slug===input.slug);
  assert.equal(item.data.priceAmount,120);assert.equal(item.data.deliveryType,'physical');
  const facts=renderToStaticMarkup(createElement(ProductFacts,{data:item.data}));for(const value of ['$120.00','$150.00','Refurbished','Preorder','Owner-defined regions'])assert.ok(facts.includes(value));
  const details=renderToStaticMarkup(createElement(ResourceView,{item,preview:true,disclosure:'Disclosure',onSignup:()=>{}}));assert.ok(details.includes('Delivery &amp; conditions'));assert.ok(details.includes('Provider return policy'));assert.ok(details.includes('&lt;script&gt;'));assert.ok(!details.includes('<script>alert'));
  for(const change of [{priceAmount:-1},{priceAmount:null},{compareAtPrice:100},{currency:'wrong'}]){const r=await f.request('/api/admin/content/items','POST',{...input,slug:'invalid-price',data:{...input.data,...change}});assert.equal(r.status,400);}
  const free=renderToStaticMarkup(createElement(ProductFacts,{data:{priceMode:'free'}}));assert.ok(free.includes('Free'));assert.equal(renderToStaticMarkup(createElement(ProductFacts,{data:{}})),'');
  const future=await f.request('/api/admin/content/items','POST',{...input,kind:'upcoming',slug:'subscription-resource',data:{...input.data,priceMode:'subscription',billingInterval:'year',compareAtPrice:null}});assert.equal(future.status,201);
 }finally{await f.close();}
});

test('email connection edits preserve unpublished page content and immutable acquisition snapshots',async()=>{
 const f=await fixture();try{
  const input=connectedPage(f),p=f.pages.save(input),n=f.newsletters.save({...content(),title:'Replacement email'});
  const {id,updatedAt,hasUnpublishedChanges,...saved}=f.pages.get(p.id);f.pages.save({...saved,data:{...saved.data,headline:'Unpublished headline'}},id,true);
  const connections={directNewsletterId:n.id,automationId:null,confirmationSubject:'Updated confirmation',confirmationBody:'Confirm here: {confirmationUrl}'};
  const response=await f.request('/api/admin/lead-pages/'+id+'/email-connections','PUT',connections);assert.equal(response.status,200);assert.equal(f.pages.get(id).data.headline,'Unpublished headline');assert.equal(f.pages.active(p.slug).data.headline,input.data.headline);assert.equal(f.pages.active(p.slug).data.directNewsletterId,n.id);assert.equal(f.pages.get(id).hasUnpublishedChanges,true);
  assert.equal((await f.request('/api/admin/lead-pages/'+id+'/email-connections','PUT',{...connections,directNewsletterId:null})).status,400);
  f.contacts.signup(signup());const snapshot=String(f.db.prepare('SELECT page_snapshot FROM lead_submissions ORDER BY id DESC LIMIT 1').get()!.page_snapshot);
  f.pages.emailConnections(id,{...connections,confirmationSubject:'Later copy'});assert.equal(f.db.prepare('SELECT page_snapshot FROM lead_submissions ORDER BY id DESC LIMIT 1').get()!.page_snapshot,snapshot);
 }finally{await f.close();}
});

test('signup queues encrypted HTML and plaintext with escaped personalization and public media preview headers',async()=>{
 const f=await fixture();try{
  const p=connectedPage(f);p.data.confirmationBody='<p>Welcome {name}, please join us.</p>';f.pages.save(p);f.contacts.signup({...signup(),name:'<img src="https://evil.test/x">'});
  const row=f.db.prepare("SELECT payload FROM transactional_outbox WHERE purpose='confirmation' LIMIT 1").get()!,payload=JSON.parse(decryptSecret(String(row.payload),key,'contact-mail'));assert.match(payload.html,/Confirm my subscription/);assert.match(payload.html,/&lt;img/);assert.ok(!/<img[^>]*src="https:\/\/evil.test\/x"/i.test(payload.html));assert.match(payload.text,/confirm\/[a-f0-9]{64}/);assert.ok(!String(row.payload).includes('Confirm my subscription'));
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6J9sAAAAASUVORK5CYII=','base64'),storageName=new LocalStorage(f.directory).save(bytes,'png');const id=Number(f.db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES('pixel.png',?,'image/png',?,'png','image','public')").run(storageName,bytes.length).lastInsertRowid);const response=await fetch(f.base+'/media/'+id);assert.equal(response.status,200);assert.equal(response.headers.get('cross-origin-resource-policy'),'cross-origin');
  f.db.prepare("UPDATE media SET visibility='private' WHERE id=?").run(id);assert.equal((await fetch(f.base+'/media/'+id)).status,404);assert.throws(()=>f.newsletters.save({...content(),html:'<img src="/api/admin/media/'+id+'/file">'}));
 }finally{await f.close();}
});

test('automation workspace reports real totals, frozen journeys and published connections with pagination',async()=>{
 const f=await fixture();try{
  const {a,n}=sequence(f,'paused'),p=f.pages.save(connectedPage(f,pageInput(null,a.id)));
  for(let i=0;i<23;i++){const c=f.contact('confirmed','RW','Africa',`journey-${i}@example.test`);const submission=Number(f.db.prepare("INSERT INTO lead_submissions(contact_id,name,country,source_type,source_id,source_label,consent_text,utm,tags) VALUES(?,'Demo','RW','lead_page','demo-guide','Original guide','Consented','{}','[]')").run(c).lastInsertRowid);f.automations.enroll(a.id,c,submission);}
  const result=await f.request(`/api/admin/automations/${a.id}/details`);assert.equal(result.status,200);assert.equal(result.data.enrollmentTotal,23);assert.equal(result.data.enrollments.length,20);assert.equal(result.data.counts.find((c:{status:string})=>c.status==='active').count,23);assert.equal(result.data.enrollments[0].source_label,'Original guide');assert.equal(result.data.enrollments[0].steps.length,3);assert.equal(result.data.enrollments[0].steps[0].status,'paused');assert.equal(result.data.connections[0].publishedConnected,true);
  const frozen=result.data.enrollments[0].steps[0].subject;f.newsletters.save({...content(),subject:'Future subscribers only'},n.id);
  const {id,updatedAt,hasUnpublishedChanges,...saved}=f.pages.get(p.id);f.pages.save({...saved,data:{...saved.data,automationId:null}},id,true);
  const next=await f.request(`/api/admin/automations/${a.id}/details?page=2`);assert.equal(next.data.enrollments.length,3);assert.equal(next.data.enrollments[0].steps[0].subject,frozen);assert.equal(next.data.connections[0].savedConnected,false);assert.equal(next.data.connections[0].publishedConnected,true);
  const filtered=await f.request(`/api/admin/automations/${a.id}/details?search=journey-22`);assert.equal(filtered.data.enrollmentTotal,1);assert.equal(filtered.data.enrollments[0].email,'journey-22@example.test');assert.equal((await f.request(`/api/admin/automations/${a.id}/details?page=0`)).status,400);assert.equal((await f.request(`/api/admin/automations/${a.id}/details?status=invalid`)).status,400);assert.equal((await f.request(`/api/admin/automations/${a.id}/details`,'GET',undefined,false)).status,401);
 }finally{await f.close();}
});

test('automation control, paused duplication and enrollment stop preserve once-only consent delivery',async()=>{
 const f=await fixture();try{
  const {a,n}=sequence(f,'paused');f.pages.save(pageInput(null,a.id));f.contacts.signup(signup());f.contacts.confirm(confirmation(f.db));const enrollment=Number(f.db.prepare('SELECT id FROM automation_enrollments').get()!.id);
  const start=await f.request(`/api/admin/automations/${a.id}/control`,'POST',{status:'running'});assert.equal(start.status,200);assert.equal(start.data.status,'running');assert.equal(f.db.prepare('SELECT status FROM campaigns LIMIT 1').get()?.status,'scheduled');
  assert.equal((await f.request(`/api/admin/automations/${a.id}/control`,'POST',{status:'paused'})).status,200);assert.equal(f.db.prepare('SELECT status FROM campaigns LIMIT 1').get()?.status,'paused');
  const copy=await f.request(`/api/admin/automations/${a.id}/duplicate`,'POST',{});assert.equal(copy.status,201);assert.equal(copy.data.status,'paused');assert.equal(f.automations.details(copy.data.id).enrollmentTotal,0);
  assert.equal((await f.request(`/api/admin/automations/${copy.data.id}/enrollments/${enrollment}/stop`,'POST',{})).status,404);
  assert.equal((await f.request(`/api/admin/automations/${a.id}/enrollments/${enrollment}/stop`,'POST',{})).status,200);assert.equal(f.db.prepare('SELECT status FROM automation_enrollments WHERE id=?').get(enrollment)?.status,'cancelled');assert.equal(f.db.prepare("SELECT count(*) n FROM campaigns WHERE status='cancelled'").get()?.n,3);f.automations.enroll(a.id,1,1);assert.equal(f.automations.details(a.id).enrollmentTotal,1);
  assert.throws(()=>f.newsletters.save({...content(),status:'draft'},n.id));f.db.prepare("UPDATE newsletters SET status='draft' WHERE id=?").run(n.id);assert.equal((await f.request(`/api/admin/automations/${a.id}/control`,'POST',{status:'running'})).status,400);assert.equal(f.automations.get(a.id).status,'paused');
  assert.equal((await f.request(`/api/admin/automations/${a.id}/control`,'POST',{status:'invalid'})).status,400);
 }finally{await f.close();}
});



test('lead directory sorting, sources and paginated histories remain authorized and contact scoped',async()=>{
 const f=await fixture();try{
  const one=f.contact('confirmed','RW','Africa','alpha@example.test','Alpha'),two=f.contact('pending','US','North America','zulu@example.test','Zulu');f.db.prepare("UPDATE contacts SET source_label='Guide acquisition' WHERE id=?").run(two);
  assert.equal((await f.request('/api/admin/contacts?sort=name')).data.contacts[0].id,one);assert.equal((await f.request('/api/admin/contacts?sort=newest')).data.contacts[0].id,two);
  const filtered=await f.request('/api/admin/contacts?source=Guide%20acquisition');assert.equal(filtered.data.total,1);assert.equal(filtered.data.contacts[0].id,two);assert.equal(filtered.data.counts.reduce((n:number,c:{count:number})=>n+c.count,0),2);
  assert.equal((await f.request('/api/admin/contacts/sources')).data.length,2);assert.equal((await f.request('/api/admin/contacts?sort=invalid')).status,400);
  for(let i=0;i<105;i++)f.db.prepare("INSERT INTO lead_submissions(contact_id,name,country,source_type,source_id,source_label,consent_text,utm,tags) VALUES(?,'Alpha','RW','footer','footer','Original guide','Consented','{}','[]')").run(one);
  const history=await f.request(`/api/admin/contacts/${one}/history?section=submissions&page=6`);assert.equal(history.status,200);assert.equal(history.data.total,105);assert.equal(history.data.items.length,5);assert.equal((await f.request(`/api/admin/contacts/${two}/history?section=submissions`)).data.total,0);
  assert.equal((await f.request(`/api/admin/contacts/${one}/history?section=unknown`)).status,400);assert.equal((await f.request(`/api/admin/contacts/${one}/history?section=submissions&page=0`)).status,400);assert.equal((await f.request('/api/admin/contacts/delivery-history','GET',undefined,false)).status,401);
 }finally{await f.close();}
});

test('lead email history includes both delivery kinds and suppression cancels the enrolled journey',async()=>{
 const f=await fixture();try{
  const {a}=sequence(f,'paused');f.pages.save(pageInput(null,a.id));f.contacts.signup(signup());f.contacts.confirm(confirmation(f.db));const id=1;const campaign=f.db.prepare('SELECT id,newsletter_id FROM campaigns LIMIT 1').get()!;
  for(let i=0;i<21;i++){const c=i?f.contact('confirmed','RW','Africa',`history-${i}@example.test`):id;f.db.prepare("INSERT INTO email_queue(campaign_id,contact_id,newsletter_id,recipient,subject,scheduled_at) VALUES(?,?,?,?,?,?)").run(Number(campaign.id),c,Number(campaign.newsletter_id),i?`history-${i}@example.test`:'subscriber@example.test','Example follow-up',Date.now());}
  const all=await f.request('/api/admin/contacts/delivery-history');assert.equal(all.data.total,22);assert.equal(all.data.items.length,20);assert.equal((await f.request('/api/admin/contacts/delivery-history?page=2')).data.items.length,2);
  const mine=await f.request('/api/admin/contacts/delivery-history?contactId=1');assert.equal(mine.data.total,2);assert.deepEqual(new Set(mine.data.items.map((r:{kind:string})=>r.kind)),new Set(['transactional','marketing']));assert.equal((await f.request('/api/admin/contacts/delivery-history?search=history-20')).data.total,1);
  const journey=await f.request('/api/admin/contacts/1/history?section=automations');assert.equal(journey.data.items[0].steps.length,3);assert.equal(journey.data.items[0].sequence_status,'paused');
  assert.equal((await f.request('/api/admin/contacts/1/suppress','POST',{})).status,200);assert.equal(f.db.prepare('SELECT status FROM automation_enrollments').get()?.status,'cancelled');assert.equal(f.db.prepare("SELECT count(*) n FROM campaigns WHERE status='cancelled'").get()?.n,3);
  assert.equal((await f.request('/api/admin/contacts/delivery-history?status=unknown')).status,400);
 }finally{await f.close();}
});

test('funnel single opt-in queues related email once without falsely verifying ownership and preserves unsubscribe',async()=>{
 const f=await fixture();try{
  const {a}=sequence(f,'paused'),input=connectedPage(f,pageInput(resource(f),a.id));const p=f.pages.save({...input,data:{...input.data,deliveryMode:'single'}});
  assert.equal((await f.request('/api/public/subscribe','POST',signup(),false)).status,202);const c=f.contacts.contact(1);assert.equal(c.status,'confirmed');assert.equal(c.consent_mode,'single');assert.equal(c.email_verified_at,null);assert.equal(f.db.prepare('SELECT count(*) n FROM transactional_outbox').get()?.n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM automation_enrollments').get()?.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns WHERE lead_submission_id IS NOT NULL').get()?.n,1);
  f.contacts.signup(signup());assert.equal(f.db.prepare('SELECT count(*) n FROM lead_submissions').get()?.n,1);
  f.contacts.unsubscribeContact(1);f.db.prepare("UPDATE lead_submissions SET created_at='2020-01-01T00:00:00.000Z'").run();f.contacts.signup(signup());assert.equal(f.contacts.contact(1).status,'unsubscribed');assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns WHERE lead_submission_id IS NOT NULL').get()?.n,1);
  f.contacts.confirm(confirmation(f.db));assert.equal(f.contacts.contact(1).status,'confirmed');assert.ok(f.contacts.contact(1).email_verified_at);assert.equal(f.contacts.contact(1).consent_mode,'double');
  f.contacts.unsubscribeContact(1);f.db.prepare("UPDATE contacts SET status='suppressed'").run();f.contacts.signup(signup());assert.equal(f.contacts.contact(1).status,'suppressed');
 }finally{await f.close();}
});

test('browse funnels publish without email, reject capture and restore recoverable published versions safely',async()=>{
 const f=await fixture();try{
  const input=pageInput(),p=f.pages.save({...input,status:'draft',data:{...input.data,deliveryMode:'browse',headline:'First published headline'}});const pub=await f.request(`/api/admin/lead-pages/${p.id}/publish`,'POST',{});assert.equal(pub.status,200);assert.equal((await f.request('/api/public/subscribe','POST',signup(),false)).status,400);
  const versions=f.pages.versions(p.id);assert.equal(versions.length,1);const {id,updatedAt,hasUnpublishedChanges,...page}=f.pages.get(p.id);f.pages.save({...page,data:{...page.data,headline:'Second published headline'}},id);const restored=f.pages.restore(id,Number(versions[0]!.id));assert.equal(restored.data.headline,'First published headline');assert.equal(f.pages.active(p.slug).data.headline,'Second published headline');assert.equal(restored.hasUnpublishedChanges,true);
  assert.throws(()=>f.pages.validateDelivery({...page,data:{...page.data,resourceId:resource(f)}}));assert.equal((await f.request(`/api/admin/lead-pages/${id}/restore`,'POST',{versionId:9999})).status,404);
 }finally{await f.close();}
});

test('verified funnel domain routing controls root metadata and preserves trusted confirmation origin',async()=>{
 const f=await fixture();try{
  const p=f.pages.save(connectedPage(f)),domains=new FunnelDomains(f.db),d=domains.create({host:'offers.example.test',pageId:p.id})!;assert.equal(domains.resolve('offers.example.test'),null);
  await assert.rejects(domains.verify(Number(d.id),async()=>[['wrong']]));await domains.verify(Number(d.id),async()=>[['affiliate-funnel='+d.challenge]]);assert.equal(domains.resolve('offers.example.test')?.slug,p.slug);
  const hostJson=(path:string)=>new Promise<any>((resolve,reject)=>{httpGet(f.base+path,{headers:{Host:'offers.example.test'}},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>{try{resolve(JSON.parse(body));}catch(e){reject(e);}});}).on('error',reject);});assert.equal((await hostJson('/api/public/funnel-context')).slug,p.slug);
  assert.equal((await hostJson('/api/public/page-metadata?path=/')).canonical,'https://offers.example.test/');
  f.contacts.signup(signup(),'offers.example.test');const row=f.db.prepare("SELECT payload FROM transactional_outbox WHERE purpose='confirmation' LIMIT 1").get()!;assert.match(JSON.parse(decryptSecret(String(row.payload),key,'contact-mail')).text,/https:\/\/offers.example.test\/confirm\//);
  const snapshot=JSON.parse(String(f.db.prepare('SELECT page_snapshot FROM lead_submissions').get()?.page_snapshot));assert.equal(snapshot.publicOrigin,'https://offers.example.test');
  f.pages.pause(p.id);assert.equal(domains.resolve('offers.example.test'),null);assert.throws(()=>domains.create({host:'127.0.0.1',pageId:p.id}));assert.throws(()=>domains.create({host:'https://evil.test/path',pageId:p.id}));
 }finally{await f.close();}
});

test('funnel blocks render published products with branded identity and safe affiliate links; SEO honors saved overrides',async()=>{
 const f=await fixture();try{
  const saved=await f.request('/api/admin/content/items','POST',{kind:'offer',slug:'funnel-product',title:'Example product',position:0,status:'active',data:{description:'Real product description',category:'Tools',action:'affiliate',destination:'https://example.test/provider',priceMode:'fixed',priceAmount:49,currency:'USD',badgeLabel:'Featured'}});assert.equal(saved.status,201);
  const input=connectedPage(f),p=f.pages.save({...input,data:{...input.data,productIds:[saved.data.id],seo:{title:'Custom funnel title',description:'Custom sharing description',imageId:null,noindex:true},sections:[{kind:'products',title:'Explore products',body:'',rows:[],offerIds:[saved.data.id]},{kind:'cta',title:'Next step',body:'',rows:[],href:'/go/funnel-product',label:'Visit provider'}]}});
  const markup=renderToStaticMarkup(createElement(LeadExperience,{page:p,consentText:'Consent',offers:[saved.data],brand:{name:'33 items',logoUrl:'/brand/33-items-logo.jpg'}}));assert.match(markup,/33-items-logo/);assert.match(markup,/Example product/);assert.match(markup,/\$49\.00/);assert.match(markup,/href="\/go\/funnel-product\?funnel=demo-guide"/);assert.match(markup,/rel="sponsored noopener"/);
  f.settings.save('tracking',{...f.settings.read().tracking,affiliateClicks:true});const click=await fetch(f.base+'/go/funnel-product?funnel=demo-guide',{redirect:'manual'});assert.equal(click.status,302);assert.equal(f.pages.report(p.id).affiliateClicks,1);const meta=await f.request('/api/public/page-metadata?path=/p/demo-guide','GET',undefined,false);assert.equal(meta.data.title,'Custom funnel title');assert.equal(meta.data.noindex,true);
  assert.throws(()=>f.pages.save({...input,data:{...input.data,sections:[{kind:'cta',title:'Unsafe',body:'',rows:[],href:'javascript:alert(1)'}]}}));
 }finally{await f.close();}
});


test('header promotion identity survives reordering and drafts; linked confirmation freezes the offer email and notifies the owner once',async()=>{
 const f=await fixture();try{
  const page=f.pages.save(connectedPage(f)),store=new ContentStore(f.db,f.settings),base={headline:'Green event',description:'Register for this real promotion',action:'lead_capture',ctaLabel:'Register',signup:{leadPageId:page.id,title:'Event registration',description:'Related item email',cta:'Join',tags:['event-interest']}};
  const h=store.saveItem({kind:'hero',slug:'event-header',title:'Seasonal promotions',status:'active',position:0,data:{type:'slider',tags:['seasonal'],slides:[{...base,key:'green-event',appearance:{palette:'green'}},{...base,key:'red-event',headline:'Red event',appearance:{palette:'red'}}]}});store.saveSection('homepage',{...store.sections().homepage,activeHeroId:h.id});
  const input={...signup(),source:{type:'hero',id:String(h.id),promotionId:'green-event'}};assert.equal((await f.request('/api/public/subscribe','POST',input,false)).status,202);assert.equal((await f.request('/api/public/subscribe','POST',input,false)).status,202);assert.equal(f.db.prepare('SELECT count(*) n FROM admin_notifications').get()?.n,1);const token=confirmation(f.db);const acquisition=f.db.prepare('SELECT * FROM lead_submissions').get()!;assert.equal(acquisition.promotion_key,'green-event');assert.equal(JSON.parse(String(acquisition.promotion_snapshot)).headline,'Green event');assert.equal(JSON.parse(String(acquisition.page_snapshot)).directEmail.subject,'Welcome {name}');
  const {id,...item}=h;store.saveItem({...item,data:{...item.data,slides:[(item.data.slides as any[])[1],{...(item.data.slides as any[])[0],headline:'Changed draft'}]}},id,true);assert.equal((store.publicSite().items.find(i=>i.id===id)?.data.slides as any[])[0].headline,'Green event');assert.equal(f.contacts.source('hero',String(id),'green-event').promotion?.headline,'Green event');
  assert.equal((await f.request('/api/public/confirm/'+token,'POST',{},false)).status,200);assert.equal((await f.request('/api/public/confirm/'+token,'POST',{},false)).status,200);assert.equal(f.db.prepare('SELECT count(*) n FROM admin_notifications').get()?.n,2);assert.equal(f.db.prepare("SELECT count(*) n FROM campaigns WHERE lead_submission_id IS NOT NULL").get()?.n,1);const tags=f.contacts.contact(Number(acquisition.contact_id)).tags;assert.ok(tags.some(t=>t.name==='event-interest'));assert.ok(tags.some(t=>t.name.startsWith('header-'+id+'-')));
  const notices=await f.request('/api/admin/content/header-notifications');assert.equal(notices.data.unread,2);assert.equal(notices.data.items[0].stage,'activated');assert.equal(notices.data.items[0].promotion.headline,'Green event');assert.equal((await f.request('/api/admin/content/header-notifications','GET',undefined,false)).status,401);await f.request('/api/admin/content/header-notifications/read','POST',{ids:[notices.data.items[0].id]});assert.equal((await f.request('/api/admin/content/header-notifications')).data.unread,1);
  const activated=store.activateHeader(id);assert.equal((activated.item.data.slides as any[])[1].headline,'Changed draft');assert.equal((store.publicSite().items.find(i=>i.id===id)?.data.slides as any[])[0].key,'red-event');assert.equal(JSON.parse(String(acquisition.promotion_snapshot)).headline,'Green event');assert.throws(()=>f.contacts.signup({...input,source:{...input.source,promotionId:'forged-key'}}));
 }finally{await f.close();}
});

test('header editor validates unique visible promotions, public backgrounds and active signup journeys before activation',async()=>{
 const f=await fixture();try{
  const store=new ContentStore(f.db,f.settings),slide={key:'promo',headline:'Announcement',description:'Details',action:'none',appearance:{palette:'black-red',background:'solid'}},input={kind:'hero',slug:'header-validation',title:'Header validation',position:0,status:'draft',data:{type:'announcement',slides:[slide]}};
  assert.throws(()=>store.saveItem({...input,data:{...input.data,slides:[slide,slide]}}));assert.throws(()=>store.saveItem({...input,data:{...input.data,slides:[{...slide,hidden:true}]}}));assert.throws(()=>store.saveItem({...input,data:{...input.data,slides:[{...slide,appearance:{backgroundImageId:resource(f)}}]}}));assert.throws(()=>store.saveItem({...input,data:{...input.data,slides:[{...slide,appearance:{backgroundColor:'url(evil)'}}]}}));
  const page=f.pages.save({...connectedPage(f),status:'draft'}),h=store.saveItem({...input,data:{...input.data,slides:[{...slide,action:'lead_capture',signup:{leadPageId:page.id}}]}});assert.throws(()=>store.activateHeader(h.id));assert.equal(store.sections().homepage.activeHeroId,null);assert.equal(store.items().find(i=>i.id===h.id)?.status,'draft');
  f.pages.publish(page.id);store.activateHeader(h.id);f.pages.pause(page.id);assert.throws(()=>f.contacts.signup({...signup(),source:{type:'hero',id:String(h.id),promotionId:'promo'}}));
 }finally{await f.close();}
});

test('all nine header types render crisp image-free layouts or selected assets and preserve manual slider navigation',async()=>{
 const f=await fixture();try{
  const store=new ContentStore(f.db,f.settings),offer=store.saveItem({kind:'offer',slug:'header-demo-offer',title:'Header product',position:0,status:'active',data:{description:'Published product details',category:'Tools',action:'affiliate',destination:'https://example.test/item'}});
  const image=Number(f.db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES('existing.jpg','existing.jpg','image/jpeg',10,'jpg','image','public')").run().lastInsertRowid);
  for(const type of ['image','background','announcement','lead_capture','featured_offer','collection','video','event','slider']){
   const h=store.saveItem({kind:'hero',slug:'modern-'+type.replaceAll('_','-'),title:'Modern '+type,position:0,status:'draft',data:{type,featuredOfferId:type==='featured_offer'?offer.id:null,collectionOfferIds:type==='collection'?[offer.id]:[],slides:[{key:'first',headline:'Clear campaign heading',description:'Useful supporting copy',action:'lead_capture',appearance:{palette:'blue',backgroundImageId:type==='background'?image:null}},...(type==='slider'?[{key:'second',headline:'Another promotion',description:'Different event',action:'none',appearance:{palette:'green'}}]:[])]}});
   const markup=renderToStaticMarkup(createElement(HeroHeader,{hero:h,offers:[offer],siteName:'33 items',description:'',eyebrow:'Featured',consentText:'Consent',disclosure:'Affiliate disclosure',preview:true}));assert.match(markup,/Clear campaign heading/);assert.match(markup,/campaign-hero/);assert.ok(!markup.includes('backdrop-blur'));if(type==='announcement')assert.ok(!markup.includes('/design/'));if(type==='slider'){assert.match(markup,/Previous advertisement/);assert.match(markup,/Show advertisement 2/);}if(type==='background')assert.match(markup,/campaign-background-image/);
  }
 }finally{await f.close();}
});


test('HTTP funnel signup to local SMTP confirmation, related email, sequence and one-click cancellation',async()=>{
 const f=await fixture(),sockets=new Set<Socket>(),messages:string[]=[];
 const smtp=createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 audit.local ESMTP\r\n');
  let buffer='',inData=false,message='';
  socket.on('data',chunk=>{buffer+=chunk;let end:number;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);
   if(inData){if(line==='.'){messages.push(message);message='';inData=false;socket.write('250 Accepted locally\r\n');}else message+=line+'\n';}
   else if(/^(EHLO|HELO) /i.test(line))socket.write('250-audit.local\r\n250 PIPELINING\r\n');
   else if(line==='DATA'){inData=true;socket.write('354 Continue\r\n');}
   else if(line==='QUIT')socket.end('221 Bye\r\n');else socket.write('250 OK\r\n');
  }});
 });
 smtp.listen(0,'127.0.0.1');await new Promise<void>(resolve=>smtp.once('listening',resolve));
 try{
  f.settings.save('smtp',{host:'127.0.0.1',port:(smtp.address() as AddressInfo).port,encryption:'none',username:'',fromName:'Audit fixture',fromEmail:'sender@example.test',replyTo:''});
  const {a,n}=sequence(f),mediaId=resource(f);const download=(await f.request('/api/admin/download-pages','POST',{title:'SMTP guide',description:'A private resource.',instructions:'Download below.',buttonLabel:'Get guide',mediaId,imageId:null,status:'active'})).data;const initial=connectedPage(f,pageInput(mediaId,a.id));const input={...initial,data:{...initial.data,downloadPageId:download.id,directNewsletterId:n.id}};
  const page=await f.request('/api/admin/lead-pages','POST',input);assert.equal(page.status,201);
  const publicPage=await f.request('/api/public/lead-pages/demo-guide','GET',undefined,false);assert.equal(publicPage.status,200);assert.equal(publicPage.data.data.headline,input.data.headline);
  assert.equal((await f.request('/api/public/subscribe','POST',{...signup(),consent:false},false)).status,400);
  assert.equal((await f.request('/api/public/subscribe','POST',signup(),false)).status,202);
  const worker=new MarketingWorker(f.db,f.settings);await worker.tick();assert.equal(messages.length,0);assert.equal(f.contacts.contact(1).status,'pending');
  await new TransactionalWorker(f.db,f.settings,key).tick();assert.equal(messages.length,1);assert.match(messages[0]!,/Content-Type: text\/html/i);
  const raw=messages[0]!.replace(/=\n/g,''),confirm=raw.match(/\/confirm\/([a-f0-9]{64})/)?.[1];assert.ok(confirm);
  assert.equal((await f.request('/api/public/confirm/'+confirm,'GET',undefined,false)).status,200);assert.equal(f.contacts.contact(1).status,'pending');
  assert.equal((await f.request('/api/public/confirm/'+confirm,'POST',{},false)).status,200);
  assert.equal((await f.request('/api/public/confirm/'+confirm,'POST',{},false)).status,200);
  const admin=await f.request('/api/admin/contacts/1');assert.equal(admin.data.contact.status,'confirmed');assert.equal(admin.data.submissions[0].source_type,'lead_page');assert.ok(admin.data.submissions[0].consent_text);
  assert.equal(f.db.prepare('SELECT count(*) n FROM automation_enrollments').get()?.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()?.n,4);
  const now=Date.now()+2100;await worker.tick(now);await worker.tick(now+2100);await worker.tick(now+60000);
  const delivery=messages.slice(1).map(v=>v.replace(/=\n/g,'').replace(/=3D/g,'=')).join('\n');const downloadRaw=delivery.match(/\/downloads\/([a-f0-9]{64})/)?.[1];assert.ok(downloadRaw);const landing=await fetch(f.base+'/downloads/'+downloadRaw);assert.equal(landing.status,200);assert.match(await landing.text(),/SMTP guide/);const file=await fetch(f.base+'/download/'+downloadRaw);assert.equal(file.status,200);assert.equal(await file.text(),'Fictional private guide.');assert.equal(messages.length,4);for(const email of messages.slice(1)){assert.match(email,/List-Unsubscribe-Post: List-Unsubscribe=One-Click/i);assert.match(email,/reader@example.test|subscriber@example.test/i);assert.match(email,/Content-Type: text\/html/i);}
  const header=messages.at(-1)!.split('\n\n')[0]!.replace(/\n[ \t]+/g,' '),token=header.match(/\/api\/public\/unsubscribe\/([a-f0-9]{64})\/one-click/)?.[1];assert.ok(token);
  const unsubscribe=await fetch(f.base+'/api/public/unsubscribe/'+token+'/one-click',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'});assert.equal(unsubscribe.status,200);
  await worker.tick(now+240000);assert.equal(messages.length,4);assert.equal(f.contacts.contact(1).status,'unsubscribed');assert.equal(f.db.prepare('SELECT status FROM automation_enrollments').get()?.status,'cancelled');
  const history=await f.request('/api/admin/contacts/delivery-history?contactId=1');assert.equal(history.status,200);assert.equal(history.data.items.filter((i:{status:string})=>i.status==='sent').length,4);assert.equal(f.db.prepare("SELECT count(*) n FROM campaigns WHERE status='cancelled'").get()?.n,1);
 }finally{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>smtp.close(()=>resolve()));await f.close();}
});


test('download page journey requires confirmation, preserves resource snapshots and prevents unauthorized file access',async()=>{
 const f=await fixture();try{
  const mediaId=resource(f),input={title:'Private guide',description:'Your guide after confirmation.',instructions:'Save your copy.',buttonLabel:'Download my guide',mediaId,imageId:null,status:'active'};
  assert.equal((await f.request('/api/admin/download-pages','GET',undefined,false)).status,401);
  const created=await f.request('/api/admin/download-pages','POST',input);assert.equal(created.status,201);const download=created.data;
  const n=f.newsletters.save({...content(),html:'<h1>Hello {name}</h1><a href="{downloadUrl}">Get your resource</a>'});const page={...pageInput(),data:{...pageInput().data,downloadPageId:download.id,directNewsletterId:n.id}};
  assert.equal((await f.request('/api/admin/lead-pages','POST',{...page,data:{...page.data,deliveryMode:'single'}})).status,400);
  assert.equal((await f.request('/api/admin/lead-pages','POST',page)).status,201);
  assert.equal((await f.request('/api/admin/download-pages/'+download.id,'DELETE')).status,409);
  assert.equal((await f.request('/api/admin/download-pages/'+download.id,'PUT',{...input,status:'draft'})).status,409);
  assert.equal((await f.request('/api/admin/newsletters/'+n.id,'PUT',content())).status,409);
  const response=await f.request('/api/public/subscribe','POST',signup(),false);assert.equal(response.status,202);assert.match(response.data.message,/check spam/i);
  const raw=confirmation(f.db);assert.equal(f.contacts.inspect(raw,'confirm').downloadUrl,null);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()!.n,0);
  const fake='cd'.repeat(32);f.db.prepare('INSERT INTO download_tokens(token_hash,contact_id,submission_id,media_id,expires_at,page_snapshot) VALUES(?,?,?,?,?,?)').run(tokenHash(fake),1,1,mediaId,Date.now()+86400000,JSON.stringify(download));
  assert.equal((await fetch(f.base+'/downloads/'+fake)).status,403);assert.equal((await fetch(f.base+'/download/'+fake)).status,403);
  assert.equal((await fetch(f.base+'/downloads/'+'ef'.repeat(32))).status,404);
  const before=f.contacts.confirm(raw);assert.match(before.downloadUrl!,/^\/downloads\/[a-f0-9]{64}$/);f.contacts.confirm(raw);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()!.n,1);
  await f.request('/api/admin/download-pages/'+download.id,'PUT',{...input,title:'Changed later'});
  f.smtp();let emails=0,link='';const worker=new MarketingWorker(f.db,f.settings,async(_smtp,_recipient,email)=>{emails++;link=email.text.match(/https?:\/\/[^\s<>]+\/downloads\/[a-f0-9]{64}/)?.[0]||'';assert.ok(link);assert.ok(!email.html.includes('{downloadUrl}'));assert.ok(!email.html.includes('33-items-logo'));});await worker.tick(Date.now()+2100);assert.equal(emails,1);
  const url=new URL(link),landing=await fetch(f.base+url.pathname);assert.equal(landing.status,200);assert.equal(landing.headers.get('cache-control'),'no-store');assert.equal(landing.headers.get('x-robots-tag'),'noindex, nofollow');const html=await landing.text();assert.match(html,/Private guide/);assert.ok(!html.includes('Changed later'));assert.match(html,/33-items-logo/);assert.match(html,/Download my guide/);
  const file=await fetch(f.base+url.pathname.replace('/downloads/','/download/'));assert.equal(file.status,200);assert.equal(await file.text(),'Fictional private guide.');assert.match(file.headers.get('content-disposition')||'',/attachment/);
  const grant=tokenHash(url.pathname.split('/').at(-1)!);f.db.prepare('UPDATE download_tokens SET expires_at=0 WHERE token_hash=?').run(grant);assert.equal((await fetch(f.base+url.pathname)).status,410);
  f.contacts.unsubscribeContact(1);assert.equal((await fetch(f.base+before.downloadUrl)).status,403);await worker.tick(Date.now()+5000);assert.equal(emails,1);
 }finally{await f.close();}
});


test('a repeated funnel email keeps one related campaign while fresh access and different offers remain available',async()=>{
 const f=await fixture();try{
  f.pages.save(connectedPage(f,pageInput(resource(f))));f.contacts.signup(signup());const original=confirmation(f.db);f.contacts.confirm(original);
  f.db.prepare('UPDATE contacts SET last_confirmation_at=?').run(Date.now()-61000);
  f.contacts.signup(signup(' SUBSCRIBER@EXAMPLE.TEST '));
  assert.equal(f.db.prepare('SELECT count(*) n FROM contacts').get()?.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM lead_submissions').get()?.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()?.n,1);
  f.contacts.resendConfirmation('subscriber@example.test',{type:'lead_page',id:'demo-guide'});const fresh=confirmation(f.db);assert.notEqual(fresh,original);const recovered=f.contacts.confirm(fresh);assert.ok(recovered.downloadUrl);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()?.n,1);assert.equal(f.db.prepare("SELECT count(*) n FROM events WHERE type='lead_confirmed'").get()?.n,1);
  f.pages.save({...connectedPage(f),slug:'different-offer'});f.db.prepare('UPDATE contacts SET last_confirmation_at=?').run(Date.now()-61000);
  f.contacts.signup({...signup(),source:{type:'lead_page',id:'different-offer'}});f.contacts.confirm(confirmation(f.db));
  assert.equal(f.db.prepare('SELECT count(*) n FROM contacts').get()?.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM lead_submissions').get()?.n,2);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()?.n,2);
 }finally{await f.close();}
});
test('single opt-in repeat submissions do not repeat related delivery and changed connected emails are new journeys',async()=>{
 const f=await fixture();try{
  const input=connectedPage(f);const p=f.pages.save({...input,data:{...input.data,deliveryMode:'single'}});f.contacts.signup(signup());
  f.db.prepare("UPDATE lead_submissions SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 minutes')").run();f.contacts.signup(signup());
  assert.equal(f.db.prepare('SELECT count(*) n FROM lead_submissions').get()?.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()?.n,1);assert.equal(f.db.prepare('SELECT email_verified_at FROM contacts').get()?.email_verified_at,null);
  const next=f.newsletters.save({...content(),title:'Different offer email'});f.pages.emailConnections(p.id,{directNewsletterId:next.id,automationId:null,confirmationSubject:p.data.confirmationSubject,confirmationBody:p.data.confirmationBody});f.contacts.signup(signup());assert.equal(f.db.prepare('SELECT count(*) n FROM campaigns').get()?.n,2);assert.equal(f.db.prepare('SELECT count(*) n FROM contacts').get()?.n,1);
 }finally{await f.close();}
});
test('video headers require a public video to publish and render both subscription and affiliate actions',async()=>{
 const f=await fixture();try{
  const contentStore=new ContentStore(f.db,f.settings);
  const draft=contentStore.saveItem({kind:'hero',slug:'video-promotion',title:'Video promotion',position:0,status:'draft',data:{type:'video',slides:[{key:'video-event',headline:'A helpful demonstration',description:'Watch the details before choosing.',action:'lead_capture',ctaLabel:'Subscribe for details'}]}});
  const {id,...input}=draft;assert.throws(()=>contentStore.saveItem({...input,status:'active'},id),/uploaded video or supported video link/);
  const videoId=Number(f.db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES('video.mp4','fixture-video.mp4','video/mp4',40,'mp4','video','public')").run().lastInsertRowid);
  const slides=draft.data.slides as Record<string,unknown>[];contentStore.saveItem({...input,status:'active',data:{...draft.data,slides:slides.map(s=>({...s,videoId}))}},id);contentStore.activateHeader(id);
  const render=()=>{const site=contentStore.publicSite();return renderToStaticMarkup(createElement(HeroHeader,{hero:site.items.find(i=>i.id===id),offers:site.items.filter(i=>i.kind==='offer'),siteName:'33 items',description:'Default text',eyebrow:'Useful resources',consentText:'Explicit consent',disclosure:'Affiliate disclosure'}));};
  const subscription=render();assert.match(subscription,/<video[^>]*controls/);assert.ok(subscription.includes('/media/'+videoId));assert.ok(subscription.includes('A helpful demonstration'));assert.ok(subscription.includes('Watch the details before choosing.'));assert.match(subscription,/<button[^>]*>Subscribe for details<\/button>/);
  const capture={name:'Video reader',email:'video-reader@example.test',country:'RW',consent:true,source:{type:'hero',id:String(id),promotionId:'video-event'}};f.contacts.signup(capture);f.contacts.confirm(confirmation(f.db));
  f.db.prepare('UPDATE contacts SET last_confirmation_at=0').run();f.db.prepare("UPDATE lead_submissions SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 minutes')").run();f.contacts.signup(capture);
  assert.equal(f.db.prepare('SELECT count(*) n FROM lead_submissions').get()?.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM admin_notifications').get()?.n,2);assert.equal(f.db.prepare('SELECT count(*) n FROM transactional_outbox').get()?.n,1);
  const offer=contentStore.saveItem({kind:'offer',slug:'video-offer',title:'Video offer',position:0,status:'active',data:{description:'Details',action:'affiliate',destination:'https://provider.example.test/item'}});
  contentStore.saveItem({...input,status:'active',data:{...draft.data,slides:slides.map(s=>({...s,videoId,action:'affiliate',offerId:offer.id,ctaLabel:'Visit the provider'}))}},id);
  const affiliate=render();assert.ok(affiliate.includes('href="/go/video-offer?hero='));assert.ok(affiliate.includes('rel="sponsored noopener"'));assert.ok(affiliate.includes('Visit the provider'));
 }finally{await f.close();}
});
