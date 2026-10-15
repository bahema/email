import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import {configurationSchema} from '../src/config.js';
import {defaultSettings,settingsSchemas} from '../src/settings/schema.js';
import {SettingsStore} from '../src/settings/store.js';
import {openDatabase} from '../src/db/database.js';
import {migrate} from '../src/db/migrations.js';
import {createApp,errorHandler} from '../src/app.js';
import {ContentStore} from '../src/content/store.js';
import {pageMetadata,renderPageHtml} from '../src/seo.js';

const key='ab'.repeat(32),origin='https://example.test';
test('public setting URLs reject embedded credentials and private logo endpoints',()=>{
 const s=defaultSettings(origin,'Africa/Kigali');
 for(const field of ['siteUrl','logoUrl'] as const)assert.equal(settingsSchemas.general.safeParse({...s.general,[field]:'https://owner:fictional-secret@example.test/logo.jpg'}).success,false);
 for(const field of ['privacyUrl','termsUrl','affiliateDisclosureUrl'] as const)assert.equal(settingsSchemas.compliance.safeParse({...s.compliance,[field]:'https://owner:fictional-secret@example.test/policy'}).success,false);
 for(const path of ['/download/token','/downloads/token','/api/admin/media/1/file'])assert.equal(settingsSchemas.general.safeParse({...s.general,logoUrl:origin+path}).success,false);
 assert.equal(settingsSchemas.general.safeParse({...s.general,logoUrl:origin+'/media/1?v=1'}).success,true);
});
test('production rejects plain HTTP and missing encryption key while local development remains supported',()=>{
 assert.equal(configurationSchema.safeParse({NODE_ENV:'production',SITE_URL:'http://example.test',SETTINGS_ENCRYPTION_KEY:key}).success,false);
 assert.equal(configurationSchema.safeParse({NODE_ENV:'production',SITE_URL:origin}).success,false);
 assert.equal(configurationSchema.safeParse({NODE_ENV:'production',SITE_URL:origin,SETTINGS_ENCRYPTION_KEY:key}).success,true);
 assert.equal(configurationSchema.safeParse({NODE_ENV:'development',SITE_URL:'http://localhost:5173'}).success,true);
});
test('public APIs exclude private credentials and every audited owner route requires authentication with no caching',async()=>{
 const db=openDatabase(':memory:');const version=migrate(db),settings=new SettingsStore(db,key,origin,'Africa/Kigali');
 db.prepare('INSERT INTO admin(id,email,password_hash) VALUES(1,?,?)').run('private-owner@example.test','private-password-hash-fixture');
 const {passwordSet:_passwordSet,...smtp}=settings.read().smtp;settings.save('smtp',{...smtp,host:'smtp.example.test',username:'private-smtp-user',password:'private-smtp-password-fixture'});
 const ciphertext=String(JSON.parse(String(db.prepare("SELECT value FROM settings WHERE key='smtp_password'").get()!.value)));
 const app=createApp(db,version,{secureCookies:true,sessionHours:8,siteUrl:origin,allowLoopbackOrigins:false,encryptionKey:key,timezone:'Africa/Kigali',environment:'test'});app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+String((server.address() as AddressInfo).port);
 try{
  for(const path of ['/api/public/site','/api/public/bootstrap','/api/public/page-metadata','/api/public/activity','/api/auth/session']){
   const response=await fetch(base+path);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.text();
   for(const secret of ['private-owner@example.test','private-password-hash-fixture','private-smtp-user','private-smtp-password-fixture',ciphertext])assert.ok(!body.includes(secret),path+' exposes private fixture');
  }
  for(const path of ['/api/admin/email-dns-readiness','/api/admin/settings','/api/admin/content','/api/admin/media','/api/admin/contacts','/api/admin/newsletters','/api/admin/campaigns','/api/admin/segments','/api/admin/lead-pages','/api/admin/automations','/api/admin/download-pages','/api/admin/activity-log','/api/admin/delivery-log','/api/admin/analytics','/api/admin/system','/api/admin/broadcast-options']){
   const response=await fetch(base+path);assert.equal(response.status,401,path);assert.equal(response.headers.get('cache-control'),'no-store',path);
  }
  for(const path of ['/.env','/.git/config','/data/affiliate.sqlite','/api/auth/signup'])assert.equal((await fetch(base+path)).status,404,path);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
test('resource share HTML has item-specific Open Graph, Twitter and canonical metadata before JavaScript',()=>{
 const db=openDatabase(':memory:');migrate(db);const settings=new SettingsStore(db,key,origin,'Africa/Kigali'),content=new ContentStore(db,settings);
 try{
  const item=content.saveItem({kind:'offer',slug:'audit-resource',title:'A useful resource',position:0,status:'active',data:{description:'An accurate item description.',imageId:null,category:'Software',action:'affiliate',destination:'https://provider.example.test/item',ctaLabel:'View provider',tags:[],resourceId:null}});
  const meta=pageMetadata(db,settings,'/resources/offer/'+item.slug),html=renderPageHtml('<html><head><title>Default</title></head><body><div id="root"></div></body></html>',meta);
  assert.equal(meta.noindex,false);assert.equal(meta.canonical,origin+'/resources/offer/audit-resource');assert.equal(meta.description,'An accurate item description.');
  for(const tag of ['og:title','og:description','og:image','og:url','twitter:card','twitter:title','twitter:image','page-structured-data'])assert.ok(html.includes(tag),tag);
  assert.ok(html.includes('A useful resource'));assert.equal((html.match(/<title>/g)||[]).length,1);
  const privateHtml=renderPageHtml('<html><head></head><body></body></html>',pageMetadata(db,settings,'/confirm/private-fixture-token'));
  assert.ok(!privateHtml.includes('private-fixture-token'));assert.ok(privateHtml.includes('noindex, nofollow'));
 }finally{db.close();}
});
