import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config,projectRoot } from '../config.js';
import { openDatabase } from '../db/database.js';
import { migrate } from '../db/migrations.js';
import { SettingsStore } from '../settings/store.js';
import { ContentStore } from '../content/store.js';
import { LeadPageStore } from '../lead-pages/store.js';
import { LocalStorage,validateFile } from '../media/storage.js';
const db=openDatabase(config.databasePath);
try{
 migrate(db);
 const settings=new SettingsStore(db,config.SETTINGS_ENCRYPTION_KEY??'',config.SITE_URL,config.TIMEZONE),content=new ContentStore(db,settings),storage=new LocalStorage(config.uploadDir),ids:Record<string,number>={};
 for(const name of ['editorial-workspace','reading','tools']){
  const filename=`${name}.jpg`,existing=db.prepare("SELECT id FROM media WHERE filename=? AND visibility='public' ORDER BY id LIMIT 1").get(filename);
  if(existing){ids[name]=Number(existing.id);continue;}
  const bytes=readFileSync(resolve(projectRoot,'client/public/design',filename));
  const validated=await validateFile(bytes,filename,['jpg'],5*1024*1024),stored=storage.save(bytes,'jpg');
  ids[name]=Number(db.prepare("INSERT INTO media(filename,storage_name,mime,size,extension,category,visibility) VALUES(?,?,?,?,?,'image','public')").run(validated.filename,stored,validated.mime,bytes.length,validated.extension).lastInsertRowid);
 }
 let updated=0;
 for(const item of content.items()){
  if(!item.slug.startsWith('demo-'))continue;
  if(['offer','upcoming'].includes(item.kind)&&!item.data.imageId){const category=String(item.data.category??'');const key=/book|read|guide|business/i.test(category)?'reading':/software|tool|tech/i.test(category)?'tools':'editorial-workspace';const {id,...input}=item;content.saveItem({...input,data:{...input.data,imageId:ids[key]}},id);updated++;}
  if(item.kind==='hero'){
   const slides=item.data.slides as Record<string,unknown>[];
   if(slides.some(s=>!s.imageId&&!s.videoId)){const {id,...input}=item;content.saveItem({...input,data:{...input.data,slides:slides.map(s=>!s.imageId&&!s.videoId?{...s,imageId:ids['editorial-workspace']}:s)}},id);updated++;}
  }
 }
 const pages=new LeadPageStore(db),page=pages.list().find(p=>p.slug==='demo-free-guide');
 if(page&&!page.data.imageId&&!page.data.videoId){const {id,...input}=page;pages.save({...input,data:{...input.data,imageId:ids.reading}},id);updated++;}
 console.info(`Editorial artwork available in Media library; ${updated} demo records with empty image fields updated. Existing images and subscriber data preserved.`);
}finally{db.close();}
