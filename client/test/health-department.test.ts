import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {defaultHealth,healthSliderProducts,type ContentItem} from '@affiliate/shared';
import {HealthPromo} from '../src/public/HealthPromo.tsx';
import {HealthDepartment} from '../src/public/HealthDepartment.tsx';
import {BootstrapContext} from '../src/public/bootstrap.ts';
import {openDatabase} from '../../server/src/db/database.ts';
import {migrate} from '../../server/src/db/migrations.ts';
import {ContentStore} from '../../server/src/content/store.ts';
import {SettingsStore} from '../../server/src/settings/store.ts';
import {pageMetadata} from '../../server/src/seo.ts';
import {sectionSchemas} from '../../server/src/content/schema.ts';
import {createApp,errorHandler} from '../../server/src/app.ts';
import {hashPassword} from '../../server/src/security/crypto.ts';
import type {AddressInfo} from 'node:net';
function fixture(){const db=openDatabase(':memory:');migrate(db);const settings=new SettingsStore(db,'ab'.repeat(32),'https://example.test','UTC'),content=new ContentStore(db,settings);return{db,settings,content};}
test('health starts disabled, rejects duplicate products and discards legacy manual promotions',()=>{
 const f=fixture();try{assert.equal(f.content.sections().health?.enabled,false);assert.equal(pageMetadata(f.db,f.settings,'/health').notFound,true);
 assert.equal(sectionSchemas.health.safeParse({...defaultHealth,products:[{offerId:1,category:'beauty'},{offerId:1,category:'wellness'}]}).success,false);
 const legacy=sectionSchemas.health.parse({...defaultHealth,slides:[{title:'Old promotion'}]});assert.equal(Object.hasOwn(legacy,'slides'),false);
 assert.equal(sectionSchemas.health.safeParse({...defaultHealth,enabled:true,products:[]}).success,true);
 }finally{f.db.close();}
});
test('health reuses active offers, protects references and keeps affiliate redirect URLs',()=>{
 const f=fixture();try{const offer=f.content.saveItem({kind:'offer',slug:'care',title:'Care product',status:'active',position:0,data:{description:'Provider details',action:'affiliate',destination:'https://example.org/provider'}});
 assert.throws(()=>f.content.saveSection('health',{...defaultHealth,products:[{offerId:999,category:'beauty'}]}),/existing offers/i);
 assert.throws(()=>f.content.saveSection('health',{...defaultHealth,imageId:999}),/public/i);
 f.content.saveSection('health',{...defaultHealth,enabled:true,products:[{offerId:offer.id,category:'beauty'}]});
 assert.throws(()=>f.content.remove(offer.id),/Health & Beauty/);
 assert.equal(f.content.publicSite().items.find(i=>i.id===offer.id)?.data.href,'/go/care');
 const meta=pageMetadata(f.db,f.settings,'/health');assert.equal(meta.notFound,false);assert.equal(meta.noindex,false);assert.equal(meta.canonical,'https://example.test/health');assert.match(meta.title,/Health & Beauty/);
 }finally{f.db.close();}
});
test('automatic slider reads published featured product data and links to health details',()=>{
 const product:ContentItem={id:1,kind:'offer',slug:'skin-care',title:'Skin care sample',status:'active',position:0,data:{description:'Product summary',imageId:23,priceMode:'fixed',priceAmount:19,currency:'USD',availability:'available'}};
 const config={...defaultHealth,enabled:true,products:[{offerId:1,category:'beauty' as const}]};
 assert.equal(renderToStaticMarkup(React.createElement(HealthPromo,{config:defaultHealth,items:[product]})), '');
 const html=renderToStaticMarkup(React.createElement(HealthPromo,{config,items:[product]}));assert.match(html,/href="\/health\/products\/skin-care"/);assert.match(html,/Skin care sample/);assert.match(html,/src="\/media\/23"/);assert.match(html,/19.00/);assert.match(html,/Available now/);assert.doesNotMatch(html,/\/go\//);
 assert.equal(healthSliderProducts(config,[{...product,status:'draft'}]).length,0);assert.equal(healthSliderProducts({...config,products:[{...config.products[0]!,featured:false}]},[product]).length,0);
 assert.equal(renderToStaticMarkup(React.createElement(HealthPromo,{config,items:[]})), '');
});
test('health category links filter server rendering while shared product actions remain intact',()=>{
 const f=fixture();try{const one=f.content.saveItem({kind:'offer',slug:'beauty',title:'Beauty sample',status:'active',position:0,data:{description:'Sample details',action:'affiliate',destination:'https://example.org/one'}}),two=f.content.saveItem({kind:'offer',slug:'nutrition',title:'Nutrition sample',status:'active',position:1,data:{description:'Sample details',action:'none'}});
 f.content.saveSection('health',{...defaultHealth,enabled:true,products:[{offerId:one.id,category:'beauty'},{offerId:two.id,category:'nutrition'}]});const site=f.content.publicSite();
 const html=renderToStaticMarkup(React.createElement(BootstrapContext.Provider,{value:{query:'?category=beauty'} as any},React.createElement(HealthDepartment,{site,onSignup:()=>{}})));
 assert.match(html,/Beauty sample/);assert.doesNotMatch(html,/Nutrition sample/);assert.match(html,/href="\/go\/beauty"/);assert.match(html,/not medical advice/);
 }finally{f.db.close();}
});

test('slider respects department order and caps the eligible selection at six',()=>{
 const products=Array.from({length:9},(_,n)=>({id:n+1,kind:'offer' as const,slug:'item-'+n,title:'Item '+n,status:n===0?'draft':'active',position:n,data:{}}));
 const config={...defaultHealth,enabled:true,products:products.map(p=>({offerId:p.id,category:'beauty' as const,featured:p.id!==2}))};
 assert.deepEqual(healthSliderProducts(config,products).map(p=>p.offer.id),[3,4,5,6,7,8]);
});
test('Health product creation and publication reuse one record and preserve the header',()=>{
 const f=fixture();try{f.content.saveSection('health',{...defaultHealth,enabled:true,headline:'My custom health header'});
 const input={offer:{kind:'offer',slug:'shared-care',title:'Care sample',status:'draft',position:0,data:{description:'Draft details',action:'affiliate',destination:'https://example.org/provider'}},category:'beauty',featured:true};
 const draft=f.content.saveHealthOffer(input);assert.equal(f.content.sections().health!.products.length,1);assert.equal(healthSliderProducts(f.content.sections().health!,f.content.publicSite().items).length,0);
 f.content.saveHealthOffer({...input,offer:{...input.offer,status:'active',title:'Updated care',data:{...input.offer.data,description:'Current product summary'}}},draft.offer.id);
 assert.equal(f.content.items().filter(i=>i.kind==='offer').length,1);assert.equal(f.content.sections().health!.headline,'My custom health header');assert.equal(healthSliderProducts(f.content.sections().health!,f.content.publicSite().items)[0]!.offer.title,'Updated care');
 assert.equal(pageMetadata(f.db,f.settings,'/health/products/shared-care').canonical,'https://example.test/health/products/shared-care');assert.equal(pageMetadata(f.db,f.settings,'/resources/offer/shared-care').canonical,'https://example.test/health/products/shared-care');
 f.content.saveHealthOffer({...input,offer:{...input.offer,status:'inactive'}},draft.offer.id);assert.equal(healthSliderProducts(f.content.sections().health!,f.content.publicSite().items).length,0);assert.equal(pageMetadata(f.db,f.settings,'/health/products/shared-care').notFound,true);
 }finally{f.db.close();}
});
test('Health save is atomic if department persistence fails',()=>{const f=fixture();try{f.db.exec("CREATE TRIGGER fail_health BEFORE INSERT ON website_sections WHEN NEW.key='health' BEGIN SELECT RAISE(ABORT,'controlled failure'); END;");assert.throws(()=>f.content.saveHealthOffer({offer:{kind:'offer',slug:'atomic',title:'Atomic',status:'draft',position:0,data:{description:'Test',action:'none'}},category:'beauty',featured:true}),/controlled failure/);assert.equal(f.content.items().length,0);}finally{f.db.close();}});
test('authenticated Health editor API creates once, publishes and unpublishes through the shared public journey',async()=>{
 const f=fixture();const password='Health-test-only-password';f.db.prepare('INSERT INTO admin(id,email,password_hash) VALUES(1,?,?)').run('owner@example.test',await hashPassword(password));f.content.saveSection('health',{...defaultHealth,enabled:true});
 const app=createApp(f.db,18,{secureCookies:false,sessionHours:8,siteUrl:'http://localhost:5173',allowLoopbackOrigins:true,encryptionKey:'ab'.repeat(32),timezone:'UTC',environment:'test'});app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 try{
  const path='/api/admin/content/health/offers',input={offer:{kind:'offer',slug:'http-care',title:'HTTP care sample',status:'draft',position:0,data:{description:'Product details',action:'affiliate',destination:'https://example.org/provider'}},category:'beauty',featured:true};
  assert.equal((await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})).status,401);
  const boot=await fetch(origin+'/api/auth/session'),bootData=await boot.json(),initialCookie=boot.headers.get('set-cookie')!.split(';')[0]!;
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',Cookie:initialCookie,'X-CSRF-Token':bootData.csrfToken},body:JSON.stringify({email:'owner@example.test',password})});assert.equal(login.status,200);const auth=await login.json(),cookie=login.headers.get('set-cookie')!.match(/affiliate_session=[a-f0-9]{64}/g)!.at(-1)!;
  const headers={'Content-Type':'application/json',Origin:'http://localhost:5173',Cookie:cookie,'X-CSRF-Token':auth.csrfToken};
  let response=await fetch(origin+path,{method:'POST',headers,body:JSON.stringify(input)});assert.equal(response.status,201);const draft=await response.json();assert.equal((await (await fetch(origin+'/api/public/site')).json()).items.filter((i:any)=>i.kind==='offer').length,0);
  assert.equal((await fetch(origin+path,{method:'POST',headers,body:JSON.stringify(input)})).status,409);
  response=await fetch(origin+path+'/'+draft.offer.id,{method:'PUT',headers,body:JSON.stringify({...input,offer:{...input.offer,status:'active'}})});assert.equal(response.status,200);
  const published=await (await fetch(origin+'/api/public/site')).json();assert.equal(healthSliderProducts(published.sections.health,published.items).length,1);
  const redirect=await fetch(origin+'/go/http-care',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'https://example.org/provider');
  const metadata=await (await fetch(origin+'/api/public/page-metadata?path=/health/products/http-care')).json();assert.equal(metadata.notFound,false);assert.match(metadata.canonical,/\/health\/products\/http-care$/);
  const sitemap=await (await fetch(origin+'/sitemap.xml')).text();assert.equal(sitemap.split('/health/products/http-care</loc>').length-1,1);assert.doesNotMatch(sitemap,/\/resources\/offer\/http-care/);
  response=await fetch(origin+path+'/'+draft.offer.id,{method:'PUT',headers,body:JSON.stringify({...input,offer:{...input.offer,status:'inactive'}})});assert.equal(response.status,200);const hidden=await (await fetch(origin+'/api/public/site')).json();assert.equal(healthSliderProducts(hidden.sections.health,hidden.items).length,0);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));f.db.close();}
});

