import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import {shareBackgroundFromQuery,productShareUrl} from '@affiliate/shared';
import {openDatabase} from '../src/db/database.js';
import {migrate} from '../src/db/migrations.js';
import {SettingsStore} from '../src/settings/store.js';
import {ContentStore} from '../src/content/store.js';
import {pageMetadata,renderPageHtml,seoRoutes} from '../src/seo.js';
import {shareImageRoutes,renderShareImage,shareImageSize} from '../src/product-sharing.js';
import {errorHandler} from '../src/app.js';
import {socialShareLinks} from '../../client/src/ui/socialShareLinks.js';

test('colored social links retain their appearance while SEO keeps one canonical product',async()=>{
 const db=openDatabase(':memory:');migrate(db);const settings=new SettingsStore(db,'ab'.repeat(32),'https://example.test','UTC'),store=new ContentStore(db,settings);
 const item=store.saveItem({kind:'offer',slug:'sample',title:'Original product',status:'active',position:0,data:{description:'Original description',action:'affiliate',destination:'https://provider.test'}}),before=JSON.stringify(store.items());
 const app=express();app.use(shareImageRoutes(db,settings,'.'));app.use(seoRoutes(db,settings));app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const root='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{
  const assets=await(await fetch(root+'/api/public/share-assets?path=/resources/offer/sample&background=142D4E')).json(),url=new URL(assets.url);
  assert.equal(url.searchParams.get('shareBackground'),'142D4E');assert.match(url.searchParams.get('shareVersion')!,/^[a-f0-9]{20}$/);
  const meta=await(await fetch(root+'/api/public/page-metadata?path='+encodeURIComponent(url.pathname+url.search))).json();
  assert.equal(meta.canonical,'https://example.test/resources/offer/sample');assert.equal(meta.socialUrl,assets.url);assert.match(meta.image,/background=142D4E$/);assert.equal(meta.imageWidth,1200);assert.equal(meta.imageHeight,630);
  const html=await(await fetch(root+'/api/public/initial-document?path='+encodeURIComponent(url.pathname+url.search))).text();assert.ok(html.includes('property="og:image" content="'+meta.image+'"'));assert.ok(html.includes('name="twitter:image" content="'+meta.image+'"'));assert.ok(html.includes('rel="canonical" href="'+meta.canonical+'"'));assert.ok(html.includes('shareBackground=142D4E&amp;shareVersion='));
  const links=socialShareLinks({title:item.title,url:assets.url,caption:assets.caption});assert.equal(new URL(links.find(([n])=>n==='Facebook')![1]).searchParams.get('u'),assets.url);assert.equal(new URL(links.find(([n])=>n==='X')![1]).searchParams.get('url'),assets.url);
  const standard=pageMetadata(db,settings,url.pathname);assert.equal(standard.socialUrl,meta.canonical);assert.ok(!standard.image.includes('background='));assert.equal(pageMetadata(db,settings,url.pathname,undefined,'?shareBackground=invalid').image,standard.image);
  for(const format of assets.formats){assert.deepEqual({width:format.export4k.width,height:format.export4k.height},shareImageSize(format.format,'4k'));assert.match(format.export4k.path,/background=142D4E&quality=4k/);}
  const route=assets.formats[0].export4k.path;const image=await fetch(root+route+'&download=1');assert.equal(image.status,200);assert.match(image.headers.get('content-disposition')!,/attachment/);const buffer=Buffer.from(await image.arrayBuffer()),size=await sharp(buffer).metadata();assert.equal(size.width,3840);assert.equal(size.height,2016);const pixel=await sharp(buffer).extract({left:10,top:10,width:1,height:1}).raw().toBuffer();assert.ok(Math.abs(pixel[0]!-20)<3&&Math.abs(pixel[1]!-45)<3&&Math.abs(pixel[2]!-78)<3);
  const stale=await fetch(root+route.replace(url.searchParams.get('shareVersion')!,'0'.repeat(20)),{redirect:'manual'});assert.equal(stale.status,302);assert.match(stale.headers.get('location')!,/background=142D4E&quality=4k/);
  assert.equal((await fetch(root+route.replace('quality=4k','quality=8k'))).status,400);assert.equal(JSON.stringify(store.items()),before);assert.equal(db.prepare('SELECT count(*) n FROM contacts').get()?.n,0);
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}
});

test('all four native 4K layouts retain their aspect ratio and selected background',async()=>{
 const item={id:1,kind:'offer' as const,slug:'sample',title:'A detailed product title '.repeat(8),status:'active',position:0,data:{badgeLabel:'New',priceMode:'fixed',priceAmount:17.99,currency:'USD',availability:'available',action:'affiliate'}};
 for(const format of ['landscape','square','portrait','story'] as const){const image=await renderShareImage(item,'Brand',undefined,format,undefined,'www.berliaon.com','png','general','#142D4E','4k'),meta=await sharp(image).metadata(),expected=shareImageSize(format,'4k');assert.equal(meta.width,expected.width);assert.equal(meta.height,expected.height);assert.equal(Math.max(meta.width!,meta.height!),3840);assert.deepEqual([...await sharp(image).extract({left:10,top:10,width:1,height:1}).removeAlpha().raw().toBuffer()],[20,45,78]);}
});

test('share appearance parameters reject ambiguity and never carry unrelated URL fields',()=>{
 assert.equal(shareBackgroundFromQuery('?shareBackground=abcdef'),'#ABCDEF');for(const query of ['?shareBackground=fff','?shareBackground=112233&shareBackground=445566','?shareBackground=%3Cscript%3E'])assert.equal(shareBackgroundFromQuery(query),undefined);
 assert.equal(productShareUrl('https://example.test/resources/offer/sample?token=private#part','#142d4e','a'.repeat(20)),'https://example.test/resources/offer/sample?shareBackground=142D4E&shareVersion='+ 'a'.repeat(20));assert.throws(()=>productShareUrl('https://example.test','#invalid','a'.repeat(20)));
});
