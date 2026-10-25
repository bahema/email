import {visitorSummary} from './visitors.js';
import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { Sessions } from '../security/sessions.js';
import type { SettingsStore } from '../settings/store.js';
import { AnalyticsStore,calendar,dayStart,dateWindow } from './store.js';
const query=z.object({range:z.enum(['today','7d','30d','all']).default('all'),campaignId:z.coerce.number().int().positive().optional(),search:z.string().max(254).default(''),contactId:z.coerce.number().int().positive().optional(),automationId:z.coerce.number().int().positive().optional(),sourceId:z.string().max(200).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),type:z.string().max(80).default(''),status:z.enum(['','pending','processing','sent','failed','cancelled']).default(''),kind:z.enum(['','manual','automation','lead_page','transactional']).default('')}).strict();
export function analyticsRoutes(db:DatabaseSync,sessions:Sessions,settings:SettingsStore){
  const router=Router(),store=new AnalyticsStore(db);
  router.use(sessions.requireAdmin,sessions.csrf,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  const reportQuery=query.extend({start:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),end:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).superRefine((q,ctx)=>{if(Boolean(q.start)!==Boolean(q.end))ctx.addIssue({code:'custom',message:'Provide both dates'});if(q.start&&q.end){const valid=(d:string)=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;if(!valid(q.start)||!valid(q.end)||q.start>q.end||Date.parse(q.end)-Date.parse(q.start)>365*86400000)ctx.addIssue({code:'custom',message:'Choose valid dates in order, at most 366 days'});}});
  router.get('/analytics',(req,res)=>{const q=reportQuery.parse(req.query),timezone=settings.read().general.timezone,now=Date.now(),date=calendar(timezone),next=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
    const bounds=q.start&&q.end?{from:new Date(dayStart(q.start,timezone)).toISOString(),to:new Date(Math.min(now,dayStart(next(q.end,1),timezone)-1)).toISOString()}:undefined;
    if(bounds&&bounds.from>bounds.to){res.status(400).json({error:'Start date cannot be in the future'});return;}
    const current=store.summary(q.range,timezone,now,bounds),w=bounds??dateWindow(q.range,timezone,now);
    let previous=null;if(w.from){const first=date(Date.parse(w.from)),last=date(Date.parse(w.to)),days=Math.round((Date.parse(last)-Date.parse(first))/86400000)+1;const p=store.summary(q.range,timezone,now,{from:new Date(dayStart(next(first,-days),timezone)).toISOString(),to:new Date(dayStart(first,timezone)-1).toISOString()});previous={from:p.from,to:p.to,totalLeads:p.totalLeads,sent:p.sent,affiliateClicks:p.affiliateClicks,downloads:p.downloads};}
    res.json({...current,previous,visitors:visitorSummary(db,timezone,current.from,current.to,now),visitorTrackingEnabled:settings.read().tracking.websiteVisits!==false});});
  router.get('/activity-log',(req,res)=>{const q=query.parse(req.query);res.json(store.activity(q.range,settings.read().general.timezone,q.page,q.type,Date.now(),q,q.campaignId));});
  router.get('/delivery-log',(req,res)=>{const q=query.parse(req.query);res.json(store.deliveries(q.range,settings.read().general.timezone,q.page,q.status,q.kind,Date.now(),q.campaignId,q));});
  router.get('/log-types',(_req,res)=>res.json(db.prepare('SELECT type,count(*) count FROM events GROUP BY type ORDER BY type LIMIT 500').all()));
  router.get('/logs-export',(req,res)=>{
    const q=query.extend({view:z.enum(['activity','delivery'])}).parse(req.query),timezone=settings.read().general.timezone,now=Date.now(),rows:Record<string,unknown>[]=[];
    for(let page=1;page<=20;page++){const result=q.view==='activity'?store.activity(q.range,timezone,page,q.type,now,q,q.campaignId):store.deliveries(q.range,timezone,page,q.status,q.kind,now,q.campaignId,q);rows.push(...result.items);if(rows.length>=result.total)break;}
    const columns=q.view==='activity'?['id','type','recipient','contact_id','created_at','metadata']:['id','kind','recipient','contact_id','campaign_id','automation_id','source_id','context','status','attempts','created_at','scheduled_at','sent_at','last_error','delivery_status','delivery_transport'];
    const cell=(value:unknown)=>{let text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="${q.view}-logs.csv"`);res.send('\ufeff'+columns.map(cell).join(',')+'\r\n'+rows.map(row=>columns.map(c=>cell(row[c])).join(',')).join('\r\n'));
  });
  return router;
}
