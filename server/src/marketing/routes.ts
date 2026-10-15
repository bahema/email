import { createHash } from 'node:crypto';
import { renderConfirmation } from '../mail/confirmation.js';
import { ContentStore } from '../content/store.js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { Sessions } from '../security/sessions.js';
import type { SettingsStore } from '../settings/store.js';
import { NewsletterStore,newsletterSchema,renderEmail,cleanEmailHtml,escapeHtml } from './newsletters.js';
import { SegmentStore,segmentSchema } from './segments.js';
import { CampaignStore,audienceSchema } from './campaigns.js';
import { sendMarketing,smtpError,type MarketingSender } from '../settings/email.js';
import { tokenHash,token } from '../security/crypto.js';
import { event,transaction } from '../db/helpers.js';
import { HttpError } from '../http.js';

const id=(value:unknown)=>z.coerce.number().int().positive().parse(value);
export function marketingRoutes(db:DatabaseSync,sessions:Sessions,settings:SettingsStore,testSender:MarketingSender=sendMarketing){
  const admin=Router(),tracking=Router(),newsletters=new NewsletterStore(db),segments=new SegmentStore(db),campaigns=new CampaignStore(db);
  admin.use(sessions.requireAdmin,sessions.csrf,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  admin.get('/broadcast-options',(_req,res)=>{const smtp=settings.read().smtp;res.json({configured:!!(smtp.host&&smtp.fromEmail&&(!smtp.username||smtp.passwordSet)),continents:['Africa','Asia','Europe','North America','South America','Oceania'].map(name=>({name,count:Number(db.prepare("SELECT count(*) n FROM contacts WHERE status='confirmed' AND continent=?").get(name)!.n)}))});});
  admin.post('/broadcast-send',(req,res)=>{
    const d=z.object({requestKey:z.uuid(),campaignId:z.number().int().positive().optional(),newsletterId:z.number().int().positive(),continents:z.array(z.enum(['Africa','Asia','Europe','North America','South America','Oceania'])).min(1).max(6),revision:z.string().min(1).max(100)}).strict().parse(req.body);
    const fingerprint=createHash('sha256').update(JSON.stringify({campaignId:d.campaignId,newsletterId:d.newsletterId,continents:[...new Set(d.continents)].sort(),revision:d.revision})).digest('hex');
    const campaign=transaction(db,()=>{
      const existing=db.prepare('SELECT * FROM broadcast_requests WHERE request_key=?').get(d.requestKey);
      if(existing){if(existing.fingerprint!==fingerprint)throw new HttpError(409,'REQUEST_CONFLICT','This send request was already used for different content or recipients');return campaigns.get(Number(existing.campaign_id));}
      const smtp=settings.read().smtp;if(!smtp.host||!smtp.fromEmail||(smtp.username&&!smtp.passwordSet))throw new HttpError(400,'SMTP_NOT_CONFIGURED','Configure your sender before sending');
      const n=newsletters.get(d.newsletterId) as ReturnType<NewsletterStore['get']>&{updated_at:string};if(n.updated_at!==d.revision)throw new HttpError(409,'EMAIL_CHANGED','The saved email changed. Reload and review it before sending');
      if(n.html.includes('{downloadUrl}'))throw new HttpError(400,'FUNNEL_EMAIL_ONLY','This email has a protected download link. Connect it to a lead page instead of broadcasting it');
      const audience={type:'continents' as const,continents:[...new Set(d.continents)]};if(!campaigns.preview(audience).eligible)throw new HttpError(400,'EMPTY_AUDIENCE','No confirmed subscribers in the selected continents');
      if(n.status!=='ready')newsletters.save({title:n.title,subject:n.subject,preheader:n.preheader,html:n.html,status:'ready'},n.id);
      if(d.campaignId){const current=campaigns.get(d.campaignId);if(current.newsletter_id!==n.id)throw new HttpError(409,'CAMPAIGN_CHANGED','Save the campaign with this email first');if(current.lead_submission_id||db.prepare('SELECT automation_enrollment_id FROM campaigns WHERE id=?').get(d.campaignId)?.automation_enrollment_id)throw new HttpError(409,'MANAGED_EMAIL','Use lead-page controls for automated emails');}
      const c=campaigns.save({name:d.campaignId?campaigns.get(d.campaignId).name:n.title.slice(0,100)+' · broadcast',newsletterId:n.id,audience},d.campaignId);const launched=campaigns.launch(c.id,Date.now());db.prepare('INSERT INTO broadcast_requests(request_key,fingerprint,campaign_id) VALUES(?,?,?)').run(d.requestKey,fingerprint,c.id);return launched;
    });res.status(202).json(campaign);
  });
  admin.get('/newsletters',(req,res)=>res.json(newsletters.list(z.enum(['newsletter','campaign']).optional().parse(req.query.workspace))));
  admin.get('/saved-email-library',(req,res)=>{const q=z.object({workspace:z.enum(['newsletter','campaign']),page:z.coerce.number().int().min(1).max(100000).default(1),search:z.string().max(200).default('')}).parse(req.query);res.json(newsletters.library(q.workspace,q.page,q.search));});
  admin.get('/saved-email-history',(req,res)=>{const q=z.object({workspace:z.enum(['newsletter','campaign']),page:z.coerce.number().int().min(1).max(100000).default(1),search:z.string().max(200).default(''),status:z.enum(['','draft','scheduled','sending','sent','paused','failed','cancelled']).default('')}).parse(req.query);res.json(campaigns.history(q.workspace,q.page,q.search,q.status));});
  admin.get('/newsletters/:id',(req,res)=>res.json(newsletters.get(id(req.params.id))));
  admin.post('/newsletters',(req,res)=>res.status(201).json(newsletters.save(req.body)));
  admin.put('/newsletters/:id',(req,res)=>res.json(newsletters.save(req.body,id(req.params.id))));
  admin.post('/newsletters/:id/duplicate',(req,res)=>res.status(201).json(newsletters.duplicate(id(req.params.id))));
  admin.delete('/newsletters/:id',(req,res)=>{newsletters.remove(id(req.params.id));res.json({message:'Newsletter deleted'});});
  admin.post('/newsletter-preview',(req,res)=>{const data=newsletterSchema.parse(req.body);res.json(renderEmail({...data,id:0},settings.read(),'Demo Subscriber',settings.read().domains.publicUrl.replace(/\/$/,'')+'/unsubscribe'));});
  admin.post('/newsletter-sanitize',(req,res)=>res.json({html:cleanEmailHtml(z.object({html:z.string().max(75000)}).strict().parse(req.body).html)}));
  const limiter=rateLimit({windowMs:60000,limit:3,keyGenerator:()=> 'newsletter-test',standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,_res,next)=>next(new HttpError(429,'RATE_LIMITED','Wait a minute before another newsletter test'))});
  admin.post('/newsletters/:id/test',limiter,async(req,res)=>{
    const data=z.object({recipient:z.email().max(254)}).strict().parse(req.body),newsletter=newsletters.get(id(req.params.id));
    const email=renderEmail(newsletter,settings.read(),'Demo Subscriber',settings.read().domains.publicUrl.replace(/\/$/,'')+'/unsubscribe');email.subject=`[TEST] ${email.subject}`;
    try{await testSender(settings.smtpCredentials(),data.recipient,email,`<newsletter-test-${token()}@${settings.read().smtp.fromEmail.split('@')[1]||'localhost'}>`);}catch(error){throw smtpError(error);}
    event(db,'newsletter_test_sent',{newsletterId:newsletter.id});res.json({message:'Test accepted by SMTP. Check the recipient inbox.'});
  });
  admin.get('/segment-options',(_req,res)=>res.json({tags:db.prepare('SELECT id,name FROM tags ORDER BY name').all(),sources:db.prepare('SELECT DISTINCT source_type,source_id,source_label FROM contacts ORDER BY source_type,source_label').all(),campaigns:db.prepare('SELECT id,name,status FROM campaigns ORDER BY id DESC').all()}));
  admin.post('/segments/:id/duplicate',(req,res)=>res.status(201).json(segments.duplicate(id(req.params.id))));
  admin.get('/segments/:id/connections',(req,res)=>res.json(segments.connections(id(req.params.id))));
  admin.get('/segments',(_req,res)=>res.json(segments.list()));
  admin.post('/segments',(req,res)=>res.status(201).json(segments.save(req.body)));
  admin.put('/segments/:id',(req,res)=>res.json(segments.save(req.body,id(req.params.id))));
  admin.post('/segment-preview',(req,res)=>res.json(segments.preview(req.body,z.object({page:z.coerce.number().int().min(1).max(100000).default(1),view:z.enum(['all','eligible','excluded']).default('all')}).parse(req.query))));
  admin.post('/segments/:id/preview',(req,res)=>{const {name,mode,rules}=segments.get(id(req.params.id));res.json(segments.preview({name,mode,rules}));});
  admin.delete('/segments/:id',(req,res)=>{const segmentId=id(req.params.id);segments.get(segmentId);if(db.prepare("SELECT id FROM recurring_campaigns WHERE json_extract(audience,'$.segmentId')=? LIMIT 1").get(segmentId)||db.prepare("SELECT id FROM campaigns WHERE json_extract(audience,'$.segmentId')=? AND status='draft' LIMIT 1").get(segmentId))throw new HttpError(409,'IN_USE','A draft campaign or recurring schedule uses this segment. Change its audience before deleting.');db.prepare('DELETE FROM segments WHERE id=?').run(segmentId);res.json({message:'Segment deleted'});});
  const confirmationSchema=z.object({confirmationSubject:z.string().trim().min(1).max(200).refine(v=>!/[\r\n]/.test(v)),confirmationBody:z.string().trim().min(1).max(10000)}).strict();
  const content=new ContentStore(db,settings);
  const confirmationPreview=(input:unknown)=>{const d=confirmationSchema.parse(input),base=settings.read().domains.publicUrl.replace(/\/$/,'');const fill=(v:string)=>v.replace(/\{(name|siteName|confirmationUrl|unsubscribeUrl)\}/g,(_m,k:string)=>({name:'Demo Subscriber',siteName:settings.read().general.siteName,confirmationUrl:base+'/confirm/demo-preview',unsubscribeUrl:base+'/unsubscribe/demo-preview'}[k]!));let text=fill(d.confirmationBody);if(!d.confirmationBody.includes('{confirmationUrl}'))text+='\n\nConfirm: '+base+'/confirm/demo-preview';if(!d.confirmationBody.includes('{unsubscribeUrl}'))text+='\n\nUnsubscribe: '+base+'/unsubscribe/demo-preview';return renderConfirmation(fill(d.confirmationSubject),text,settings.read(),base+'/confirm/demo-preview',base+'/unsubscribe/demo-preview',/<[a-z][\s\S]*>/i.test(d.confirmationBody),'Demo Subscriber');};
  admin.get('/confirmation-template',(_req,res)=>{const s=content.sections().signup;res.json({confirmationSubject:s.confirmationSubject,confirmationBody:s.confirmationBody});});
  admin.put('/confirmation-template',()=>{throw new HttpError(409,'SYSTEM_EMAIL_LOCKED','Subscription confirmation is a fixed system email. Campaign and newsletter content remains editable.');});
  admin.post('/confirmation-preview',(req,res)=>res.json(confirmationPreview(req.body)));
  admin.post('/confirmation-test',limiter,async(req,res)=>{const d=z.object({recipient:z.email().max(254)}).strict().parse(req.body),s=content.sections().signup,email=confirmationPreview({confirmationSubject:s.confirmationSubject,confirmationBody:s.confirmationBody});email.subject='[TEST] '+email.subject;try{await testSender(settings.smtpCredentials(),d.recipient,email,`<confirmation-test-${token()}@${settings.read().smtp.fromEmail.split('@')[1]||'localhost'}>`);}catch(e){throw smtpError(e);}event(db,'confirmation_test_sent',{});res.json({message:'Test accepted by SMTP. Demo links do not confirm subscriptions.'});});
  admin.get('/recurring-campaigns',(_req,res)=>res.json(campaigns.recurring()));
  admin.post('/recurring-campaigns',(req,res)=>res.status(201).json(campaigns.saveRecurring(req.body)));
  admin.post('/recurring-campaigns/:id/control',(req,res)=>res.json(campaigns.controlRecurring(id(req.params.id),z.object({status:z.enum(['running','paused'])}).strict().parse(req.body).status)));
  admin.get('/recurring-campaigns/:id/history',(req,res)=>res.json(campaigns.occurrenceHistory(id(req.params.id))));
  admin.get('/email-centre',(_req,res)=>{const s=settings.read();res.json({campaignCounts:db.prepare("SELECT status,count(*) count FROM campaigns WHERE automation_enrollment_id IS NULL AND lead_submission_id IS NULL GROUP BY status").all(),timezone:s.general.timezone,sender:{name:s.smtp.fromName,email:s.smtp.fromEmail},tracking:s.tracking,smtpConfigured:!!(s.smtp.host&&s.smtp.fromEmail),queue:db.prepare("SELECT status,count(*) count FROM email_queue GROUP BY status").all(),transactional:db.prepare("SELECT status,count(*) count FROM transactional_outbox GROUP BY status").all()});});
  admin.get('/campaigns',(_req,res)=>res.json(campaigns.list()));
  admin.use('/campaigns/:id',(req,_res,next)=>{if(db.prepare('SELECT automation_enrollment_id FROM campaigns WHERE id=?').get(id(req.params.id))?.automation_enrollment_id)throw new HttpError(409,'AUTOMATION_MANAGED','Control this send through its email sequence');next();});
  admin.get('/campaigns/:id',(req,res)=>{const {snapshot,...campaign}=campaigns.get(id(req.params.id));res.json(campaign);});
  admin.post('/campaigns',(req,res)=>res.status(201).json(campaigns.save(req.body)));
  admin.put('/campaigns/:id',(req,res)=>res.json(campaigns.save(req.body,id(req.params.id))));
  admin.post('/audience-preview',(req,res)=>res.json(campaigns.preview(audienceSchema.parse(req.body))));
  admin.delete('/campaigns/:id',(req,res)=>{campaigns.archive(id(req.params.id));res.json({message:'Deleted from saved history. Delivery and consent records are retained.'});});
  admin.post('/campaigns/:id/reuse-email',(req,res)=>{const q=z.object({workspace:z.enum(['newsletter','campaign'])}).strict().parse(req.body);res.status(201).json(campaigns.reuseEmail(id(req.params.id),q.workspace));});
  admin.post('/campaigns/:id/duplicate',(req,res)=>res.status(201).json(campaigns.duplicate(id(req.params.id))));
  admin.get('/campaigns/:id/preview',(req,res)=>{const c=campaigns.get(id(req.params.id));const n=c.snapshot?JSON.parse(c.snapshot):newsletters.get(c.newsletter_id);res.json(renderEmail(n,settings.read(),'Demo Subscriber',settings.read().domains.publicUrl.replace(/\/$/,'')+'/unsubscribe/demo-preview'));});
  admin.post('/campaigns/:id/launch',(req,res)=>{
    const data=z.object({mode:z.enum(['now','schedule']),scheduledAt:z.string().optional()}).strict().parse(req.body);
    const time=data.mode==='now'?Date.now():Date.parse(data.scheduledAt||'');
    if(!Number.isFinite(time)||(data.mode==='schedule'&&(time<Date.now()+1000||time>Date.now()+366*86400000)))throw new HttpError(400,'INVALID_SCHEDULE','Schedule between one second and one year from now');
    res.status(202).json(campaigns.launch(id(req.params.id),time));
  });
  admin.post('/campaigns/:id/:action',(req,res)=>{const action=z.enum(['pause','resume','cancel']).parse(req.params.action);res.json(campaigns.control(id(req.params.id),action));});
  admin.get('/campaigns/:id/deliveries',(req,res)=>res.json(campaigns.deliveries(id(req.params.id),z.coerce.number().int().min(1).max(100000).parse(req.query.page||1))));
  admin.get('/marketing-summary',(_req,res)=>{
    const count=(sql:string)=>Number(db.prepare(sql).get()!.n);
    res.json({totalLeads:count('SELECT count(*) n FROM contacts'),confirmed:count("SELECT count(*) n FROM contacts WHERE status='confirmed'"),pending:count("SELECT count(*) n FROM contacts WHERE status='pending'"),unsubscribed:count("SELECT count(*) n FROM contacts WHERE status='unsubscribed'"),sent:count("SELECT count(*) n FROM email_queue WHERE status='sent'"),failed:count("SELECT count(*) n FROM email_queue WHERE status='failed'"),queued:count("SELECT count(*) n FROM email_queue WHERE status IN ('pending','processing')"),opened:count("SELECT count(*) n FROM email_queue WHERE status='sent' AND opened_at IS NOT NULL"),clicked:count("SELECT count(*) n FROM email_queue WHERE status='sent' AND clicked_at IS NOT NULL"),openTracked:count("SELECT count(*) n FROM email_queue WHERE status='sent' AND track_opens=1"),clickTracked:count("SELECT count(*) n FROM email_queue WHERE status='sent' AND track_clicks=1"),affiliateClicks:count("SELECT count(*) n FROM events WHERE type='affiliate_clicked'"),recentCampaigns:campaigns.list().slice(0,5)});
  });
  tracking.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
  function job(raw:string){if(!/^[a-f0-9]{64}$/.test(raw))return;return db.prepare("SELECT * FROM email_queue WHERE tracking_token_hash=? AND status='sent'").get(tokenHash(raw));}
  tracking.get('/open/:raw',(req,res)=>{
    const raw=String(req.params.raw).replace(/\.gif$/,''),row=job(raw);
    if(row&&row.track_opens&&settings.read().tracking.opens)transaction(db,()=>{
      const updated=db.prepare("UPDATE email_queue SET opened_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND opened_at IS NULL").run(Number(row.id));
      db.prepare("UPDATE contacts SET last_open_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(Number(row.contact_id));
      if(updated.changes)event(db,'email_opened',{queueId:Number(row.id),campaignId:Number(row.campaign_id)},Number(row.contact_id));
    });res.type('image/gif').send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
  });
  tracking.get('/click/:raw/:ordinal',(req,res)=>{
    const row=job(String(req.params.raw));if(!row)throw new HttpError(404,'NOT_FOUND','Email link not found');
    const ordinal=id(req.params.ordinal),link=db.prepare('SELECT destination FROM email_links WHERE queue_id=? AND ordinal=?').get(Number(row.id),ordinal);if(!link)throw new HttpError(404,'NOT_FOUND','Email link not found');
    const destination=new URL(String(link.destination));if(!['http:','https:'].includes(destination.protocol)||destination.username||destination.password)throw new HttpError(400,'INVALID_LINK','Email link is unavailable');
    if(row.track_clicks&&settings.read().tracking.emailClicks)transaction(db,()=>{
      const updated=db.prepare("UPDATE email_queue SET clicked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND clicked_at IS NULL").run(Number(row.id));
      db.prepare("UPDATE contacts SET last_click_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(Number(row.contact_id));
      if(updated.changes)event(db,'email_clicked',{queueId:Number(row.id),campaignId:Number(row.campaign_id)},Number(row.contact_id));
    });res.redirect(302,destination.toString());
  });return{admin,tracking};
}
