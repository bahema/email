import { readFileSync,existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
// Only a known bundled image is read. Never turn arbitrary email image URLs into filesystem paths.
export function inlineSystemLogo(html?:string){
 const attachments:{filename:string;content:Buffer;contentType:string;contentDisposition:'inline';cid:string}[]=[];
 if(!html)return {html,attachments};
 const root=fileURLToPath(new URL(import.meta.url.includes('/dist/')?'../../../../../':'../../../',import.meta.url));
 const path=[resolve(root,'client/public/brand/33-items-logo.jpg'),resolve(root,'client/dist/brand/33-items-logo.jpg')].find(existsSync);
 if(!path)return {html,attachments};
 const updated=html.replace(/<img data-system-logo="true" src="([^"]+)"/g,(tag,src:string)=>{
   try{if(new URL(src).pathname!=='/brand/33-items-logo.jpg')return tag;}catch{return tag;}
   if(!attachments.length)attachments.push({filename:'33-items-logo.jpg',content:readFileSync(path),contentType:'image/jpeg',contentDisposition:'inline',cid:'system-logo@33-items'});
   return '<img src="cid:system-logo@33-items"';
 });
 return {html:updated,attachments};
}
