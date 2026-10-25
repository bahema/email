import {senderReady} from '../mail/mailgun.js';
import {emailDnsReadiness} from './dns.js';
import {ContentStore} from '../content/store.js';
import { createHash } from 'node:crypto';
import { frameEmail } from '../mail/branding.js';
import { renderConfirmation } from '../mail/confirmation.js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { SettingsSection, SystemResponse } from '@affiliate/shared';
import type { Sessions } from '../security/sessions.js';
import { HttpError, validate } from '../http.js';
import { settingsSchemas } from './schema.js';
import { SettingsStore } from './store.js';
import { smtpService, smtpError, type EmailService } from './email.js';

export interface AdminOptions {
  encryptionKey: string; siteUrl: string; timezone: string; secureCookies: boolean;
  sessionHours: number; environment: string; emailService?: EmailService;
}
export function adminRoutes(db: DatabaseSync, version: number, sessions: Sessions, options: AdminOptions) {
  const router = Router();
  const settings = new SettingsStore(db, options.encryptionKey, options.siteUrl, options.timezone);
  const email = options.emailService ?? smtpService;
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(sessions.requireAdmin, sessions.csrf);
  router.get('/email-dns-readiness',rateLimit({windowMs:60000,limit:5,standardHeaders:true,legacyHeaders:false}),async(_req,res)=>{const s=settings.read();res.json(await emailDnsReadiness(s.smtp.fromEmail,s.domains.dkimSelector));});
  router.get('/settings', (_req, res) => res.json(settings.read()));
  const fingerprint=()=>createHash('sha256').update(JSON.stringify(settings.smtpCredentials())).digest('hex');
  router.get('/settings-readiness',(_req,res)=>{
    const s=settings.read(),configured=senderReady(settings.smtpCredentials()),digest=fingerprint();
    function test(type:string){const row=db.prepare('SELECT created_at,metadata FROM events WHERE type=? ORDER BY id DESC LIMIT 1').get(type);const metadata=row?JSON.parse(String(row.metadata||'{}')):{};return{at:row?String(row.created_at):null,current:metadata.fingerprint===digest};}
    const local=['localhost','127.0.0.1','[::1]','::1'].includes(new URL(s.domains.publicUrl).hostname);
    const website=new ContentStore(db,settings),sampleCount=website.items().filter(i=>['active','approved'].includes(i.status)&&(/demo|fictional/i.test(i.title)||/fictional/i.test(JSON.stringify(i.data)))).length,policies=website.sections().legal;
    const checks=[
      {key:'samples',label:'Published content',ok:sampleCount===0,detail:sampleCount?`${sampleCount} published demonstration entries need real content before promotion.`:'No obvious demo markers in published entries.',section:'general'},
      {key:'policycopy',label:'Policy content',ok:!Object.values(policies).some(v=>/add your|add the terms/i.test(v)||v.length<150),detail:'Review Website content policy text and supply accurate business/contact details before launch.',section:'compliance'},
      {key:'smtp',label:'Sender configuration',ok:configured,detail:settings.delivery().config().transport==='mailgun'&&!settings.delivery().config().providerApproved?'Mailgun sending is held until specific provider approval is recorded.':configured?'Selected transport and sender details saved.':'Set sender email and the credentials required by the selected transport.',section:'smtp'},
      {key:'domain',label:'Public links',ok:!local&&s.domains.publicUrl.startsWith('https:'),detail:local?'Local preview links cannot be opened by external recipients.':s.domains.publicUrl.startsWith('https:')?'Public HTTPS origin configured; availability is not tested.':'Use HTTPS for public email links.',section:'domains'},
      {key:'identity',label:'Sender identity',ok:!!s.smtp.fromName&&!!(s.emailDefaults.identity||s.general.siteName),detail:'Sender name and website identity appear in outgoing emails.',section:'emailDefaults'},
      {key:'address',label:'Public contact details',ok:!!s.emailDefaults.address&&!!(s.emailDefaults.contactEmail||s.general.adminEmail),detail:'Review the postal address and public contact email shown to subscribers.',section:'emailDefaults'},
      {key:'consent',label:'Consent journey',ok:!!s.compliance.consentText,detail:s.compliance.doubleOptIn?'Global confirmation is enabled. Lead pages may have explicit journey overrides.':'Global single opt-in is enabled. Explicit consent and suppression rules still apply.',section:'compliance'},
      {key:'legal',label:'Policy links',ok:!!s.compliance.privacyUrl&&!!s.compliance.termsUrl,detail:'Review public privacy and terms URLs.',section:'compliance'}
    ];
    const history=db.prepare("SELECT id,created_at,metadata FROM events WHERE type='settings_updated' ORDER BY id DESC LIMIT 20").all().map(row=>{const m=JSON.parse(String(row.metadata||'{}'));return{id:Number(row.id),at:String(row.created_at),section:String(m.section||'settings'),fields:Array.isArray(m.fields)?m.fields:[]};});
    res.json({configured,deliveryPaused:settings.delivery().config().paused,transport:settings.delivery().config().transport,previewPaused:process.env.PREVIEW_ONLY==='true',trustedAdminOrigin:options.siteUrl,connectionTest:test('smtp_verified'),sendTest:test('smtp_test_sent'),checks,history});
  });
  router.post('/settings-preview',(req,res)=>{
    const draft=z.object({general:settingsSchemas.general,emailDefaults:settingsSchemas.emailDefaults,domains:settingsSchemas.domains,compliance:settingsSchemas.compliance}).strict().parse(req.body);
    const s={...settings.read(),...draft},base=s.domains.publicUrl.replace(/\/$/,'');
    res.json({marketing:frameEmail('<h1>Your next useful discovery</h1><p>Hello Demo Subscriber,</p><p>This sample shows the branding and footer used by campaign and automated emails.</p>',s,base+'/unsubscribe/demo-preview'),confirmation:renderConfirmation('Welcome to '+s.general.siteName,'Hello Demo Subscriber, welcome! Please confirm your email.',s,base+'/confirm/demo-preview',base+'/unsubscribe/demo-preview',false,'Demo Subscriber').html});
  });
  router.put('/settings/:section', (req, res) => {
    const section = String(req.params.section);
    if (!Object.hasOwn(settingsSchemas, section)) throw new HttpError(404, 'NOT_FOUND', 'Settings section not found');
    res.json(settings.save(section as SettingsSection, req.body));
  });
  const smtpLimiter = rateLimit({ windowMs: 60000, limit: 3, keyGenerator: () => 'admin-smtp', standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'RATE_LIMITED', 'Wait a minute before another SMTP test.')),
  });
  router.post('/smtp/verify', smtpLimiter, async (_req, res) => {
    try {
      const credentials=settings.smtpCredentials(),digest=createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
      await email.verify(credentials);
      db.prepare('INSERT INTO events (type,metadata) VALUES (?,?)').run('smtp_verified',JSON.stringify({fingerprint:digest}));
      res.json({ message: credentials.transport==='mailgun'?'Mailgun API credentials and domain lookup succeeded. This does not prove delivery or approval to send marketing.':'SMTP connection and authentication succeeded. This does not verify sender permissions.' });
    } catch (error) { throw smtpError(error); }
  });
  router.post('/smtp/test', smtpLimiter, validate(z.object({ recipient: z.email().max(254) }).strict()), async (req, res) => {
    try {
      const credentials=settings.smtpCredentials(),digest=createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
      await email.sendTest(credentials, req.body.recipient);
      db.prepare('INSERT INTO events (type,metadata) VALUES (?,?)').run('smtp_test_sent',JSON.stringify({fingerprint:digest}));
      res.json({ message: credentials.transport==='mailgun'?'Test email accepted by Mailgun. Check the recipient inbox.':'Test email accepted by the SMTP server. Check the recipient inbox.' });
    } catch (error) { throw smtpError(error); }
  });
  router.get('/system', (_req, res) => {
    db.prepare('SELECT 1').get();
    const smtp = settings.read().smtp;
    res.json({ schemaVersion: version, database: 'connected', uptimeSeconds: Math.floor(process.uptime()), runtime: process.version,
      environment: options.environment, activeSessions: Number(db.prepare('SELECT count(*) AS count FROM admin_sessions WHERE admin_id = 1 AND expires_at > ?').get(Date.now())?.count),
      sessionHours: options.sessionHours, secureCookies: options.secureCookies, worker: Number(db.prepare('SELECT seen_at FROM worker_heartbeats WHERE name=?').get('transactional')?.seen_at ?? 0) > Date.now()-10000 ? 'running' : 'stopped', emailQueue: 'marketing_and_transactional',
      marketingWorker: Number(db.prepare("SELECT seen_at FROM worker_heartbeats WHERE name='marketing'").get()?.seen_at??0)>Date.now()-10000?'running':'stopped',
      marketingPending: Number(db.prepare("SELECT count(*) count FROM email_queue WHERE status IN ('pending','processing')").get()!.count),
      marketingFailed: Number(db.prepare("SELECT count(*) count FROM email_queue WHERE status='failed'").get()!.count),
      outboxPending: Number(db.prepare("SELECT count(*) AS count FROM transactional_outbox WHERE status='pending'").get()?.count),
      outboxFailed: Number(db.prepare("SELECT count(*) AS count FROM transactional_outbox WHERE status='failed'").get()?.count),
      smtpConfigured: senderReady(settings.smtpCredentials()), encryptionConfigured: !!options.encryptionKey,
    } satisfies SystemResponse);
  });
  return router;
}

