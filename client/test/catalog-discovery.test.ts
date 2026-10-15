import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {ContentItem} from '@affiliate/shared';
import {boundedIds,discoverItems,emptyCatalogFilters} from '../src/public/catalogDiscovery.ts';
const items:ContentItem[]=[{id:1,kind:'offer',slug:'free',title:'Free guide',status:'active',position:0,data:{materialType:'digital',priceMode:'free'}},{id:2,kind:'offer',slug:'paid',title:'Paid tool',status:'active',position:1,data:{materialType:'software',priceMode:'fixed',priceAmount:20,currency:'USD',availability:'available'}},{id:3,kind:'offer',slug:'eur',title:'Euro tool',status:'active',position:2,data:{materialType:'software',priceMode:'fixed',priceAmount:10,currency:'EUR'}},{id:4,kind:'offer',slug:'hidden',title:'Hidden price',status:'active',position:3,data:{priceMode:'hidden',priceAmount:1,currency:'USD'}},{id:5,kind:'upcoming',slug:'upcoming',title:'Upcoming course',status:'active',position:4,data:{materialType:'event',action:'coming_soon'}}];
test('discovery filters preserve original order and combine material, currency and known prices',()=>{
 assert.deepEqual(discoverItems(items,{...emptyCatalogFilters}).map(i=>i.id),[1,2,3,4,5]);
 assert.deepEqual(discoverItems(items,{...emptyCatalogFilters,material:'software',currency:'USD',min:'15'}).map(i=>i.id),[2]);
 assert.deepEqual(discoverItems(items,{...emptyCatalogFilters,price:'free'}).map(i=>i.id),[1]);
 assert.deepEqual(discoverItems(items,{...emptyCatalogFilters,availability:'coming_soon'}).map(i=>i.id),[5]);
});
test('price sorting requires a currency and unknown prices cannot win a comparison',()=>{
 assert.deepEqual(discoverItems(items,{...emptyCatalogFilters,sort:'price_low'}).map(i=>i.id),[1,2,3,4,5]);
 assert.deepEqual(discoverItems(items,{...emptyCatalogFilters,currency:'USD',sort:'price_low'}).map(i=>i.id),[1,2,4]);
 assert.deepEqual(discoverItems(items,{...emptyCatalogFilters,currency:'USD',max:'10'}).map(i=>i.id),[1]);
 assert.deepEqual(discoverItems(items,{...emptyCatalogFilters,currency:'USD',min:'30',max:'10'}),[]);
});
test('remembered lists retain only bounded unique numeric product IDs',()=>{
 assert.deepEqual(boundedIds([1,1,2,-1,0,'3',null,Infinity,1.5]),[1,2]);assert.deepEqual(boundedIds({ids:[1]}),[]);assert.equal(boundedIds(Array.from({length:200},(_,i)=>i+1)).length,100);
});