test('health filters render saved facts on the first response and related products stay inside the department',()=>{
 const f=fixture();try{const make=(slug:string,amount:number,availability='available')=>f.content.saveItem({kind:'offer',slug,title:slug,status:'active',position:0,data:{description:'Saved description',ingredients:'Provider ingredients',cautions:'Provider caution',action:'affiliate',destination:'https://provider.test',priceMode:'fixed',priceAmount:amount,currency:'USD',availability}});
 const one=make('budget-care',10),two=make('premium-care',40),three=make('future-care',15,'preorder');f.content.saveSection('health',{...defaultHealth,enabled:true,products:[one,two,three].map(o=>({offerId:o.id,category:'beauty'}))});const site=f.content.publicSite();
 const html=renderToStaticMarkup(React.createElement(BootstrapContext.Provider,{value:{query:'?currency=USD&min=5&max=20&availability=available'} as any},React.createElement(HealthDepartment,{site,onSignup:()=>{}})));assert.match(html,/budget-care/);assert.doesNotMatch(html,/premium-care|future-care/);assert.match(html,/1 of 3 products/);assert.match(html,/Minimum price/);
 const details=renderToStaticMarkup(React.createElement(HealthDepartment,{site,path:'/health/products/budget-care',onSignup:()=>{}}));assert.match(details,/href="\/health\/products\/premium-care"/);assert.match(details,/Provider ingredients/);assert.match(details,/Provider caution/);assert.match(details,/href="\/go\/budget-care"/);
 }finally{f.db.close();}
});

