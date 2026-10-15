import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { Sessions } from '../security/sessions.js';
import type { SettingsStore } from '../settings/store.js';
import { HttpError } from '../http.js';
import { LocalStorage, validateFile, mediaAsset } from './storage.js';
import { event } from '../db/helpers.js';

export function mediaRoutes(db:DatabaseSync,sessions:Sessions,settings:SettingsStore,directory:string){
  const admin=Router(),publicRouter=Router(),storage=new LocalStorage(directory);
  admin.use(sessions.requireAdmin,sessions.csrf);
  admin.get('/',(_req,res)=>res.json(db.prepare('SELECT * FROM media ORDER BY id DESC').all().map(mediaAsset)));
  function usage(id:number){
    const owners=new Set(db.prepare('SELECT owner_key FROM media_usage WHERE media_id=?').all(id).map(row=>String(row.owner_key)));
    const path=`/media/${id}`;
    function includes(value:unknown):boolean {if(typeof value==='string'){try{return new URL(value,'http://local').pathname.replace(/\/+$/,'')===path;}catch{return false;}}if(Array.isArray(value))return value.some(includes);if(value&&typeof value==='object')return Object.values(value).some(includes);return false;}
    for(const row of db.prepare('SELECT value FROM settings').all())if(includes(JSON.parse(String(row.value))))owners.add('Website settings');
    for(const row of db.prepare('SELECT value FROM website_sections').all())if(includes(JSON.parse(String(row.value))))owners.add('Website section');
    for(const row of db.prepare('SELECT id,data FROM content_items').all())if(includes(JSON.parse(String(row.data))))owners.add(`Content item ${row.id}`);
    return [...owners];
  }
  admin.get('/library',(req,res)=>{
    const query=z.object({search:z.string().max(200).default(''),category:z.enum(['all','image','video','document']).default('all'),visibility:z.enum(['all','public','private']).default('all'),sort:z.enum(['newest','oldest','name','size']).default('newest'),page:z.coerce.number().int().min(1).default(1)}).parse(req.query);
    const clauses:string[]=[],args:(string|number)[]=[];
    if(query.search){clauses.push('instr(lower(filename),lower(?))>0');args.push(query.search);}
    if(query.visibility!=='all'){clauses.push('visibility=?');args.push(query.visibility);}
    if(query.category!=='all'){clauses.push(query.category==='document'?"category NOT IN ('image','video')":'category=?');if(query.category!=='document')args.push(query.category);}
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const total=Number(db.prepare('SELECT count(*) AS n FROM media'+where).get(...args)!.n);
    const order={newest:'id DESC',oldest:'id ASC',name:'filename COLLATE NOCASE,id DESC',size:'size DESC,id DESC'}[query.sort];
    const assets=db.prepare('SELECT * FROM media'+where+' ORDER BY '+order+' LIMIT 24 OFFSET ?').all(...args,(query.page-1)*24).map(row=>({...mediaAsset(row),usage:usage(Number(row.id))}));
    const stats=db.prepare('SELECT count(*) AS count,coalesce(sum(size),0) AS bytes FROM media').get();
    const config=settings.read();
    res.json({assets,total,page:query.page,pages:Math.max(1,Math.ceil(total/24)),stats,limits:config.uploads,publicOrigin:config.domains.publicUrl||config.general.siteUrl});
  });
  admin.get('/:id/details',(req,res)=>{const row=db.prepare('SELECT * FROM media WHERE id=?').get(String(req.params.id));if(!row)throw new HttpError(404,'NOT_FOUND','Asset not found');res.json({...mediaAsset(row),usage:usage(Number(row.id))});});
  const limiter=rateLimit({windowMs:60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false});
  admin.post('/',limiter,(req,res,next)=>{
    const limits=settings.read().uploads;
    multer({storage:multer.memoryStorage(),limits:{fileSize:limits.maxSizeMb*1024*1024,files:1,fields:2,parts:3}}).single('file')(req,res,error=>{
      if(error)return next(new HttpError(error.code==='LIMIT_FILE_SIZE'?413:400,'INVALID_UPLOAD',error.code==='LIMIT_FILE_SIZE'?'File exceeds the configured size limit':'Invalid upload request'));
      next();
    });
  },async(req,res)=>{
    if(!req.file)throw new HttpError(400,'MISSING_FILE','Choose a file to upload');
    const visibility=z.enum(['public','private']).parse(req.body.visibility??'private');
    const limits=settings.read().uploads;
    const file=await validateFile(req.file.buffer,req.file.originalname,limits.allowedExtensions,limits.maxSizeMb*1024*1024);
    const name=storage.save(req.file.buffer,file.extension);
    try {
      const category=file.mime.startsWith('image/')?'image':file.mime.startsWith('video/')?'video':file.extension==='pdf'?'pdf':'document';
      const result=db.prepare('INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES(?,?,?,?,?,?,?)').run(file.filename,name,file.mime,req.file.size,file.extension,category,visibility);
      event(db,'media_uploaded',{mediaId:Number(result.lastInsertRowid)});
      res.status(201).json(mediaAsset(db.prepare('SELECT * FROM media WHERE id=?').get(result.lastInsertRowid)!));
    }catch(error){storage.delete(name);throw error;}
  });
  function send(id:string,publicOnly:boolean,res:import('express').Response,next:import('express').NextFunction){
    const row=db.prepare('SELECT * FROM media WHERE id=?').get(id);
    if(!row||(publicOnly&&row.visibility!=='public'))throw new HttpError(404,'NOT_FOUND','Asset not found');
    if(publicOnly)res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
    res.setHeader('Content-Type',String(row.mime));res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
    if(!String(row.mime).startsWith('image/')&&!String(row.mime).startsWith('video/'))res.attachment(String(row.filename));
    if(!publicOnly)res.setHeader('Cache-Control','no-store');
    res.sendFile(storage.path(String(row.storage_name)),error=>{if(error)next(new HttpError(404,'NOT_FOUND','Asset file is unavailable'));});
  }
  admin.get('/:id/file',(req,res,next)=>send(String(req.params.id),false,res,next));
  publicRouter.get('/:id',(req,res,next)=>send(String(req.params.id),true,res,next));
  admin.delete('/:id',(req,res)=>{
    const row=db.prepare('SELECT * FROM media WHERE id=?').get(String(req.params.id));
    if(!row)throw new HttpError(404,'NOT_FOUND','Asset not found');
    const referenced=db.prepare('SELECT owner_key FROM media_usage WHERE media_id=? LIMIT 1').get(Number(row.id));
    const path=`/media/${row.id}`;
    function includesUrl(value:unknown):boolean { if(typeof value==='string'){try{return new URL(value,'http://local').pathname.toLowerCase().replace(/\/+$/,'')===path;}catch{return false;}}if(Array.isArray(value))return value.some(includesUrl);if(value&&typeof value==='object')return Object.values(value).some(includesUrl);return false; }
    const referencedBySettings=[...db.prepare('SELECT value FROM settings').all(),...db.prepare('SELECT value FROM website_sections').all(),...db.prepare('SELECT data AS value FROM content_items').all()].some(setting=>includesUrl(JSON.parse(String(setting.value))));
    if(referenced||referencedBySettings)throw new HttpError(409,'ASSET_IN_USE','Remove this asset from website content or settings before deleting it');
    storage.delete(String(row.storage_name));db.prepare('DELETE FROM media WHERE id=?').run(Number(row.id));event(db,'media_deleted',{mediaId:Number(row.id)});res.json({message:'Asset deleted'});
  });
  return {admin,publicRouter};
}


