import {Router} from 'express';
import {createHmac} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {SettingsStore} from '../settings/store.js';
import {calendar} from './store.js';
import {transaction} from '../db/helpers.js';
import {pageMetadata} from '../seo.js';
import rateLimit from 'express-rate-limit';
export function recordVisit(db:DatabaseSync,secret:string,ip:string,path:string,timezone:string,now=Date.now()){
 if(!secret||!ip)return false;
 const day=calendar(timezone)(now),key=createHmac('sha256',secret).update(day+'\0'+ip).digest('hex');
 return transaction(db,()=>{
 const last=db.prepare('SELECT last_seen FROM website_visit_keys WHERE day=? AND visitor_key=? AND path=?').get(day,key,path);
 if(last&&now-Number(last.last_seen)<30000)return false;
 const known=!!db.prepare('SELECT 1 FROM website_visit_keys WHERE day=? AND visitor_key=? LIMIT 1').get(day,key);
 db.prepare('INSERT INTO website_visit_keys(day,visitor_key,path,last_seen) VALUES(?,?,?,?) ON CONFLICT(day,visitor_key,path) DO UPDATE SET last_seen=excluded.last_seen').run(day,key,path,now);
 db.prepare('INSERT INTO website_visit_days(day,page_views,visitors) VALUES(?,1,?) ON CONFLICT(day) DO UPDATE SET page_views=page_views+1,visitors=visitors+excluded.visitors').run(day,known?0:1);
 db.prepare('INSERT INTO website_visit_paths(day,path,page_views) VALUES(?,?,1) ON CONFLICT(day,path) DO UPDATE SET page_views=page_views+1').run(day,path);
 db.prepare('DELETE FROM website_visit_keys WHERE day<?').run(new Date(Date.parse(day+'T00:00:00Z')-2*86400000).toISOString().slice(0,10));
 return true;
 });
}
export function visitorSummary(db:DatabaseSync,timezone:string,from:string|null,to:string,now=Date.now()){
 const date=calendar(timezone),first=from?date(Date.parse(from)):'0000',last=date(Date.parse(to)),today=date(now),total=db.prepare('SELECT coalesce(sum(page_views),0) pageViews,coalesce(sum(visitors),0) dailyVisitors FROM website_visit_days WHERE day BETWEEN ? AND ?').get(first,last)!;
 return {...total,today:db.prepare('SELECT page_views pageViews,visitors FROM website_visit_days WHERE day=?').get(today)??{pageViews:0,visitors:0},started:db.prepare('SELECT min(day) day FROM website_visit_days').get()?.day??null,topPages:db.prepare('SELECT path,sum(page_views) views FROM website_visit_paths WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY views DESC,path LIMIT 8').all(first,last)};
}
export function visitorRoutes(db:DatabaseSync,settings:SettingsStore,secret:string){const router=Router();
 router.post('/api/public/visit',rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}), (req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const config=settings.read(),origin=req.get('origin');
 if(origin&&![config.domains.publicUrl,config.general.siteUrl,req.protocol+'://'+req.get('host')].includes(origin))return void res.sendStatus(403);
 if(config.tracking.websiteVisits===false||req.get('dnt')==='1'||req.get('sec-gpc')==='1'||/affiliate_session=/.test(req.headers.cookie||'')||/bot|crawler|spider|preview|headless|lighthouse/i.test(req.get('user-agent')||''))return void res.sendStatus(204);
 const path=req.body?.path;
 if(typeof path!=='string'||path.length>1000||!/^\/(?:$|health(?:\/products\/[^/?#]+)?$|promotions\/[^/?#]+$|categories\/[^/?#]+$|resources\/(?:offer|upcoming)\/[^/?#]+$|(?:guides|collections)(?:\/[^/?#]+)?$|p\/[^/?#]+$|privacy$|terms$|affiliate-disclosure$)/.test(path))return void res.sendStatus(204);
 const meta=pageMetadata(db,settings,path,req.hostname);
 if(!meta.noindex&&!meta.notFound)recordVisit(db,secret,req.ip||'',new URL(meta.canonical).pathname,config.general.timezone);
 res.sendStatus(204);
 });return router;}
