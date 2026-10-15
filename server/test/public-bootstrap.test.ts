import {renderPublic} from '../../client/src/public/server-render.js';
import {ContactStore} from '../src/contacts/store.js';
import {ContentStore} from '../src/content/store.js';
import {decryptSecret} from '../src/security/crypto.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db/database.js';
import {migrate} from '../src/db/migrations.js';
import {SettingsStore} from '../src/settings/store.js';
import {publicActivity,initialHtml,publicBootstrap,setPublicRenderer} from '../src/public-bootstrap.js';
test('initial public document includes escaped bootstrap, visible content and metadata without admin secrets',()=>{const db=openDatabase(':memory:');migrate(db);try{const settings=new SettingsStore(db,'ab'.repeat(32),'http://localhost:5173','Africa/Kigali');settings.save('general',{...settings.read().general,siteName:'Brand </script><script>bad</script>'});settings.save('smtp',{...Object.fromEntries(Object.entries(settings.read().smtp).filter(([k])=>k!=='passwordSet')),password:'private-smtp-secret'});const html=initialHtml('<html><head></head><body><div id="root"></div></body></html>',db,settings,'/','localhost');assert.ok(html.includes('id="public-bootstrap"'));assert.ok(!html.includes('<div id="root"></div>'));assert.ok(html.includes('rel="canonical"'));assert.ok(!html.includes('private-smtp-secret'));assert.ok(html.includes('\\u003c/script>'));const raw=html.match(/<script type="application\/json" id="public-bootstrap">([\s\S]*?)<\/script>/)![1]!;assert.equal(JSON.parse(raw).site.name,'Brand </script><script>bad</script>');assert.ok(!initialHtml('<head></head><div id="root"></div>',db,settings,'/admin','localhost').includes('id="public-bootstrap"'));}finally{db.close();}});
test('public activity protects small groups, excludes test identities and honors settings',()=>{const db=openDatabase(':memory:');migrate(db);try{const settings=new SettingsStore(db,'ab'.repeat(32),'http://localhost:5173','Africa/Kigali');const insert=(email:string,name='Reader')=>db.prepare("INSERT INTO contacts(name,email,country,continent,status,source_type,source_id,source_label,email_verified_at,confirmed_at) VALUES(?,?,'RW','Africa','confirmed','footer','footer','Footer',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run(name,email);for(let i=0;i<4;i++)insert(`reader${i}@fixture-mail.org`);insert('demo@example.test','Demo');assert.equal(publicActivity(db,settings).messages.length,0);insert('reader4@fixture-mail.org');const feed=publicActivity(db,settings);assert.equal(feed.messages.length,1);assert.match(feed.messages[0]!.text,/5.*Rwanda/);assert.ok(!JSON.stringify(feed).includes('reader'));settings.save('activity',{enabled:false,showLocations:true,days:30,intervalSeconds:8});assert.equal(publicActivity(db,settings).enabled,false);assert.equal(publicActivity(db,settings).messages.length,0);}finally{db.close();}});


test('public first HTML uses the actual page components and includes safe action state before hydration',()=>{
 const db=openDatabase(':memory:');migrate(db);const key='ab'.repeat(32),settings=new SettingsStore(db,key,'http://localhost:5173','Africa/Kigali');
 setPublicRenderer(renderPublic);
 try{
  const contacts=new ContactStore(db,settings,new ContentStore(db,settings),key);
  contacts.signup({name:'Reader',email:'render@example.test',country:'RW',consent:true,source:{type:'footer',id:'footer'}});
  const payload=JSON.parse(decryptSecret(String(db.prepare('SELECT payload FROM transactional_outbox LIMIT 1').get()!.payload),key,'contact-mail'));
  const confirmation=payload.text.match(/\/confirm\/([a-f0-9]{64})/)[1],unsubscribe=payload.text.match(/\/unsubscribe\/([a-f0-9]{64})/)[1];
  const template='<html><head></head><body><div id="root"></div></body></html>';
  for(const [path,label] of [['/','Resource library'],['/privacy','Privacy policy'],['/unsubscribe','Request unsubscribe link'],['/confirm/'+confirmation,'Confirm subscription'],['/unsubscribe/'+unsubscribe,'Unsubscribe from emails']]){
   const html=initialHtml(template,db,settings,path!,'localhost',true);
   assert.ok(html.includes('data-rendered="true"'));assert.ok(html.includes(label!));assert.ok(html.includes('expanded-footer'));assert.ok(!html.includes('initial-footer'));
   const boot=JSON.parse(html.match(/<script type="application\/json" id="public-bootstrap">([\s\S]*?)<\/script>/)![1]!);
   assert.equal(boot.storageSaved,true);assert.ok(!html.includes('id="storage-title"'));
   assert.ok(html.includes(renderPublic(boot,path!)));
  }
  assert.equal(db.prepare('SELECT status FROM contacts LIMIT 1').get()?.status,'pending');assert.equal(db.prepare('SELECT count(*) n FROM campaigns').get()?.n,0);
  const invalid=initialHtml(template,db,settings,'/confirm/invalid','localhost');assert.ok(invalid.includes('This link is invalid'));assert.ok(invalid.includes('subscription-action'));
  contacts.confirm(confirmation);const completed=publicBootstrap(db,settings,'/confirm/'+confirmation,'localhost');assert.equal(completed.action?.info?.completed,true);
  assert.ok(initialHtml(template,db,settings,'/confirm/'+confirmation,'localhost').includes(completed.action!.info!.headline));
 }finally{db.close();}
});
