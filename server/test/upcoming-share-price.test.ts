import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {renderShareImage,renderTikTokScene,upcomingPreviousPrice,type ShareFormat} from '../src/product-sharing.js';

const item={id:1,kind:'upcoming' as const,slug:'sample',title:'Upcoming product with a detailed title',status:'active',position:0,data:{action:'affiliate',priceMode:'from',priceAmount:1076.38,currency:'USD',compareAtPrice:1300,badgeLabel:'New'}};
test('previous prices are exported only for upcoming paid products with a higher finite comparison price',()=>{
 assert.equal(upcomingPreviousPrice(item),'$1,300.00');assert.equal(upcomingPreviousPrice({...item,kind:'offer'}),null);
 for(const previous of [undefined,null,0,-1,1076.38,100,Infinity,NaN,'1300'])assert.equal(upcomingPreviousPrice({...item,data:{...item.data,compareAtPrice:previous}}),null);
 for(const mode of ['free','hidden'])assert.equal(upcomingPreviousPrice({...item,data:{...item.data,priceMode:mode}}),null);
});
test('comparison prices stay within the existing price panel at standard and 4K sizes, without moving other content',async()=>{
 const baseline={...item,data:{...item.data,compareAtPrice:null}},formats:ShareFormat[]=['landscape','square','portrait','story'];
 for(const quality of ['standard','4k'] as const)for(const format of quality==='4k'?['landscape' as const]:formats){
  const render=(value:typeof item|typeof baseline)=>renderShareImage(value,'Brand',undefined,format,undefined,'www.berliaon.com','png','general','#142D4E',quality),withPrice=await render(item),without=await render(baseline),meta=await sharp(withPrice).metadata(),scale=quality==='4k'?3.2:1,y=({landscape:385,square:810,portrait:1090,story:1210})[format],height=format==='landscape'?64:80;
  const area={left:Math.round((format==='landscape'?620:80)*scale),top:Math.round(y*scale),width:Math.round((format==='landscape'?530:format==='portrait'?840:920)*scale),height:Math.round(height*scale)};
  assert.notDeepEqual(await sharp(withPrice).extract(area).raw().toBuffer(),await sharp(without).extract(area).raw().toBuffer());
  for(const region of [{left:0,top:0,width:meta.width!,height:area.top},{left:0,top:area.top+area.height,width:meta.width!,height:meta.height!-area.top-area.height}])assert.deepEqual(await sharp(withPrice).extract(region).raw().toBuffer(),await sharp(without).extract(region).raw().toBuffer());
  const border={left:area.left,top:area.top+Math.round(20*scale),width:Math.round(18*scale),height:Math.round(20*scale)};assert.deepEqual(await sharp(withPrice).extract(border).raw().toBuffer(),await sharp(without).extract(border).raw().toBuffer(),'left padding remains clear');
 }
 const offer={...item,kind:'offer' as const};assert.deepEqual(await renderShareImage(offer,'Brand'),await renderShareImage({...offer,data:{...offer.data,compareAtPrice:null}},'Brand'));
});
test('animated videos include both upcoming prices in the same moving price layer',async()=>{
 const photo=await sharp({create:{width:20,height:20,channels:3,background:'white'}}).png().toBuffer(),a=await renderTikTokScene(item,'Brand',photo),b=await renderTikTokScene({...item,data:{...item.data,compareAtPrice:null}},'Brand',photo);
 assert.deepEqual(a.layers.map(l=>({key:l.key,x:l.x,y:l.y,start:l.start})),b.layers.map(l=>({key:l.key,x:l.x,y:l.y,start:l.start})));
 for(let n=0;n<a.layers.length;n++){if(a.layers[n]!.key==='price')assert.notDeepEqual(a.layers[n]!.image,b.layers[n]!.image);else assert.deepEqual(a.layers[n]!.image,b.layers[n]!.image);}
});
