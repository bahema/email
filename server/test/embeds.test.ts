import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {defaultEmbeds,newFaqEmbed,websiteEmbedUrl} from '@affiliate/shared';
import {embedSectionSchema,embedPreviewHtml} from '../src/content/embeds.js';
import {openDatabase} from '../src/db/database.js';
import {migrate} from '../src/db/migrations.js';
import {SettingsStore} from '../src/settings/store.js';
import {ContentStore} from '../src/content/store.js';
import {FaqWithEmbed} from '../../client/src/public/FaqWithEmbed.tsx';
import {createApp,errorHandler} from '../src/app.js';
import {hashPassword} from '../src/security/crypto.js';

const draft={...newFaqEmbed('demo'),title:'Provider <preview>',url:'https://example.com/product'};
test('embed validation restricts protocols, providers and publishing requirements',()=>{
 for(const url of ['http://example.com','javascript:alert(1)','https://localhost','https://127.0.0.1','https://user:pass@example.com','https://example.local','https://example.com:8443'])assert.equal(websiteEmbedUrl(url),null,url);
 assert.ok(websiteEmbedUrl(draft.url));
 assert.equal(embedSectionSchema.safeParse({...defaultEmbeds,items:[draft]}).success,true);
 assert.equal(embedSectionSchema.safeParse({...defaultEmbeds,items:[draft,draft]}).success,false);
 assert.equal(embedSectionSchema.safeParse({...defaultEmbeds,enabled:true}).success,false);
 assert.equal(embedSectionSchema.safeParse({...defaultEmbeds,items:[{...draft,status:'active',offerId:1}]}).success,false);
 assert.equal(embedSectionSchema.safeParse({...defaultEmbeds,items:[{...draft,type:'video',url:'https://example.com/movie.mp4'}]}).success,false);
 assert.equal(embedSectionSchema.safeParse({...defaultEmbeds,items:[{...draft,type:'video',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}]}).success,true);
 const html=embedPreviewHtml(draft);assert.match(html,/Provider &lt;preview&gt;/);assert.match(html,/target="_blank" rel="noopener noreferrer"/);assert.match(html,/sandbox="allow-scripts allow-forms"/);assert.doesNotMatch(html,/<script|allow-top-navigation|allow-popups/);
});
test('owner preview is authenticated and isolates draft origins from public CSP',async()=>{
 const db=openDatabase(':memory:');migrate(db);const key='ef'.repeat(32),password='fictional-owner-password';
 db.prepare('INSERT INTO admin(id,email,password_hash) VALUES(1,?,?)').run('owner@example.test',await hashPassword(password));
 const settings=new SettingsStore(db,key,'https://our-site.example','UTC'),store=new ContentStore(db,settings);
 store.saveSection('embeds',{...defaultEmbeds,items:[{...draft,url:'https://draft.example.com/product'}]});
 const app=createApp(db,20,{secureCookies:false,sessionHours:8,siteUrl:'https://our-site.example',allowLoopbackOrigins:true,encryptionKey:key,timezone:'UTC',environment:'test'});app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{
 const denied=await fetch(base+'/api/admin/content/embeds/demo/preview');assert.equal(denied.status,401);assert.doesNotMatch(denied.headers.get('content-security-policy')??'',/draft.example.com|frame-src https:/);
 const session=await fetch(base+'/api/auth/session');let cookie=session.headers.getSetCookie().at(-1)!.split(';')[0]!;const token=(await session.json()).csrfToken;
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify({email:'owner@example.test',password})});assert.equal(login.status,200);cookie=login.headers.getSetCookie().at(-1)!.split(';')[0]!;
 const preview=await fetch(base+'/api/admin/content/embeds/demo/preview',{headers:{Cookie:cookie}});assert.equal(preview.status,200);assert.equal(preview.headers.get('cache-control'),'no-store');assert.match(preview.headers.get('content-security-policy')??'',/default-src 'none'; frame-src https:\/\/draft.example.com;/);assert.match(await preview.text(),/Provider &lt;preview&gt;/);
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}
});
test('saved previews reuse offers, protect references, keep drafts private and render consent-first FAQ',()=>{
 const db=openDatabase(':memory:');migrate(db);try{
 const settings=new SettingsStore(db,'ef'.repeat(32),'https://our-site.example','UTC'),store=new ContentStore(db,settings);
 const offer=store.saveItem({kind:'offer',slug:'sample',title:'Existing offer',position:0,status:'active',data:{description:'Sample',imageId:null,resourceId:null,action:'affiliate',destination:'https://example.com/buy',ctaLabel:'View',tags:[]}});
 store.saveItem({kind:'faq',slug:'sample-question',title:'Question',position:0,status:'active',data:{question:'How <does> it work?',answer:'A safe answer.'}});
 const active={...draft,status:'active' as const,offerId:offer.id,providerReviewed:true};
 assert.throws(()=>store.saveSection('embeds',{...defaultEmbeds,items:[{...draft,url:'https://our-site.example/private'}]}),/external provider/);
 store.saveSection('embeds',{...defaultEmbeds,enabled:true,activeKey:active.key,height:550,items:[active,{...draft,key:'private-draft',url:'https://private.example.com/secret'}]});
 const site=store.publicSite();assert.equal(site.sections.embeds?.items.length,1);assert.doesNotMatch(JSON.stringify(site),/private-draft|private.example/);
 assert.throws(()=>store.remove(offer.id),/Iframe & embeds/);
 const html=renderToStaticMarkup(React.createElement(FaqWithEmbed,{site}));assert.match(html,/has-embed has-fixed-height/);assert.match(html,/--faq-preview-height:550px/);assert.doesNotMatch(html,/<iframe/);assert.match(html,/Enable website preview/);assert.match(html,/target="_blank" rel="noopener noreferrer sponsored"/);assert.match(html,/How &lt;does&gt; it work/);
 const {id:offerId,...offerInput}=offer;store.saveItem({...offerInput,status:'inactive'},offerId);assert.equal(store.publicSite().sections.embeds?.items.length,0);
 const fallback=renderToStaticMarkup(React.createElement(FaqWithEmbed,{site:store.publicSite()}));assert.doesNotMatch(fallback,/has-embed|has-fixed-height|Enable website preview/);assert.match(fallback,/A safe answer/);
 }finally{db.close();}
});
