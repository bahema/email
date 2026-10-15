import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrations.js';
import { NewsletterStore } from '../src/marketing/newsletters.js';
import { CampaignStore } from '../src/marketing/campaigns.js';
import { nextRun,localRun } from '../src/marketing/recurrence.js';
const email={title:'Daily update',subject:'Daily update',preheader:'',html:'<p>Update</p>',status:'ready'};
test('recurring campaigns are paused by default, freeze one occurrence and never duplicate or backfill missed runs',()=>{
 const db=openDatabase(':memory:');migrate(db);try{
  db.prepare("INSERT INTO contacts(name,email,country,continent,status,source_type,source_id,source_label) VALUES('Reader','reader@example.test','RW','Africa','confirmed','footer','footer','Footer')").run();
  db.prepare("INSERT INTO contacts(name,email,country,continent,status,source_type,source_id,source_label) VALUES('Pending','pending@example.test','RW','Africa','pending','footer','footer','Footer')").run();
  const newsletters=new NewsletterStore(db),n=newsletters.save(email),store=new CampaignStore(db),now=Date.parse('2026-10-07T06:00:00Z');
  const r=store.saveRecurring({name:'Daily',newsletterId:n.id,audience:{type:'all'},interval:'daily',timezone:'Africa/Kigali',localTime:'09:00',startDate:'2026-10-07'},now)!;
  assert.equal(r.status,'paused');store.resolveDue(now+86400000);assert.equal(store.list().length,0);
  store.controlRecurring(Number(r.id),'running',now);const due=Date.parse('2026-10-07T07:00:00Z');store.resolveDue(due);store.resolveDue(due);assert.equal(store.occurrenceHistory(Number(r.id)).length,1);assert.equal(db.prepare('SELECT count(*) n FROM email_queue').get()!.n,1);
  newsletters.save({...email,subject:'Edited tomorrow'},n.id);assert.equal(JSON.parse(store.get(store.list()[0]!.id).snapshot!).subject,'Daily update');
  store.resolveDue(Date.parse('2026-10-15T08:00:00Z'));assert.equal(store.occurrenceHistory(Number(r.id)).length,2);assert.ok(Number(store.recurring()[0]!.next_run)>Date.parse('2026-10-15T08:00:00Z'));
  store.controlRecurring(Number(r.id),'paused',Date.parse('2026-10-15T08:00:00Z'));store.resolveDue(Date.parse('2026-10-17T09:00:00Z'));assert.equal(store.occurrenceHistory(Number(r.id)).length,2);
  store.controlRecurring(Number(r.id),'running',Date.parse('2026-10-17T09:00:00Z'));assert.ok(Number(store.recurring()[0]!.next_run)>Date.parse('2026-10-17T09:00:00Z'));
 }finally{db.close();}
});
test('recurrence keeps local sending time across DST and weekly anchors',()=>{
 assert.equal(new Date(localRun('2026-03-08','09:00','America/New_York')).toISOString(),'2026-03-08T13:00:00.000Z');
 assert.equal(new Date(localRun('2026-11-01','09:00','America/New_York')).toISOString(),'2026-11-01T14:00:00.000Z');
 assert.equal(new Date(nextRun('2026-10-07','09:00','Africa/Kigali','weekly',Date.parse('2026-10-08T00:00:00Z'))).toISOString(),'2026-10-14T07:00:00.000Z');
 assert.equal(new Date(localRun('2026-03-08','02:30','America/New_York')).toISOString(),'2026-03-08T07:00:00.000Z');
});
test('unready recurring content pauses the schedule instead of sending or blocking other campaigns',()=>{
 const db=openDatabase(':memory:');migrate(db);try{const newsletters=new NewsletterStore(db),n=newsletters.save(email),store=new CampaignStore(db),now=Date.parse('2026-10-07T06:00:00Z');const r=store.saveRecurring({name:'Daily',newsletterId:n.id,audience:{type:'all'},interval:'daily',timezone:'Africa/Kigali',localTime:'09:00',startDate:'2026-10-07'},now)!;store.controlRecurring(Number(r.id),'running',now);newsletters.save({...email,status:'draft'},n.id);store.resolveDue(now+3600000);assert.equal(store.recurring()[0]!.status,'paused');assert.equal(store.list().length,0);assert.throws(()=>newsletters.remove(n.id));}finally{db.close();}
});
