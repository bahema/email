import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {defaultHealth,defaultHealthSlider,newVideoPromotion,type ContentItem} from '@affiliate/shared';
import {sectionSchemas} from '../../server/src/content/schema.ts';
import {publicNavigationHref} from '../src/public/navigation.ts';
import {HealthPromo} from '../src/public/HealthPromo.tsx';
import {PublicApp} from '../src/public/PublicApp.tsx';
import {openDatabase} from '../../server/src/db/database.ts';
import {migrate} from '../../server/src/db/migrations.ts';
import {SettingsStore} from '../../server/src/settings/store.ts';
import {ContentStore} from '../../server/src/content/store.ts';
import {publicBootstrap} from '../../server/src/public-bootstrap.ts';
test('shared navigation anchors consistently target the homepage and preserve explicit page destinations',()=>{
 for(const name of ['offers','categories','upcoming','faq','reviews'])assert.equal(publicNavigationHref('#'+name),'/#'+name);
 for(const href of ['/#offers','/health','#health-products','#subscribe','/guides/example','https://example.test/#offers'])assert.equal(publicNavigationHref(href),href);
 const db=openDatabase(':memory:');migrate(db);const settings=new SettingsStore(db,'ab'.repeat(32),'https://example.test','UTC'),store=new ContentStore(db,settings);
 try{for(const name of ['offers','categories','upcoming','faq'])store.saveItem({kind:'navigation',slug:name,title:name,status:'active',position:0,data:{label:name,href:'#'+name}});store.saveSection('health',{...defaultHealth,enabled:true});store.saveSection('promotions',{pages:[{...newVideoPromotion('nav-test'),slug:'nav-test',title:'Video page',videoUrl:'https://youtu.be/abcdefghijk',status:'active'}]});for(const path of ['/health','/promotions/nav-test']){const html=renderToStaticMarkup(React.createElement(PublicApp,{initial:publicBootstrap(db,settings,path,'example.test',true),pathname:path}));for(const name of ['offers','categories','upcoming','faq'])assert.match(html,new RegExp('href="/#'+name+'"'));assert.ok(!html.includes('href="#offers"'));}}
 finally{db.close();}
});
test('old health settings receive the blue slider palette and invalid colour combinations are rejected',()=>{
 const old=sectionSchemas.health.parse(defaultHealth);assert.deepEqual(old.slider,defaultHealthSlider);
 const custom={...defaultHealthSlider,backgroundFrom:'#051526',backgroundTo:'#17384f',shadow:'strong' as const};assert.deepEqual(sectionSchemas.health.parse({...defaultHealth,slider:custom}).slider,custom);
 assert.equal(sectionSchemas.health.safeParse({...defaultHealth,slider:{...custom,text:'#17384f'}}).success,false);
 assert.equal(sectionSchemas.health.safeParse({...defaultHealth,slider:{...custom,buttonText:custom.button}}).success,false);
 assert.equal(sectionSchemas.health.safeParse({...defaultHealth,slider:{...custom,backgroundFrom:'invalid'}}).success,false);
});
test('slider rendering uses saved palette and shadow without changing its product connection',()=>{
 const offer:ContentItem={id:1,kind:'offer',slug:'sample',title:'Sample',position:0,status:'active',data:{description:'Details',imageId:7,priceMode:'fixed',priceAmount:25,currency:'USD'}};
 const config={...defaultHealth,enabled:true,slider:{...defaultHealthSlider,shadow:'strong' as const},products:[{offerId:1,category:'beauty' as const}]};
 const html=renderToStaticMarkup(React.createElement(HealthPromo,{config,items:[offer]}));assert.match(html,/health-shadow-strong/);assert.match(html,/--health-slider-from:#142D4E/);assert.match(html,/--health-slider-button:#865563/);assert.match(html,/href="\/health\/products\/sample"/);assert.match(html,/25.00/);
});
