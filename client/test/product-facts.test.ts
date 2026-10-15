import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProductFacts,ProductReviewDate,ProductStatusBadge,productAvailability} from '../src/public/ProductFacts.tsx';
import {contentSchemas} from '../../server/src/content/schema.ts';
import {openDatabase} from '../../server/src/db/database.ts';
import {migrate} from '../../server/src/db/migrations.ts';
import {ContentStore} from '../../server/src/content/store.ts';
import {SettingsStore} from '../../server/src/settings/store.ts';
const render=(data:Record<string,unknown>,kind='offer')=>renderToStaticMarkup(React.createElement(ProductFacts,{data,kind}));
test('review dates are optional, calendar-valid and stable across server and browser timezones',()=>{
 const input={description:'Details',action:'none'};
 assert.equal(contentSchemas.offer.parse(input).lastReviewedDate,'');
 for(const lastReviewedDate of ['2026-02-30','2026-13-01','yesterday'])assert.equal(contentSchemas.offer.safeParse({...input,lastReviewedDate}).success,false);
 for(const value of ['',undefined,'2026-02-30'])assert.equal(renderToStaticMarkup(React.createElement(ProductReviewDate,{value})), '');
 const html=renderToStaticMarkup(React.createElement(ProductReviewDate,{value:'2026-10-15'}));
 assert.match(html,/Last reviewed:/);assert.match(html,/<time dateTime="2026-10-15">15 Oct 2026<\/time>/);
});
test('review dates save and clear through the existing offer store without changing on unrelated edits',()=>{
 const db=openDatabase(':memory:');migrate(db);
 try{
  const store=new ContentStore(db,new SettingsStore(db,'ab'.repeat(32),'http://localhost:5173','UTC'));
  const input={kind:'offer',slug:'review-date-check',title:'Reviewed offer',position:0,status:'active',data:{description:'Details',action:'none',lastReviewedDate:'2026-10-15'}};
  const saved=store.saveItem(input);
  store.saveItem({...input,title:'Updated title'},saved.id);
  assert.equal(store.items().find(i=>i.id===saved.id)?.data.lastReviewedDate,'2026-10-15');
  store.saveItem({...input,data:{...input.data,lastReviewedDate:''}},saved.id);
  assert.equal(store.items().find(i=>i.id===saved.id)?.data.lastReviewedDate,'');
 }finally{db.close();}
});
test('upcoming badges use listing intent and explicit availability takes priority',()=>{
 assert.equal(productAvailability({},'upcoming')?.label,'Coming soon');
 assert.equal(productAvailability({action:'coming_soon'})?.label,'Coming soon');
 assert.equal(productAvailability({availability:'available'},'upcoming')?.label,'Available now');
 assert.equal(productAvailability({availability:'out_of_stock'},'upcoming')?.label,'Out of stock');
 assert.equal(productAvailability({}),null);
});
test('hidden prices remain hidden and saved free, paid and subscription prices render',()=>{
 assert.equal(render({priceMode:'hidden',priceAmount:24}), '');
 assert.match(render({priceMode:'free'}),/>Free</);
 assert.match(render({priceMode:'fixed',priceAmount:24,currency:'USD'}),/24.00/);
 assert.match(render({priceMode:'subscription',priceAmount:9,currency:'USD',billingInterval:'month'}),/9.00\/month/);
});
test('physical condition does not leak into digital products and duplicate labels are removed',()=>{
 assert.match(render({deliveryType:'physical',condition:'refurbished'}),/Refurbished/);
 assert.doesNotMatch(render({deliveryType:'digital',condition:'refurbished'}),/Refurbished/);
 assert.doesNotMatch(render({materialType:'software',deliveryType:'physical',condition:'refurbished'}),/Refurbished/);
 assert.match(render({materialType:'physical',deliveryType:'none',condition:'new'}),/>New</);
 const html=render({availability:'available',badgeLabel:'Available now'});assert.equal(html.split('Available now').length-1,1);
});
test('image availability badge renders without repeating in the card facts',()=>{
 const data={availability:'preorder',priceMode:'free'};
 assert.match(renderToStaticMarkup(React.createElement(ProductStatusBadge,{data})),/Preorder/);
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(ProductFacts,{data,showAvailability:false})),/Preorder/);
});
test('public palette text combinations meet ordinary text contrast',()=>{
 function luminance(hex:string){const c=hex.match(/[a-f0-9]{2}/gi)!.map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return c[0]!*0.2126+c[1]!*0.7152+c[2]!*0.0722;}
 for(const [foreground,background] of [['#f8fafc','#1b283b'],['#1b283b','#f2c75c'],['#18583b','#e4f2e9'],['#755006','#fff0cb'],['#912c38','#fce7e8'],['#086078','#ffffff'],['#435468','#ffffff']]){const a=luminance(foreground!),b=luminance(background!);assert.ok((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>=4.5,foreground+' on '+background);}
});
