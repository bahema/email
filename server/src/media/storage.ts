import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { fileTypeFromBuffer } from 'file-type';
import type { MediaAsset } from '@affiliate/shared';
import { HttpError } from '../http.js';

export class LocalStorage {
  constructor(private directory: string) {}
  path(name: string): string { if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(name)) throw new Error('Invalid storage key'); return resolve(this.directory, name); }
  save(buffer: Buffer, extension: string): string { mkdirSync(this.directory,{recursive:true});const name=`${randomUUID()}.${extension}`;writeFileSync(this.path(name),buffer,{flag:'wx'});return name; }
  delete(name: string) { const path=this.path(name);if(existsSync(path))unlinkSync(path); }
}
const types: Record<string,string[]> = {jpg:['jpg'],jpeg:['jpg'],png:['png'],webp:['webp'],gif:['gif'],avif:['avif'],pdf:['pdf'],doc:['cfb'],docx:['docx'],zip:['zip'],mp4:['mp4'],webm:['webm']};
export async function validateFile(buffer: Buffer, original: string, allowed: string[], maximum: number) {
  const filename=basename(original).replace(/[\x00-\x1f\x7f]/g,'').slice(0,200);
  const extension=extname(filename).slice(1).toLowerCase();
  if(!allowed.includes(extension)||/\.(exe|js|mjs|cjs|html?|svg|ps1|bat|cmd|php|sh)(\.|$)/i.test(filename))throw new HttpError(400,'INVALID_FILE','This file type is not allowed');
  if(!buffer.length||buffer.length>maximum)throw new HttpError(413,'FILE_TOO_LARGE','File is empty or exceeds the configured size limit');
  if(extension==='txt'){
    try { const value=new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(/[\x00-\x08\x0e-\x1f]/.test(value)||/<(?:script|html|!doctype)/i.test(value))throw new Error(); }
    catch {throw new HttpError(400,'INVALID_FILE','Text uploads must contain plain UTF-8 text');}
    return {filename,extension,mime:'text/plain'};
  }
  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {detected=await fileTypeFromBuffer(buffer);} catch {throw new HttpError(400,'INVALID_FILE','The file is malformed');}
  if(!detected||!types[extension]?.includes(detected.ext))throw new HttpError(400,'INVALID_FILE','File content does not match its extension');
  return {filename,extension,mime:extension==='doc'?'application/msword':detected.mime};
}
export function mediaAsset(row: Record<string,unknown>): MediaAsset {
  return {id:Number(row.id),filename:String(row.filename),mime:String(row.mime),size:Number(row.size),extension:String(row.extension),category:String(row.category),visibility:row.visibility as 'public'|'private',url:row.visibility==='public'?`/media/${row.id}`:`/api/admin/media/${row.id}/file`,uploadedAt:String(row.uploaded_at)};
}
export function referenceIds(value: unknown): number[] {
  const ids=new Set<number>();
  function walk(item:unknown){if(Array.isArray(item))item.forEach(walk);else if(item&&typeof item==='object')for(const [key,entry] of Object.entries(item)){if(['imageId','backgroundImageId','mobileImageId','videoId','avatarId','logoId','resourceId'].includes(key)&&typeof entry==='number')ids.add(entry);else walk(entry);}}
  walk(value);return [...ids];
}
export function validateReferences(db:DatabaseSync,value:unknown){
  function walk(item:unknown){if(Array.isArray(item))item.forEach(walk);else if(item&&typeof item==='object')for(const [key,entry] of Object.entries(item)){
    if(['imageId','backgroundImageId','mobileImageId','videoId','avatarId','logoId','resourceId'].includes(key)&&typeof entry==='number'){
      const media=db.prepare('SELECT mime,visibility FROM media WHERE id=?').get(entry);
      if(!media||media.visibility!=='public')throw new HttpError(400,'INVALID_ASSET','Website assets must exist and be public');
      if(['imageId','backgroundImageId','mobileImageId','avatarId','logoId'].includes(key)&&!String(media.mime).startsWith('image/'))throw new HttpError(400,'INVALID_ASSET','Choose an image asset');
      if(key==='videoId'&&!String(media.mime).startsWith('video/'))throw new HttpError(400,'INVALID_ASSET','Choose a video asset');
    }else walk(entry);
  }}walk(value);
}
export function updateReferences(db:DatabaseSync,owner:string,value:unknown){db.prepare('DELETE FROM media_usage WHERE owner_key=?').run(owner);for(const id of referenceIds(value))db.prepare('INSERT INTO media_usage(media_id,owner_key) VALUES(?,?)').run(id,owner);}
