import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicDocument,requestInitialDocument} from '../document-startup.ts';
test('only public HTML routes receive initial content',()=>{
 assert.equal(isPublicDocument('/','text/html'),true);
 assert.equal(isPublicDocument('/p/resource','text/html'),true);
 for(const path of ['/admin/content','/api/public/bootstrap','/media/1','/email/open','/download/token','/downloads/token','/src/main.tsx']) assert.equal(isPublicDocument(path,'text/html'),false);
 assert.equal(isPublicDocument('/','application/json'),false);
});
test('API failure falls back instead of blocking the document',async()=>{
 const failing:typeof fetch=async()=>{throw new Error('API still starting');};
 assert.equal(await requestInitialDocument('/','localhost',failing),null);
 const unavailable:typeof fetch=async()=>new Response('',{status:503});
 assert.equal(await requestInitialDocument('/','localhost',unavailable),null);
});
test('slow API request is aborted and releases the document',async()=>{
 const slow:typeof fetch=async(_url,options)=>new Promise((_resolve,reject)=>{
  const keepAlive=setTimeout(()=>reject(new Error('timeout missing')),1000);
  options?.signal?.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(options.signal?.reason);},{once:true});
 });
 assert.equal(await requestInitialDocument('/','localhost',slow,20),null);
});
test('published content and not-found status are preserved',async()=>{
 for(const status of [200,404]) {
  const ready:typeof fetch=async()=>new Response('<html>ready</html>',{status});
  assert.deepEqual(await requestInitialDocument('/','localhost',ready),{status,html:'<html>ready</html>'});
 }
});