import {HealthReading,healthEditorial} from '../src/public/HealthBrowseTools.tsx';

test('health guides and topic links reuse only relevant published editorial pages',()=>{
 const f=fixture();try{const offer=f.content.saveItem({kind:'offer',slug:'skin',title:'Skin',status:'active',position:0,data:{description:'Saved facts',action:'none'}});f.content.saveSection('health',{...defaultHealth,enabled:true,products:[{offerId:offer.id,category:'beauty'}]});const site=f.content.publicSite();const page=(id:number,productIds:number[],status='active')=>({id,kind:'guide',title:'Guide '+id,slug:'guide-'+id,status,updatedAt:'2026-10-30T00:00:00Z',data:{productIds,guideIds:[],featured:true,leadPageId:7,description:'Saved guide description',category:'Beauty',body:'Saved source information',imageId:null}} as any);
 site.editorial=[page(1,[offer.id]),page(2,[999]),page(3,[offer.id],'draft')];site.leadPages=[{id:7,slug:'beauty-news',headline:'Beauty news',description:'Review the topic before subscribing.',cta:'View signup',type:'newsletter',imageId:null,hasResource:false}];assert.deepEqual(healthEditorial(site).map(p=>p.id),[1]);const html=renderToStaticMarkup(React.createElement(HealthReading,{site}));assert.match(html,/href="\/guides\/guide-1"/);assert.doesNotMatch(html,/guide-2|guide-3/);assert.match(html,/href="\/p\/beauty-news"/);assert.match(html,/consent/);
 }finally{f.db.close();}
});
