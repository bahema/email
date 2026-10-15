import {pathToFileURL} from 'node:url';
import {initialHtml,setPublicRenderer} from './public-bootstrap.js';
import express from 'express';
import { mkdirSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { createApp, errorHandler } from './app.js';
import { openDatabase } from './db/database.js';
import { migrate } from './db/migrations.js';
import { SettingsStore } from './settings/store.js';
import { TransactionalWorker } from './mail/worker.js';
import { MarketingWorker } from './marketing/worker.js';
import { pageMetadata,renderPageHtml } from './seo.js';

if (!config.SETTINGS_ENCRYPTION_KEY) throw new Error('Run npm run security:setup before starting the server');
const db = openDatabase(config.databasePath);
const version = migrate(db);
mkdirSync(config.uploadDir, { recursive: true });
const renderModule=await import(pathToFileURL(resolve(config.clientDist.replace(/[\\/]client[\\/]dist$/, ''),config.NODE_ENV==='production'?'client/dist-ssr/server-render.js':'client/src/public/server-render.tsx')).href);
setPublicRenderer(renderModule.renderPublic);
const app = createApp(db, version);
const worker = new TransactionalWorker(db, new SettingsStore(db, config.SETTINGS_ENCRYPTION_KEY, config.SITE_URL, config.TIMEZONE), config.SETTINGS_ENCRYPTION_KEY);
const previewOnly=process.env.PREVIEW_ONLY==='true';
const stopWorker = previewOnly?async()=>{}:worker.start();
const stopMarketing = previewOnly?async()=>{}:new MarketingWorker(db,new SettingsStore(db,config.SETTINGS_ENCRYPTION_KEY,config.SITE_URL,config.TIMEZONE)).start();
if(previewOnly)console.info('Review mode: queued email delivery is paused. Use npm run dev for normal delivery.');
if (config.NODE_ENV === 'production') {
  const html=readFileSync(resolve(config.clientDist,'index.html'),'utf8');
  const seoSettings=new SettingsStore(db,config.SETTINGS_ENCRYPTION_KEY,config.SITE_URL,config.TIMEZONE);
  app.use(express.static(config.clientDist,{index:false}));
  app.get('/{*path}', (req,res,next)=>{try{const meta=pageMetadata(db,seoSettings,req.path,req.hostname);res.setHeader('Cache-Control','no-store');if(meta.noindex)res.setHeader('X-Robots-Tag','noindex, nofollow');res.status(meta.notFound?404:200).type('html').send(initialHtml(html,db,seoSettings,req.path,req.hostname,/(?:^|;\s*)affiliate_storage_notice=1(?:;|$)/.test(req.headers.cookie||''),req.originalUrl.includes('?')?'?'+req.originalUrl.split('?').slice(1).join('?').slice(0,2048):''));}catch(e){next(e);}});
}
app.use(errorHandler);
const server = app.listen(config.PORT, config.HOST, () => console.info(`API listening on http://${config.HOST}:${config.PORT}`));
server.on('error', () => { console.error('API could not start. Check host and port configuration.'); void Promise.all([stopWorker(),stopMarketing()]).then(()=>{db.close();process.exitCode=1;}); });
let shuttingDown=false;
function shutdown() { if(shuttingDown)return;shuttingDown=true;const closed=new Promise<void>(resolve=>server.close(()=>resolve()));void Promise.all([closed,stopWorker(),stopMarketing()]).then(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),30_000).unref(); }
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);



