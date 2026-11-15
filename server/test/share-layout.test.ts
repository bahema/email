import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import express from 'express';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {shareAppearance,shareContrast,shareQuery,normalizeShareBackground} from '@affiliate/shared';
import {fitShareText} from '../src/share-text.js';
import {renderShareImage,renderTikTokScene,shareImageRoutes} from '../src/product-sharing.js';
import {openDatabase} from '../src/db/database.js';
import {migrate} from '../src/db/migrations.js';
import {SettingsStore} from '../src/settings/store.js';
import {ContentStore} from '../src/content/store.js';
import {errorHandler} from '../src/app.js';

test('measured titles and badges stay inside their boxes for wide glyphs, long words and multilingual text',async()=>{
 const box={width:530,height:166,maxSize:44,minSize:22,bold:true,maxLines:3,color:'#193B30'};
 for(const text of ['ProDentim – Advanced Oral Probiotic Supplement for Teeth, Gums & Fresh Breath | 30 Soft Tablets','The High-Protein Fat Loss Cookbook: Delicious Recipes for Healthy Weight Loss','W'.repeat(200),'健康与美丽产品 '.repeat(30),'🧑🏾‍💻 '.repeat(90),'<script>alert("test")</script> & details']){const r=await fitShareText(text,box);assert.ok(r);assert.ok(r.width<=530);assert.ok(r.height<=166);assert.ok(r.fontSize>=22&&r.fontSize<=44);}
 const badge=await fitShareText('Worldwide availability with terms and conditions'.repeat(2),{...box,height:34,maxSize:20,minSize:14,bold:false,maxLines:2});assert.ok(badge&&badge.width<=530&&badge.height<=34);
 assert.equal(await fitShareText(' ',box),null);
});
test('backgrounds always choose at least 4.5:1 text contrast and asset queries retain their color',()=>{
 for(let r=0;r<256;r+=32)for(let g=0;g<256;g+=32)for(let b=0;b<256;b+=32){const c='#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join(''),p=shareAppearance(c);assert.ok(shareContrast(p.background,p.foreground)>=4.5);}
 for(const value of ['red','#fff','url(x)','#000000;cmd','transparent'])assert.equal(normalizeShareBackground(value),null);
 assert.equal(shareQuery('/poster.jpg?background=142D4E','download','1'),'/poster.jpg?background=142D4E&download=1');
});
test('all image formats and video layers use the selected background without changing product content',async()=>{
 const item={id:1,kind:'offer' as const,slug:'sample',title:'ProDentim – Advanced Oral Probiotic Supplement for Teeth, Gums & Fresh Breath | 30 Soft Tablets',status:'active',position:0,data:{description:'Existing product description.',badgeLabel:'Available in selected regions',priceMode:'fixed',priceAmount:49,currency:'USD',availability:'available',action:'affiliate'}},snapshot=JSON.stringify(item),photo=await sharp({create:{width:200,height:180,channels:3,background:'#c67870'}}).png().toBuffer();
 for(const format of ['landscape','square','portrait','story'] as const){const image=await renderShareImage(item,'Brand',photo,format,undefined,'example.test','png','general','#142D4E'),pixel=await sharp(image).extract({left:10,top:10,width:1,height:1}).removeAlpha().raw().toBuffer();assert.deepEqual([...pixel],[20,45,78]);}
 const video=await renderTikTokScene(item,'Brand',photo,undefined,'example.test','general','#142D4E');assert.equal(video.background,'#142D4E');assert.equal(video.layers.length,8);for(const l of video.layers){const m=await sharp(l.image).metadata();assert.ok(l.x+m.width!<=1080);assert.ok(l.y+m.height!<=1920);}
 assert.equal(JSON.stringify(item),snapshot);
});
test('custom colors separate image/video caches, survive downloads and reject invalid input without contacts or product edits',async()=>{
 const db=openDatabase(':memory:');migrate(db);const directory=await mkdtemp(join(tmpdir(),'share-colors-')),settings=new SettingsStore(db,'ab'.repeat(32),'https://example.test','UTC'),store=new ContentStore(db,settings),photo=await sharp({create:{width:30,height:30,channels:3,background:'white'}}).png().toBuffer();await writeFile(join(directory,'abc123.png'),photo);const id=Number(db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES('abc123.png','abc123.png','image/png',?,'png','image','public')").run(photo.length).lastInsertRowid),item=store.saveItem({kind:'offer',slug:'sample',title:'Original product',status:'active',position:0,data:{description:'Original text',action:'affiliate',destination:'https://provider.test',imageId:id}}),before=JSON.stringify(store.items());
 const colors:string[]=[];const app=express();app.use(shareImageRoutes(db,settings,directory,{videoEncoder:async scene=>{colors.push(scene.background!);return Buffer.from('test-video');}}));app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const root='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{const assets=async(color:string)=>{const r=await fetch(root+'/api/public/share-assets?path=/resources/offer/sample&background='+color);assert.equal(r.status,200);return r.json();},dark=await assets('142D4E'),light=await assets('FFFFFF');assert.equal(dark.caption,light.caption);assert.equal(dark.title,item.title);assert.notEqual(dark.tiktok.videoEndpoint,light.tiktok.videoEndpoint);for(const a of [dark,light]){const image=await fetch(root+shareQuery(a.formats[0].path,'download','1'));assert.equal(image.status,200);assert.match(image.headers.get('content-disposition')!,/attachment/);await fetch(root+a.tiktok.videoEndpoint,{method:'POST'});let state;for(let n=0;n<60;n++){state=await(await fetch(root+a.tiktok.videoEndpoint)).json();if(state.state==='ready')break;await new Promise(r=>setTimeout(r,100));}assert.equal(state.state,'ready');assert.match(state.downloadUrl,/background=/);assert.equal((await fetch(root+shareQuery(state.downloadUrl,'download','1'))).status,200);}
 assert.deepEqual(colors,['#142D4E','#FFFFFF']);assert.equal((await fetch(root+'/api/public/share-assets?path=/resources/offer/sample&background=invalid')).status,400);assert.equal((await fetch(root+dark.formats[0].path.replace('142D4E','invalid'))).status,400);assert.equal(JSON.stringify(store.items()),before);assert.equal(db.prepare('SELECT count(*) n FROM contacts').get()?.n,0);
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();await rm(directory,{recursive:true,force:true});}
});

test('the website address is rendered in every poster format on light and dark backgrounds without touching the disclaimer',async()=>{
 const item={id:1,kind:'offer' as const,slug:'sample',title:'A long product title with useful details '.repeat(4),status:'active',position:0,data:{action:'affiliate',priceMode:'fixed',priceAmount:49,currency:'USD',availability:'available',badgeLabel:'New'}},photo=await sharp({create:{width:50,height:50,channels:3,background:'#c67870'}}).png().toBuffer();
 for(const background of ['#EDF1E8','#142D4E'])for(const format of ['landscape','square','portrait','story'] as const){const withAddress=await renderShareImage(item,'Brand',photo,format,undefined,'www.berliaon.com','png','general',background),without=await renderShareImage(item,'Brand',photo,format,undefined,'','png','general',background),wide=format==='landscape',top=wide?555:format==='square'?970:format==='portrait'?1380:1515,region={left:wide?620:80,top,width:wide?530:format==='portrait'?840:920,height:wide?26:40};assert.notDeepEqual(await sharp(withAddress).extract(region).raw().toBuffer(),await sharp(without).extract(region).raw().toBuffer(),format+' must display the website');const footer={left:40,top:wide?584:format==='square'?1020:format==='portrait'?1430:1565,width:700,height:25};assert.deepEqual(await sharp(withAddress).extract(footer).raw().toBuffer(),await sharp(without).extract(footer).raw().toBuffer(),format+' disclaimer must remain unchanged');}
});
