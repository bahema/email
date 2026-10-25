import {Router} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import type {DatabaseSync} from 'node:sqlite';
import type {SettingsStore} from '../settings/store.js';
import type {Sessions} from '../security/sessions.js';
import {FeedbackError,applyMailgunFeedback} from './feedback.js';
export function deliveryRoutes(db:DatabaseSync,settings:SettingsStore,sessions:Sessions){const admin=Router(),publicRouter=Router();
 admin.use(sessions.requireAdmin,sessions.csrf,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 admin.get('/',(_req,res)=>res.json(settings.delivery().read()));
 admin.put('/',(req,res)=>res.json(settings.delivery().save(req.body)));
 admin.post('/pause',(req,res)=>res.json(settings.delivery().pause(z.object({paused:z.boolean()}).strict().parse(req.body).paused)));
 admin.get('/status',(_req,res)=>{const config=settings.delivery().read(),counts=db.prepare('SELECT delivery_status status,count(*) count FROM email_delivery_messages GROUP BY delivery_status').all(),recent=db.prepare("SELECT m.id,m.kind,m.job_id,m.transport,m.delivery_status,m.created_at,m.accepted_at,m.contact_id,c.email recipient FROM email_delivery_messages m LEFT JOIN contacts c ON c.id=m.contact_id ORDER BY m.id DESC LIMIT 20").all();res.json({config,previewPaused:process.env.PREVIEW_ONLY==='true',webhookUrl:settings.read().domains.publicUrl.replace(/\/$/,'')+'/api/public/email-feedback/mailgun',counts,recent,lastFeedback:db.prepare('SELECT max(received_at) at FROM email_delivery_events').get()?.at??null});});
 publicRouter.post('/api/public/email-feedback/mailgun',rateLimit({windowMs:60000,limit:240,standardHeaders:'draft-8',legacyHeaders:false}),(req,res)=>{res.setHeader('Cache-Control','no-store');const config=settings.delivery().config();if(!config.feedbackEnabled)return void res.sendStatus(404);try{applyMailgunFeedback(db,settings.delivery().webhookKey(),req.body);res.status(200).json({received:true});}catch(error){if(error instanceof FeedbackError)return void res.status(error.status).json({error:'Invalid delivery feedback'});throw error;}});
 return{admin,publicRouter};}
