import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import express from 'express';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verticalVideoOptions,verticalVideoInfo} from '../src/tiktok-video.js';
import {renderTikTokScene,shareImageRoutes} from '../src/product-sharing.js';
import {openDatabase} from '../src/db/database.js';
import {migrate} from '../src/db/migrations.js';
import {SettingsStore} from '../src/settings/store.js';
import {ContentStore} from '../src/content/store.js';
import {errorHandler} from '../src/app.js';

test('vertical export options have bounded dimensions and durations; ambiguous or injected inputs are rejected',()=>{
 assert.deepEqual(verticalVideoOptions({}),{resolution:'1080p',duration:10});
 for(const resolution of ['1080p','4k'])for(const duration of ['10','15','20']){const options=verticalVideoOptions({resolution,duration}),info=verticalVideoInfo(options);assert.equal(info.durationSeconds,Number(duration));assert.equal(info.width,resolution==='4k'?2160:1080);assert.equal(info.height,resolution==='4k'?3840:1920);}
 for(const query of [{resolution:'8k'},{resolution:['4k']},{duration:['20']},{duration:'21'},{duration:'10;echo secret'},{duration:{x:'20'}}])assert.throws(()=>verticalVideoOptions(query),/Choose 1080p/);
});

test('native 4K layers retain content, spacing and proportional animation timing with a final reading hold',async()=>{
 const item={id:1,kind:'upcoming' as const,slug:'sample',title:'Long product title with useful details '.repeat(5),status:'active',position:0,data:{description:'Existing product description '.repeat(12),priceMode:'from',priceAmount:1076.38,compareAtPrice:1300,currency:'USD',action:'affiliate'}},snapshot=JSON.stringify(item),photo=await sharp({create:{width:100,height:200,channels:3,background:'white'}}).png().toBuffer(),base=await renderTikTokScene(item,'Brand',photo,undefined,'www.berliaon.com','general','#142D4E'),high=await renderTikTokScene(item,'Brand',photo,undefined,'www.berliaon.com','general','#142D4E',{resolution:'4k',duration:20});
 const poster=await sharp(high.poster).metadata();assert.equal(poster.width,2160);assert.equal(poster.height,3840);assert.deepEqual(high.layers.map(l=>l.key),base.layers.map(l=>l.key));
 for(let i=0;i<high.layers.length;i++){const layer=high.layers[i]!,original=base.layers[i]!,size=await sharp(layer.image).metadata();assert.equal(layer.x,original.x*2);assert.equal(layer.y,original.y*2);assert.equal(layer.start,original.start*2);assert.ok(layer.x+size.width!<=2160);assert.ok(layer.y+size.height!<=3600);assert.ok(layer.start+.65<16,'last four seconds remain available for reading');}
 assert.equal(JSON.stringify(item),snapshot);
});

test('resolution, duration and color survive queue/status/download and cannot retrieve another variant',async()=>{
 const db=openDatabase(':memory:');migrate(db);const settings=new SettingsStore(db,'ab'.repeat(32),'https://example.test','UTC'),store=new ContentStore(db,settings),directory=await mkdtemp(join(tmpdir(),'vertical-video-test-')),image=await sharp({create:{width:20,height:20,channels:3,background:'white'}}).png().toBuffer();await writeFile(join(directory,'abc.png'),image);
 const id=Number(db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES('photo.png','abc.png','image/png',?,'png','image','public')").run(image.length).lastInsertRowid);store.saveItem({kind:'upcoming',slug:'sample',title:'Existing product',status:'active',position:0,data:{description:'Saved description',imageId:id,action:'affiliate',destination:'https://provider.test'}});const before=JSON.stringify(store.items()),seen:string[]=[],app=express();app.use(shareImageRoutes(db,settings,directory,{videoEncoder:async scene=>{const key=scene.options!.resolution+'-'+scene.options!.duration+'-'+scene.background;seen.push(key);return Buffer.from(key);}}));app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const root='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{const assets=await(await fetch(root+'/api/public/share-assets?path=/resources/upcoming/sample&background=142D4E')).json();assert.deepEqual(assets.tiktok.durations,[10,15,20]);assert.deepEqual(assets.tiktok.resolutions,['1080p','4k']);const endpoint=assets.tiktok.videoEndpoint;
  for(const [resolution,duration] of [['1080p','15'],['4k','20']]){const url=endpoint+'&resolution='+resolution+'&duration='+duration;assert.equal((await fetch(root+url,{method:'POST'})).status,202);let status;for(let n=0;n<100;n++){status=await(await fetch(root+url)).json();if(status.state==='ready')break;await new Promise(r=>setTimeout(r,100));}assert.equal(status.state,'ready');assert.equal(status.durationSeconds,Number(duration));assert.equal(status.width,resolution==='4k'?2160:1080);const output=await fetch(root+status.downloadUrl+'&download=1');assert.equal(output.status,200);assert.equal(await output.text(),resolution+'-'+duration+'-#142D4E');assert.match(output.headers.get('content-disposition')!,new RegExp(resolution+'-'+duration+'s'));assert.equal((await(await fetch(root+url)).json()).state,'ready');}
  assert.equal((await(await fetch(root+endpoint)).json()).state,'idle');assert.equal((await fetch(root+endpoint+'&resolution=8k',{method:'POST'})).status,400);assert.equal((await fetch(root+endpoint+'&duration=15&duration=20')).status,400);assert.deepEqual(seen,['1080p-15-#142D4E','4k-20-#142D4E']);assert.equal(JSON.stringify(store.items()),before);assert.equal(db.prepare('SELECT count(*) n FROM contacts').get()?.n,0);
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();await rm(directory,{recursive:true,force:true});}
});
