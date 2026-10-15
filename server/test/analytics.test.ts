import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { openDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrations.js';
import { AnalyticsStore,calendar,dayStart,dateWindow } from '../src/analytics/store.js';
import { createApp,errorHandler } from '../src/app.js';
import { hashPassword } from '../src/security/crypto.js';
import { NewsletterStore } from '../src/marketing/newsletters.js';
import { AutomationStore } from '../src/automations/store.js';
import { CampaignStore } from '../src/marketing/campaigns.js';
function contact(db:ReturnType<typeof openDatabase>,email:string,date:string,status='confirmed'){return Number(db.prepare("INSERT INTO contacts(name,email,country,continent,status,source_type,source_id,source_label,created_at) VALUES('Fictional Reader',?,'RW','Africa',?,'lead_page','guide','Guide',?)").run(email,status,date).lastInsertRowid);}
function submission(db:ReturnType<typeof openDatabase>,id:number,date:string){return Number(db.prepare("INSERT INTO lead_submissions(contact_id,name,country,source_type,source_id,source_label,consent_text,utm,tags,created_at,confirmed_at) VALUES(?,'Fictional Reader','RW','lead_page','guide','Guide','I agree','{}','[]',?,?)").run(id,date,date).lastInsertRowid);}
test('calendar periods honor Kigali midnight and 23/25-hour daylight-saving days',()=>{
 assert.equal(new Date(dayStart('2026-10-07','Africa/Kigali')).toISOString(),'2026-10-06T22:00:00.000Z');
 assert.equal(dayStart('2026-03-09','America/New_York')-dayStart('2026-03-08','America/New_York'),23*3600000);
 assert.equal(dayStart('2026-11-02','America/New_York')-dayStart('2026-11-01','America/New_York'),25*3600000);
 assert.equal(calendar('Pacific/Auckland')(dayStart('2026-10-07','Pacific/Auckland')),'2026-10-07');
 const w=dateWindow('7d','Africa/Kigali',Date.parse('2026-10-07T12:00:00Z'));assert.equal(w.from,'2026-09-30T22:00:00.000Z');assert.equal(dateWindow('all','Africa/Kigali').from,null);
});
test('analytics separate creation cohorts, sent-time metrics, tracked denominators and historical page sources',()=>{
 const db=openDatabase(':memory:');migrate(db);try{
  const old=contact(db,'old@example.test','2026-09-01T00:00:00.000Z'),recent=contact(db,'new@example.test','2026-10-06T22:30:00.000Z','pending');submission(db,recent,'2026-10-06T22:30:00.000Z');
  const n=new NewsletterStore(db).save({title:'Demo',subject:'Demo',html:'<p>Demo</p>',preheader:'',status:'ready'}),c=new CampaignStore(db).save({name:'Demo',newsletterId:n.id,audience:{type:'all'}});
  db.prepare("INSERT INTO email_queue(campaign_id,contact_id,newsletter_id,recipient,subject,status,scheduled_at,created_at,sent_at,track_opens,track_clicks,opened_at,clicked_at) VALUES(?,?,?,'old@example.test','Demo','sent',0,'2026-09-01T00:00:00.000Z','2026-10-07T00:00:00.000Z',1,1,'2026-10-07T01:00:00.000Z','2026-10-07T02:00:00.000Z')").run(c.id,old,n.id);
  db.prepare("INSERT INTO events(type,metadata,created_at) VALUES('affiliate_clicked','{}','2026-10-07T01:00:00.000Z')").run();
  const a=new AnalyticsStore(db).summary('today','Africa/Kigali',Date.parse('2026-10-07T12:00:00Z'));assert.equal(a.totalLeads,1);assert.equal(a.pending,1);assert.equal(a.newLeadsToday,1);assert.equal(a.sent,1);assert.equal(a.openTracked,1);assert.equal(a.opened,1);assert.equal(a.clicked,1);assert.equal(a.affiliateClicks,1);assert.equal(a.topPages[0]?.slug,'guide');assert.deepEqual(a.daily,[{date:'2026-10-07',count:1}]);
 }finally{db.close();}
});
test('logs paginate deterministically, filter kind/status and strip arbitrary event metadata',()=>{
 const db=openDatabase(':memory:');migrate(db);try{
  const id=contact(db,'reader@example.test','2026-10-01T00:00:00.000Z');
  for(let i=0;i<55;i++)db.prepare("INSERT INTO events(type,metadata,created_at,contact_id) VALUES('lead_confirmed',?,'2026-10-07T00:00:00.000Z',?)").run(JSON.stringify({submissionId:i,payload:'secret',token:'secret',answers:{private:'answer'}}),id);
  const store=new AnalyticsStore(db),first=store.activity('all','Africa/Kigali',1,'lead_confirmed',Date.parse('2026-10-08T00:00:00Z')),second=store.activity('all','Africa/Kigali',2,'lead_confirmed',Date.parse('2026-10-08T00:00:00Z'));assert.equal(first.total,55);assert.equal(first.items.length,50);assert.equal(second.items.length,5);assert.ok(Number(first.items.at(-1)!.id)>Number(second.items[0]!.id));assert.deepEqual(first.items[0]!.metadata,{submissionId:54});assert.equal(store.deliveries('all','Africa/Kigali',1,'failed','transactional').total,0);
 }finally{db.close();}
});
test('sequence tag actions wait for a due running step and preserve enrollment snapshots',()=>{
 const db=openDatabase(':memory:');migrate(db);try{
  const id=contact(db,'reader@example.test','2026-10-07T00:00:00.000Z'),s=submission(db,id,'2026-10-07T00:00:00.000Z'),n=new NewsletterStore(db).save({title:'Demo',subject:'Demo',html:'<p>Demo</p>',preheader:'',status:'ready'}),autos=new AutomationStore(db),campaigns=new CampaignStore(db);
  const a=autos.save({name:'Demo',status:'paused',steps:[{newsletterId:n.id,delayMinutes:0,tags:['original']}]});autos.enroll(a.id,id,s,1000);campaigns.resolveDue(2000);assert.equal(db.prepare('SELECT count(*) n FROM contact_tags').get()?.n,0);
  autos.save({name:'Demo',status:'running',steps:[{newsletterId:n.id,delayMinutes:0,tags:['edited']}]},a.id);campaigns.resolveDue(2000);campaigns.resolveDue(3000);assert.deepEqual(db.prepare('SELECT name FROM tags').all().map(r=>r.name),['original']);assert.equal(db.prepare('SELECT count(*) n FROM contact_tags').get()?.n,1);
 }finally{db.close();}
});
test('analytics HTTP routes require admin, validate filters and apply no-store/privacy headers',async()=>{
 const db=openDatabase(':memory:');const version=migrate(db),password='fictional-final-password';db.prepare('INSERT INTO admin(id,email,password_hash) VALUES(1,?,?)').run('owner@example.test',await hashPassword(password));
 const app=createApp(db,version,{secureCookies:false,sessionHours:8,siteUrl:'http://localhost:5173',allowLoopbackOrigins:true,encryptionKey:'ab'.repeat(32),timezone:'Africa/Kigali',environment:'test'});app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try{
  for(const path of ['/analytics','/activity-log','/delivery-log'])assert.equal((await fetch(base+'/api/admin'+path)).status,401);
  const session=await fetch(base+'/api/auth/session'),csrf=(await session.json()).csrfToken,cookie=session.headers.getSetCookie().at(-1)!.split(';')[0]!;
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.test',password})});assert.equal(login.status,200);const auth={Cookie:login.headers.getSetCookie().at(-1)!.split(';')[0]!};
  const response=await fetch(base+'/api/admin/analytics?range=today',{headers:auth});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal((await response.json()).sent,0);
  for(let i=0;i<1020;i++)db.prepare("INSERT INTO events(type,metadata) VALUES('export_fixture','{}')").run();
  db.prepare("INSERT INTO events(type,metadata) VALUES('=unsafe',?)").run(JSON.stringify({token:'DO-NOT-EXPORT',payload:'DO-NOT-EXPORT',section:'smtp'}));
  assert.equal((await fetch(base+'/api/admin/logs-export?view=activity')).status,401);
  const exported=await fetch(base+'/api/admin/logs-export?view=activity',{headers:auth});assert.equal(exported.status,200);assert.equal(exported.headers.get('cache-control'),'no-store');const csv=await exported.text();assert.ok(csv.includes("'=unsafe"));assert.ok(!csv.includes('DO-NOT-EXPORT'));assert.equal(csv.trim().split('\r\n').length,1001);assert.equal((await fetch(base+'/api/admin/log-types',{headers:auth})).status,200);
  for(const path of ['/delivery-log?contactId=-1','/activity-log?automationId=0','/logs-export?view=wrong'])assert.equal((await fetch(base+'/api/admin'+path,{headers:auth})).status,400);
  for(const path of ['/analytics?start=2026-02-30&end=2026-03-01','/analytics?start=2026-01-01','/analytics?start=2025-01-01&end=2026-10-01','/analytics?range=bad','/delivery-log?page=0','/delivery-log?kind=bad','/automations/not-an-id/details'])assert.equal((await fetch(base+'/api/admin'+path,{headers:auth})).status,400);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});

test('public origins reject paths, credentials and non-web schemes',async()=>{
 const {siteOrigin}=await import('../src/settings/schema.js');
 for(const value of ['https://example.test/base','https://owner:secret@example.test','javascript:alert(1)','https://example.test/?query=1','https://example.test/#token'])assert.equal(siteOrigin.safeParse(value).success,false);
 assert.equal(siteOrigin.safeParse('https://example.test/').success,true);
});

test('analytics reconcile every status and separate lead-page deliveries from audience campaigns',()=>{
 const db=openDatabase(':memory:');migrate(db);try{
  const date='2026-10-07T01:00:00.000Z',now=Date.parse('2026-10-07T12:00:00Z');
  for(const status of ['pending','confirmed','unsubscribed','bounced','complained','suppressed'])contact(db,status+'@example.test',date,status);
  const id=Number(db.prepare('SELECT id FROM contacts LIMIT 1').get()!.id),sid=submission(db,id,date);
  const n=new NewsletterStore(db).save({title:'Fixture',subject:'Fixture',html:'<p>Fixture</p>',preheader:'',status:'ready'}),campaigns=new CampaignStore(db);
  const audience=campaigns.save({name:'Audience fixture',newsletterId:n.id,audience:{type:'all'}}),lead=campaigns.save({name:'Lead fixture',newsletterId:n.id,audience:{type:'all'}});
  db.prepare('UPDATE campaigns SET created_at=?').run(date);db.prepare('UPDATE campaigns SET lead_submission_id=? WHERE id=?').run(sid,lead.id);
  for(const c of [audience,lead])db.prepare("INSERT INTO email_queue(campaign_id,contact_id,newsletter_id,recipient,subject,status,scheduled_at,created_at,sent_at) VALUES(?,?,?,'fixture@example.test','Fixture','sent',0,?,?)").run(c.id,id,n.id,date,date);
  const store=new AnalyticsStore(db),r=store.summary('today','Africa/Kigali',now);
  assert.equal(r.totalLeads,6);assert.equal(r.confirmed+r.pending+r.unsubscribed+r.bounced+r.complained+r.suppressed,6);
  assert.deepEqual(r.recentCampaigns.map(c=>c.id),[audience.id]);assert.equal(r.countries[0]?.count,6);assert.equal(r.sources[0]?.count,6);
  assert.equal(store.deliveries('today','Africa/Kigali',1,'','lead_page',now).total,1);assert.equal(store.deliveries('today','Africa/Kigali',1,'','manual',now).total,1);
  const drill=store.deliveries('today','Africa/Kigali',1,'','',now,lead.id);assert.equal(drill.total,1);assert.equal(drill.items[0]?.kind,'lead_page');assert.equal(drill.timezone,'Africa/Kigali');
  const historical=store.summary('all','Africa/Kigali',now,{from:'2026-10-01T22:00:00.000Z',to:'2026-10-02T21:59:59.999Z'});assert.equal(historical.totalLeads,0);assert.deepEqual(historical.daily,[{date:'2026-10-02',count:0}]);
 }finally{db.close();}
});


test('log investigation correlates recipients, sources and safe metadata without returning payloads',()=>{
 const db=openDatabase(':memory:');migrate(db);try{
 const date='2026-10-07T01:00:00.000Z',now=Date.parse('2026-10-08T12:00:00Z'),id=contact(db,'reader@example.test',date),sid=submission(db,id,date),n=new NewsletterStore(db).save({title:'Demo',subject:'Demo',html:'<p>Demo</p>',preheader:'',status:'ready'}),c=new CampaignStore(db).save({name:'Linked guide',newsletterId:n.id,audience:{type:'all'}});
 db.prepare('UPDATE campaigns SET lead_submission_id=? WHERE id=?').run(sid,c.id);
 db.prepare("INSERT INTO email_queue(campaign_id,contact_id,newsletter_id,recipient,subject,status,scheduled_at,created_at,last_error) VALUES(?,?,?,'reader@example.test','Demo','failed',0,?,'Delivery outcome uncertain')").run(c.id,id,n.id,date);
 db.prepare('INSERT INTO events(type,contact_id,metadata,created_at) VALUES(?,?,?,?)').run('email_failed',id,JSON.stringify({campaignId:c.id,submissionId:sid,uncertain:true,password:'secret',fingerprint:'secret'}),date);
 const store=new AnalyticsStore(db),r=store.deliveries('all','Africa/Kigali',1,'','',now,undefined,{search:'linked guide',contactId:id,sourceId:'guide'});assert.equal(r.total,1);assert.equal(r.items[0]?.contact_id,id);assert.equal(r.items[0]?.source_id,'guide');assert.equal(r.items[0]?.campaign_id,c.id);assert.deepEqual(r.stats,[{status:'failed',count:1}]);assert.ok(!JSON.stringify(r).includes('payload'));
 assert.equal(store.deliveries('all','Africa/Kigali',1,'','',now,undefined,{contactId:id+1}).total,0);
 const a=store.activity('all','Africa/Kigali',1,'',now,{search:'reader',sourceId:'guide',contactId:id},c.id);assert.equal(a.total,1);assert.equal(a.items[0]?.recipient,'reader@example.test');assert.deepEqual(a.items[0]?.metadata,{campaignId:c.id,submissionId:sid,uncertain:true});
 assert.equal(store.activity('all','Africa/Kigali',1,'',now,{search:'%'}).total,0);
 const autos=new AutomationStore(db),sequence=autos.save({name:'Journey',status:'running',steps:[{newsletterId:n.id,delayMinutes:0}]} );autos.enroll(sequence.id,id,sid,0);db.prepare("UPDATE events SET created_at=? WHERE type='automation_enrolled'").run(date);const enrollment=Number(db.prepare('SELECT id FROM automation_enrollments WHERE automation_id=?').get(sequence.id)!.id),sequenceCampaign=new CampaignStore(db).save({name:'Sequence sample',newsletterId:n.id,audience:{type:'all'}});db.prepare('UPDATE campaigns SET automation_enrollment_id=? WHERE id=?').run(enrollment,sequenceCampaign.id);
 db.prepare("INSERT INTO email_queue(campaign_id,contact_id,newsletter_id,recipient,subject,status,scheduled_at,created_at) VALUES(?,?,?,'reader@example.test','Demo','pending',0,?)").run(sequenceCampaign.id,id,n.id,date);
 db.prepare('INSERT INTO events(type,contact_id,metadata,created_at) VALUES(?,?,?,?)').run('newsletter_sent',id,JSON.stringify({campaignId:sequenceCampaign.id}),date);
 assert.equal(store.deliveries('all','Africa/Kigali',1,'','',now,undefined,{automationId:sequence.id,sourceId:'guide'}).total,1);
 const sequenceEvents=store.activity('all','Africa/Kigali',1,'',now,{automationId:sequence.id,sourceId:'guide'});assert.equal(sequenceEvents.total,2);assert.ok(sequenceEvents.items.some(row=>row.type==='newsletter_sent'));assert.ok(!sequenceEvents.items.some(row=>row.type==='email_failed'));

 }finally{db.close();}
});
