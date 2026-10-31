import {embedPreviewHtml} from './embeds.js';
import {faqEmbedSource} from '@affiliate/shared';
import {heroResults} from './hero-results.js';
import {EditorialStore} from './editorial.js';
import { z } from 'zod';
import { LeadPageStore } from '../lead-pages/store.js';
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Sessions } from '../security/sessions.js';
import type { SettingsStore } from '../settings/store.js';
import { ContentStore } from './store.js';
import { HttpError } from '../http.js';
import { event } from '../db/helpers.js';

export function contentRoutes(db:DatabaseSync,sessions:Sessions,settings:SettingsStore){
  const store=new ContentStore(db,settings),admin=Router(),publicRouter=Router(),redirects=Router();
  admin.use(sessions.requireAdmin,sessions.csrf);
  admin.get('/header-notifications',(req,res)=>{const page=z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page),size=20;const total=Number(db.prepare('SELECT count(*) n FROM admin_notifications').get()?.n??0),unread=Number(db.prepare('SELECT count(*) n FROM admin_notifications WHERE read_at IS NULL').get()?.n??0);res.setHeader('Cache-Control','no-store');res.json({page,pageSize:size,total,unread,items:db.prepare('SELECT n.*,s.contact_id,s.source_label,s.promotion_snapshot,s.consent_mode,c.name,c.email,c.status FROM admin_notifications n JOIN lead_submissions s ON s.id=n.submission_id JOIN contacts c ON c.id=s.contact_id ORDER BY n.id DESC LIMIT ? OFFSET ?').all(size,(page-1)*size).map(r=>({...r,promotion:r.promotion_snapshot?JSON.parse(String(r.promotion_snapshot)):null,promotion_snapshot:undefined}))});});
  admin.post('/header-notifications/read',(req,res)=>{const input=z.object({ids:z.array(z.number().int().positive()).min(1).max(100)}).strict().parse(req.body);db.prepare("UPDATE admin_notifications SET read_at=coalesce(read_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id IN ("+input.ids.map(()=>'?').join(',')+")").run(...input.ids);res.json({message:'Notifications marked read'});});
  const editorial=new EditorialStore(db);
  admin.get('/embeds/:key/preview',(req,res)=>{const item=store.sections().embeds?.items.find(i=>i.key===String(req.params.key)),source=item?faqEmbedSource(item):'';if(!item||!source)throw new HttpError(404,'NOT_FOUND','Save a valid preview source first');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Security-Policy',`default-src 'none'; frame-src ${new URL(source).origin}; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'`);res.type('html').send(embedPreviewHtml(item));});
  admin.get('/editorial',(_req,res)=>res.json(editorial.list()));
  admin.post('/editorial',(req,res)=>res.status(201).json(editorial.save(req.body)));
  admin.put('/editorial/:id',(req,res)=>res.json(editorial.save(req.body,z.coerce.number().int().positive().parse(req.params.id))));
  admin.delete('/editorial/:id',(req,res)=>{editorial.remove(z.coerce.number().int().positive().parse(req.params.id));res.json({message:'Page deleted'});});
  admin.get('/items/:id/results',(req,res)=>{const id=z.coerce.number().int().positive().parse(req.params.id),days=z.coerce.number().int().min(1).max(365).default(30).parse(req.query.days);if(!store.items().some(i=>i.id===id&&i.kind==='hero'))throw new HttpError(404,'NOT_FOUND','Header not found');res.setHeader('Cache-Control','no-store');res.json({...heroResults(db,id,days),affiliateTracking:settings.read().tracking.affiliateClicks});});
  admin.get('/',(_req,res)=>res.json({items:store.items(),sections:store.sections()}));
  admin.post('/health/offers',(req,res)=>res.status(201).json(store.saveHealthOffer(req.body)));
  admin.put('/health/offers/:id',(req,res)=>res.json(store.saveHealthOffer(req.body,z.coerce.number().int().positive().parse(req.params.id))));
  admin.post('/items/drafts',(req,res)=>res.status(201).json(store.saveItem(req.body,undefined,true)));
  admin.put('/items/:id/draft',(req,res)=>res.json(store.saveItem(req.body,z.coerce.number().int().positive().parse(req.params.id),true)));
  admin.post('/items/:id/activate',(req,res)=>res.json(store.activateHeader(z.coerce.number().int().positive().parse(req.params.id))));
  admin.post('/items',(req,res)=>res.status(201).json(store.saveItem(req.body)));
  admin.put('/items/:id',(req,res)=>res.json(store.saveItem(req.body,Number(req.params.id))));
  admin.delete('/items/:id',(req,res)=>{store.remove(Number(req.params.id));res.json({message:'Content deleted'});});
  admin.put('/sections/:key',(req,res)=>res.json(store.saveSection(String(req.params.key),req.body)));
  publicRouter.get('/site',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(store.publicSite());});
  const go=(kind:string,slug:string,res:import('express').Response,funnel?:string,heroId?:string,promotionKey?:string)=>{
    const row=db.prepare("SELECT id,data FROM content_items WHERE kind=? AND slug=? AND status='active'").get(kind,slug);
    if(!row)throw new HttpError(404,'NOT_FOUND','Offer is unavailable');
    const data=JSON.parse(String(row.data));
    if(data.action!=='affiliate'||!/^https?:\/\//i.test(String(data.destination)))throw new HttpError(404,'NOT_FOUND','Affiliate destination is unavailable');
    let heroAttribution:Record<string,unknown>={};
    if(heroId&&/^\d{1,10}$/.test(heroId)&&promotionKey&&/^[a-zA-Z0-9_-]{1,100}$/.test(promotionKey)){
      const header=store.publicItems().find(i=>i.id===Number(heroId)&&i.kind==='hero'&&i.status==='active'&&store.sections().homepage.activeHeroId===i.id);
      const slide=(header?.data.slides as import('@affiliate/shared').HeaderSlide[]|undefined)?.find(s=>s.key===promotionKey&&!s.hidden);
      const linked=slide&&[slide.offerId,slide.featuredOfferId,...slide.collectionOfferIds,header?.data.featuredOfferId,...(header?.data.collectionOfferIds as number[]??[])].includes(Number(row.id));
      if(slide&&linked){if(slide.endsAt&&Date.parse(slide.endsAt)<=Date.now())throw new HttpError(410,'CAMPAIGN_ENDED','This promotion has ended');heroAttribution={heroId:Number(heroId),promotionKey};}
    }
    let funnelPageId:number|undefined;if(funnel&&kind==='offer'){try{const p=new LeadPageStore(db).active(funnel),ids=[p.data.offerId,...p.data.productIds,...p.data.sections.filter(b=>!b.hidden).flatMap(b=>b.offerIds),...p.data.recommendations.map(r=>r.offerId)];if(ids.includes(Number(row.id)))funnelPageId=p.id;}catch{}}if(settings.read().tracking.affiliateClicks)event(db,'affiliate_clicked',{offerId:Number(row.id),kind,slug,...heroAttribution,...(funnelPageId?{funnelPageId}:{})});
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.redirect(302,String(data.destination));
  };
  redirects.get('/upcoming/:slug',(req,res)=>go('upcoming',String(req.params.slug),res));
  redirects.get('/:slug',(req,res)=>go('offer',String(req.params.slug),res,typeof req.query.funnel==='string'?req.query.funnel:undefined,typeof req.query.hero==='string'?req.query.hero:undefined,typeof req.query.promotion==='string'?req.query.promotion:undefined));
  return {admin,publicRouter,redirects,store};
}
