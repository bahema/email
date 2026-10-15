import { Router, urlencoded } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { Sessions } from '../security/sessions.js';
import { signupSchema,type ContactStore } from './store.js';
import { countryOptions } from './countries.js';
import { HttpError,validate } from '../http.js';
import { AutomationStore } from '../automations/store.js';
import { event,transaction } from '../db/helpers.js';

const generic={message:'Thank you. If confirmation is needed, follow the email instructions and check spam if necessary. If you are already subscribed, no further action is needed.'};
export function contactRoutes(db:DatabaseSync,sessions:Sessions,store:ContactStore){
  const publicRouter=Router(),admin=Router();
  const limiter=rateLimit({windowMs:15*60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,_res,next)=>next(new HttpError(429,'RATE_LIMITED','Too many requests. Try again later.'))});
  // RFC 8058 providers POST without an owner session; the opaque token authorizes opt-out.
  // A GET from link scanners must never unsubscribe a contact.
  publicRouter.get('/unsubscribe/:token/one-click',(_req,res)=>{res.setHeader('Allow','POST');res.setHeader('Cache-Control','no-store');res.status(405).json({message:'Use POST to unsubscribe.'});});
  publicRouter.post('/unsubscribe/:token/one-click',urlencoded({extended:false,limit:'1kb'}),(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.body?.['List-Unsubscribe']!=='One-Click')throw new HttpError(400,'INVALID_UNSUBSCRIBE','A one-click unsubscribe request is required');
    store.unsubscribe(String(req.params.token));res.status(200).json({message:'Unsubscribed.'});
  });
  publicRouter.get('/countries',(_req,res)=>res.json(countryOptions));
  publicRouter.post('/subscribe',limiter,(req,res)=>{store.signup(req.body,req.hostname);res.status(202).json(generic);});
  publicRouter.post('/resend',limiter,validate(z.object({email:z.string().trim().toLowerCase().pipe(z.email().max(254)),source:signupSchema.shape.source.optional()}).strict()),(req,res)=>{store.resendConfirmation(req.body.email,req.body.source);res.status(202).json(generic);});
  publicRouter.post('/unsubscribe-request',limiter,validate(z.object({email:z.string().trim().toLowerCase().pipe(z.email().max(254))}).strict()),(req,res)=>{store.requestUnsubscribe(req.body.email);res.status(202).json(generic);});
  publicRouter.get('/confirm/:token',limiter,(req,res)=>{res.setHeader('Cache-Control','no-store');res.json(store.inspect(String(req.params.token),'confirm'));});
  publicRouter.post('/confirm/:token',limiter,(req,res)=>{res.setHeader('Cache-Control','no-store');res.json(store.confirm(String(req.params.token)));});
  publicRouter.get('/unsubscribe/:token',limiter,(req,res)=>{res.setHeader('Cache-Control','no-store');res.json(store.inspect(String(req.params.token),'unsubscribe'));});
  publicRouter.post('/unsubscribe/:token',limiter,(req,res)=>{res.setHeader('Cache-Control','no-store');res.json(store.unsubscribe(String(req.params.token)));});
  admin.use(sessions.requireAdmin,sessions.csrf,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  admin.get('/',(req,res)=>{
    const query=z.object({search:z.string().max(200).default(''),status:z.enum(['pending','confirmed','unsubscribed','bounced','complained','suppressed']).optional(),country:z.string().length(2).optional(),continent:z.enum(['Africa','Asia','Europe','North America','South America','Oceania']).optional(),tag:z.coerce.number().int().positive().optional(),source:z.string().max(200).optional(),sort:z.enum(['newest','oldest','name']).default('newest'),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(req.query);
    const clauses:string[]=[],values:(string|number)[]=[];
    if(query.search){clauses.push('(name LIKE ? OR email LIKE ?)');values.push(`%${query.search}%`,`%${query.search}%`);}
    for(const key of ['status','country','continent'] as const)if(query[key]){clauses.push(`${key}=?`);values.push(query[key]!);}
    if(query.source){clauses.push('source_label=?');values.push(query.source);}
    if(query.tag){clauses.push('id IN (SELECT contact_id FROM contact_tags WHERE tag_id=?)');values.push(query.tag);}
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const ids=db.prepare(`SELECT id FROM contacts${where} ORDER BY ${query.sort==='oldest'?'id ASC':query.sort==='name'?'name COLLATE NOCASE,id DESC':'id DESC'} LIMIT 25 OFFSET ?`).all(...values,(query.page-1)*25);
    res.json({contacts:ids.map(row=>store.contact(Number(row.id))),total:Number(db.prepare(`SELECT count(*) AS total FROM contacts${where}`).get(...values)?.total),page:query.page,counts:db.prepare('SELECT status,count(*) AS count FROM contacts GROUP BY status').all()});
  });
  admin.post('/pending-actions',rateLimit({windowMs:60000,limit:8,standardHeaders:true,legacyHeaders:false}),validate(z.object({ids:z.array(z.number().int().positive()).min(1).max(25),action:z.enum(['delete','resend'])}).strict()),(req,res)=>res.json(store.pendingBatch(req.body.ids,req.body.action)));
  admin.get('/sources',(_req,res)=>res.json(db.prepare('SELECT source_label label,count(*) count FROM contacts GROUP BY source_label ORDER BY source_label').all()));
  admin.get('/tags',(_req,res)=>res.json(db.prepare('SELECT t.id,t.name,count(ct.contact_id) AS contacts FROM tags t LEFT JOIN contact_tags ct ON ct.tag_id=t.id GROUP BY t.id ORDER BY t.name').all()));
  admin.post('/tags',validate(z.object({name:z.string().trim().toLowerCase().min(1).max(50)}).strict()),(req,res)=>{db.prepare('INSERT INTO tags(name) VALUES(?) ON CONFLICT(name) DO NOTHING').run(req.body.name);res.status(201).json(db.prepare('SELECT * FROM tags WHERE name=?').get(req.body.name));});
  admin.get('/outbox',(_req,res)=>res.json(db.prepare('SELECT o.id,c.email AS recipient,o.purpose,o.status,o.attempts,o.scheduled_at,o.sent_at,o.last_error,o.created_at FROM transactional_outbox o JOIN contacts c ON c.id=o.contact_id ORDER BY o.id DESC LIMIT 100').all()));
  admin.get('/delivery-history',(req,res)=>{
    const q=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),status:z.enum(['','pending','processing','sent','failed','cancelled']).default(''),search:z.string().max(254).default(''),contactId:z.coerce.number().int().positive().optional()}).parse(req.query);
    if(q.contactId)store.contact(q.contactId);
    const union=`SELECT o.id,'transactional' kind,o.contact_id,c.email recipient,o.purpose label,o.status,o.attempts,o.scheduled_at,o.sent_at,o.last_error,o.created_at FROM transactional_outbox o JOIN contacts c ON c.id=o.contact_id UNION ALL SELECT q.id,'marketing' kind,q.contact_id,q.recipient,q.subject label,q.status,q.attempts,q.scheduled_at,q.sent_at,q.last_error,q.created_at FROM email_queue q`;
    const where="(? IS NULL OR contact_id=?) AND (?='' OR status=?) AND (?='' OR instr(lower(recipient),lower(?))>0)",args=[q.contactId??null,q.contactId??null,q.status,q.status,q.search,q.search];
    res.json({items:db.prepare(`SELECT * FROM (${union}) WHERE ${where} ORDER BY created_at DESC,kind,id DESC LIMIT 20 OFFSET ?`).all(...args,(q.page-1)*20),total:Number(db.prepare(`SELECT count(*) n FROM (${union}) WHERE ${where}`).get(...args)?.n),page:q.page,pageSize:20});
  });
  admin.get('/:id/history',(req,res)=>{
    const contactId=z.coerce.number().int().positive().parse(req.params.id);store.contact(contactId);
    const q=z.object({section:z.enum(['submissions','events','automations']),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(req.query);
    const table=q.section==='submissions'?'lead_submissions':q.section==='events'?'events':'automation_enrollments';
    const select=q.section==='submissions'?'id,source_label,consent_text,utm,page_snapshot,created_at,confirmed_at':q.section==='events'?'id,type,created_at':'id,automation_id,status,created_at';
    const rows=db.prepare(`SELECT ${select} FROM ${table} WHERE contact_id=? ORDER BY id DESC LIMIT 20 OFFSET ?`).all(contactId,(q.page-1)*20);
    const items=q.section==='automations'?rows.map(e=>({...e,...db.prepare('SELECT name,status sequence_status FROM automations WHERE id=?').get(Number(e.automation_id)),steps:db.prepare('SELECT id,automation_step_position position,status,scheduled_at,(SELECT max(sent_at) FROM email_queue WHERE campaign_id=campaigns.id) sent_at FROM campaigns WHERE automation_enrollment_id=? ORDER BY automation_step_position').all(Number(e.id))})):rows;
    res.json({items,total:Number(db.prepare(`SELECT count(*) n FROM ${table} WHERE contact_id=?`).get(contactId)?.n),page:q.page,pageSize:20});
  });
  admin.get('/:id',(req,res)=>{const id=Number(req.params.id);res.json({contact:store.contact(id),submissions:db.prepare('SELECT id,name,country,source_type,source_id,source_label,consent_text,utm,page_snapshot,created_at,confirmed_at FROM lead_submissions WHERE contact_id=? ORDER BY id DESC LIMIT 100').all(id),events:db.prepare('SELECT type,metadata,created_at FROM events WHERE contact_id=? ORDER BY id DESC LIMIT 100').all(id)});});
  admin.put('/:id/tags',validate(z.object({tags:z.array(z.string().trim().min(1).max(50)).max(50)}).strict()),(req,res)=>res.json(store.setTags(Number(req.params.id),req.body.tags)));
  admin.post('/:id/unsubscribe',(req,res)=>{transaction(db,()=>store.unsubscribeContact(Number(req.params.id)));res.json(store.contact(Number(req.params.id)));});
  admin.post('/:id/suppress',(req,res)=>{const id=Number(req.params.id);store.contact(id);transaction(db,()=>{db.prepare("UPDATE contacts SET status='suppressed' WHERE id=?").run(id);db.prepare("UPDATE transactional_outbox SET status='cancelled' WHERE contact_id=? AND status IN ('pending','processing')").run(id);db.prepare("UPDATE email_queue SET status='cancelled',last_error='Contact suppressed' WHERE contact_id=? AND status='pending'").run(id);new AutomationStore(db).sync();event(db,'contact_suppressed',{},id);});res.json(store.contact(id));});
  return{admin,publicRouter};
}



