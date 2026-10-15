import { DownloadPageStore } from '../downloads.js';
import { createHash } from 'node:crypto';
import { renderConfirmation } from '../mail/confirmation.js';
import { frameEmail } from '../mail/branding.js';
import { escapeHtml } from '../marketing/newsletters.js';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { Contact,ContactStatus } from '@affiliate/shared';
import type { SettingsStore } from '../settings/store.js';
import type { ContentStore } from '../content/store.js';
import { countryInfo } from './countries.js';
import { token,tokenHash,encryptSecret } from '../security/crypto.js';
import { HttpError } from '../http.js';
import { event,transaction } from '../db/helpers.js';
import { FunnelDomains } from '../lead-pages/domains.js';
import { LeadPageStore } from '../lead-pages/store.js';
import { NewsletterStore } from '../marketing/newsletters.js';
import { AutomationStore } from '../automations/store.js';

export const signupSchema=z.object({name:z.string().trim().min(1).max(120),email:z.string().trim().toLowerCase().pipe(z.email().max(254)),country:z.string().trim().toUpperCase().length(2),consent:z.literal(true),source:z.object({type:z.enum(['newsletter','footer','hero','offer','upcoming','lead_page']),id:z.string().max(120),promotionId:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional()}).strict(),utm:z.object({utm_source:z.string().max(200).optional(),utm_medium:z.string().max(200).optional(),utm_campaign:z.string().max(200).optional(),utm_content:z.string().max(500).optional(),utm_term:z.string().max(200).optional()}).strict().default({}),website:z.string().max(200).default(''),answers:z.record(z.string().max(50),z.string().max(2000)).refine(v=>Object.keys(v).length<=10).default({})}).strict();
export const canReceiveMarketing=(status:ContactStatus|string)=>status==='confirmed';
export const blockedStatuses=['bounced','complained','suppressed'];
export class ContactStore {
  constructor(private db:DatabaseSync,private settings:SettingsStore,private content:ContentStore,private encryptionKey:string){}
  source(type:string,id:string,promotionId?:string):{type:string;id:string;label:string;tags:string[];promotion?:{heroId:number;key:string;headline:string;headerTitle:string};pageId?:number;page?:ReturnType<LeadPageStore['get']>['data']}{
    if(type==='lead_page'){const page=new LeadPageStore(this.db).active(id);return{type,id,label:page.name,tags:page.data.tags,pageId:page.id,page:page.data};}
    if(type==='footer'||type==='newsletter'){
      if(id!==type)throw new HttpError(400,'INVALID_SOURCE','Invalid signup source');
      return{type,id,label:type==='footer'?'Footer newsletter':'Newsletter signup',tags:['newsletter']};
    }
    const record=this.content.publicItems().find(item=>item.kind===type&&String(item.id)===id&&item.status==='active');
    if(!record||(type==='hero'&&this.content.sections().homepage.activeHeroId!==record.id))throw new HttpError(404,'SOURCE_INACTIVE','This signup form is unavailable');
    if(type==='hero'){const slides=record.data.slides as import('@affiliate/shared').HeaderSlide[],slide=promotionId?slides.find(s=>s.key===promotionId):slides.find(s=>!s.hidden);if(!slide||slide.hidden)throw new HttpError(404,'PROMOTION_INACTIVE','This advertisement is unavailable');const layout=slide.layout==='inherit'?record.data.type:slide.layout;if(slide.action!=='lead_capture')throw new HttpError(400,'INVALID_PROMOTION','This advertisement does not accept subscriptions');if(slide.endsAt&&Date.parse(slide.endsAt)<=Date.now())throw new HttpError(410,'CAMPAIGN_ENDED','This promotion has ended');let page:ReturnType<LeadPageStore['active']>|undefined;if(slide.signup.leadPageId){const saved=new LeadPageStore(this.db).get(slide.signup.leadPageId);page=new LeadPageStore(this.db).active(saved.slug);if(!['double','single'].includes(page.data.deliveryMode))throw new HttpError(400,'INVALID_JOURNEY','The linked funnel does not accept subscriptions');}return{type,id,label:(record.title+' · '+slide.headline).slice(0,200),tags:[...new Set(['header-'+record.id+'-'+createHash('sha256').update(slide.key).digest('hex').slice(0,16),...slide.signup.tags,...(record.data.tags as string[]),...(page?.data.tags??[])])].slice(0,50),promotion:{heroId:record.id,key:slide.key,headline:slide.headline,headerTitle:record.title},pageId:page?.id,page:page?.data};}
    return{type,id,label:record.title,tags:(record.data.tags??[]) as string[]};
  }
  private createToken(contactId:number,purpose:'confirm'|'unsubscribe',submissionId:number|null=null,resubscribe=false){
    if(purpose==='confirm')this.db.prepare("UPDATE transactional_outbox SET status='cancelled' WHERE contact_id=? AND purpose='confirmation' AND status='pending' AND token_hash IN (SELECT token_hash FROM contact_tokens WHERE submission_id IS ?)").run(contactId,submissionId);
    if(purpose==='confirm')this.db.prepare("UPDATE contact_tokens SET consumed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE contact_id=? AND purpose='confirm' AND consumed_at IS NULL AND submission_id IS ?").run(contactId,submissionId);
    const raw=token(),hash=tokenHash(raw);
    this.db.prepare('INSERT INTO contact_tokens(token_hash,contact_id,submission_id,purpose,resubscribe,expires_at) VALUES(?,?,?,?,?,?)').run(hash,contactId,submissionId,purpose,resubscribe?1:0,purpose==='confirm'?Date.now()+24*3600000:null);
    return{raw,hash};
  }
  private queue(contactId:number,hash:string,purpose:'confirmation'|'unsubscribe_link',subject:string,text:string,html?:string,scheduledAt=Date.now()){
    this.db.prepare('INSERT INTO transactional_outbox(contact_id,token_hash,purpose,payload,scheduled_at) VALUES(?,?,?,?,?)').run(contactId,hash,purpose,encryptSecret(JSON.stringify({subject,text,html:html??frameEmail('<p>'+escapeHtml(text).replace(/\n/g,'<br>')+'</p>',this.settings.read(),text.match(/https?:\/\/[^\s<>]+\/unsubscribe\/[a-f0-9]+/)?.[0]??this.settings.read().domains.publicUrl+'/unsubscribe')}),this.encryptionKey,'contact-mail'),scheduledAt);
  }
  private tag(contactId:number,names:string[]){
    for(const raw of names){const name=raw.trim().toLowerCase();if(!name)continue;this.db.prepare('INSERT INTO tags(name) VALUES(?) ON CONFLICT(name) DO NOTHING').run(name);const tag=this.db.prepare('SELECT id FROM tags WHERE name=?').get(name)!;this.db.prepare('INSERT INTO contact_tags(contact_id,tag_id) VALUES(?,?) ON CONFLICT DO NOTHING').run(contactId,Number(tag.id));}
  }
  signup(input:unknown,host?:string){
    const data=signupSchema.parse(input);if(data.website)return;
    const mapping=host?new FunnelDomains(this.db).resolve(host):null;const country=countryInfo(data.country),source=this.source(data.source.type,data.source.id,data.source.promotionId),settings=this.settings.read(),signup=this.content.sections().signup;
    if(source.page&&['browse','campaign'].includes(source.page.deliveryMode))throw new HttpError(400,'NO_SIGNUP','This funnel does not accept subscriptions');
    if(source.page?.endsAt&&Date.parse(source.page.endsAt)<=Date.now())throw new HttpError(410,'CAMPAIGN_ENDED','This campaign has ended and no longer accepts signups');
    transaction(this.db,()=>{
      let existing=this.db.prepare('SELECT * FROM contacts WHERE email=?').get(data.email);
      if(existing&&blockedStatuses.includes(String(existing.status)))return;
      if(!existing){const result=this.db.prepare('INSERT INTO contacts(name,email,country,continent,status,source_type,source_id,source_label) VALUES(?,?,?,?,?,?,?,?)').run(data.name,data.email,country.code,country.continent,'pending',source.type,source.id,source.label);existing=this.db.prepare('SELECT * FROM contacts WHERE id=?').get(result.lastInsertRowid)!;event(this.db,'lead_created',{sourceType:source.type,sourceId:source.id},Number(existing.id));}
      const contactId=Number(existing.id);
      if(source.page){const keys=new Set(source.page.questions.map(q=>q.key));if(Object.keys(data.answers).some(key=>!keys.has(key)))throw new HttpError(400,'INVALID_ANSWERS','Unknown form question');for(const q of source.page.questions){const answer=(data.answers[q.key]??'').trim();if((q.required&&!answer)||(answer&&q.options.length&&!q.options.includes(answer)))throw new HttpError(400,'INVALID_ANSWERS',`Please answer: ${q.label}`);}}
      // One contact may request different offers, but repeating the same journey must
      // not manufacture acquisitions, notifications or another immediate campaign.
      const generalSignup=['footer','newsletter'].includes(source.type);
      const sourceWhere=generalSignup?"contact_id=? AND source_type IN ('footer','newsletter')":"contact_id=? AND source_type=? AND source_id=? AND coalesce(promotion_key,'')=?";
      const sourceArgs=generalSignup?[contactId]:[contactId,source.type,source.id,source.promotion?.key??''];
      const previous=this.db.prepare(`SELECT * FROM lead_submissions WHERE ${sourceWhere} ORDER BY id DESC LIMIT 1`).get(...sourceArgs);
      const completed=this.db.prepare(`SELECT * FROM lead_submissions WHERE ${sourceWhere} AND confirmed_at IS NOT NULL ORDER BY id DESC LIMIT 1`).get(...sourceArgs);
      const currentJourney=source.page?{...source.page,resourceId:source.page.downloadPageId?new DownloadPageStore(this.db).active(source.page.downloadPageId).mediaId:source.page.resourceId}:null;
      const sameJourney=(row:Record<string,unknown>)=>{const frozen=row.page_snapshot?JSON.parse(String(row.page_snapshot)):null;if(!currentJourney)return !frozen;return !!frozen&&['deliveryMode','directNewsletterId','automationId','resourceId','downloadPageId'].every(key=>(frozen[key]??null)===(currentJourney[key as keyof typeof currentJourney]??null));};
      if(existing.status==='confirmed'&&completed&&sameJourney(completed))return;
      if(previous&&sameJourney(previous)){
        const pending=this.db.prepare("SELECT token_hash FROM contact_tokens WHERE submission_id=? AND purpose='confirm' AND consumed_at IS NULL AND expires_at>?").get(Number(previous.id),Date.now());
        if(pending||(!previous.confirmed_at&&Date.now()-Date.parse(String(previous.created_at))<60000))return;
      }
      const result=this.db.prepare('INSERT INTO lead_submissions(contact_id,name,country,source_type,source_id,source_label,consent_text,utm,tags) VALUES(?,?,?,?,?,?,?,?,?)').run(contactId,data.name,country.code,source.type,source.id,source.label,settings.compliance.consentText,JSON.stringify(settings.tracking.utm?data.utm:{}),JSON.stringify(source.tags));
      const submissionId=Number(result.lastInsertRowid);if(source.promotion){this.db.prepare('UPDATE lead_submissions SET promotion_key=?,promotion_snapshot=? WHERE id=?').run(source.promotion.key,JSON.stringify(source.promotion),submissionId);this.db.prepare("INSERT OR IGNORE INTO admin_notifications(submission_id,stage) VALUES(?,'submitted')").run(submissionId);}event(this.db,'lead_submitted',{sourceType:source.type,sourceId:source.id,submissionId},contactId);
      if(source.page){const downloadPage=source.page.downloadPageId?new DownloadPageStore(this.db).active(source.page.downloadPageId):null;const resourceId=downloadPage?.mediaId??source.page.resourceId;this.db.prepare('UPDATE lead_submissions SET page_snapshot=? WHERE id=?').run(JSON.stringify({...source.page,resourceId,downloadPage,pageId:source.pageId,publicOrigin:mapping?.slug===source.id?'https://'+mapping.host:settings.domains.publicUrl,answers:data.answers,directEmail:source.page.directNewsletterId?new NewsletterStore(this.db).get(source.page.directNewsletterId):null}),submissionId);if(source.page.directNewsletterId)this.db.prepare('INSERT OR IGNORE INTO media_usage(media_id,owner_key) SELECT media_id,? FROM media_usage WHERE owner_key=?').run(`submission:${submissionId}`,`newsletter:${source.page.directNewsletterId}`);if(resourceId)this.db.prepare('INSERT OR IGNORE INTO media_usage(media_id,owner_key) VALUES(?,?)').run(resourceId,`submission:${submissionId}`);if(downloadPage?.imageId)this.db.prepare('INSERT OR IGNORE INTO media_usage(media_id,owner_key) VALUES(?,?)').run(downloadPage.imageId,`submission:${submissionId}`);}
      if(source.page?.deliveryMode==='single'&&existing.status!=='unsubscribed'){
        if(existing.status!=='confirmed')this.db.prepare("UPDATE contacts SET name=?,country=?,continent=?,status='confirmed',consent_mode='single',confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(data.name,country.code,country.continent,contactId);
        this.db.prepare("UPDATE lead_submissions SET consent_mode='single',confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(submissionId);
        this.tag(contactId,source.tags);event(this.db,'lead_confirmed',{submissionId,mode:'single_opt_in'},contactId);this.notifyActivation(submissionId);this.deliverSubmission(contactId,submissionId);return;
      }
      const confirmationSettings=source.page??signup;
      if(!settings.compliance.doubleOptIn&&existing.status==='pending'&&!source.page){
        this.db.prepare("UPDATE contacts SET status='confirmed',consent_mode='single',confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(contactId);this.db.prepare("UPDATE lead_submissions SET confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(submissionId);this.tag(contactId,source.tags);event(this.db,'lead_confirmed',{submissionId,mode:'single_opt_in'},contactId);this.notifyActivation(submissionId);return;
      }
      // Separate requested offers keep independent confirmation links. Pace new messages
      // instead of accepting an acquisition that has no deliverable confirmation.
      const confirmationAt=Math.max(Date.now(),Number(existing.last_confirmation_at??0)+60000);
      const confirmation=this.createToken(contactId,'confirm',submissionId,existing.status==='unsubscribed');
      const unsubscribe=this.createToken(contactId,'unsubscribe');
      const base=(mapping?.slug===source.id?'https://'+mapping.host:settings.domains.publicUrl).replace(/\/$/,'');
      const replacements:Record<string,string>={name:data.name,siteName:settings.general.siteName,confirmationUrl:`${base}/confirm/${confirmation.raw}`,unsubscribeUrl:`${base}/unsubscribe/${unsubscribe.raw}`};
      const fill=(value:string)=>value.replace(/\{(name|siteName|confirmationUrl|unsubscribeUrl)\}/g,(_match,key:string)=>replacements[key]!);
      const htmlMode=/<[a-z][\s\S]*>/i.test(confirmationSettings.confirmationBody);
      const body=htmlMode?confirmationSettings.confirmationBody.replace(/\{(name|siteName|confirmationUrl|unsubscribeUrl)\}/g,(_m:string,key:string)=>escapeHtml(replacements[key]!)):fill(confirmationSettings.confirmationBody);let text=body;if(!confirmationSettings.confirmationBody.includes('{confirmationUrl}'))text+=`\n\nConfirm: ${replacements.confirmationUrl}`;if(!confirmationSettings.confirmationBody.includes('{unsubscribeUrl}'))text+=`\n\nUnsubscribe: ${replacements.unsubscribeUrl}`;
      const rendered=renderConfirmation(fill(confirmationSettings.confirmationSubject),text,{...settings,domains:{...settings.domains,publicUrl:base}},replacements.confirmationUrl!,replacements.unsubscribeUrl!,htmlMode,replacements.name!);this.queue(contactId,confirmation.hash,'confirmation',rendered.subject,rendered.text,rendered.html,confirmationAt);this.db.prepare('UPDATE contacts SET last_confirmation_at=? WHERE id=?').run(confirmationAt,contactId);event(this.db,'confirmation_queued',{submissionId},contactId);
    });
  }
  pendingBatch(ids:number[],mode:'delete'|'resend'){
    if(!ids.length||ids.length>25||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw new HttpError(400,'INVALID_SELECTION','Select between 1 and 25 different contacts');
    return transaction(this.db,()=>{
      const contacts=ids.map(id=>this.contact(id));
      if(contacts.some(c=>c.status!=='pending'))throw new HttpError(409,'CONTACT_CHANGED','Only unconfirmed contacts can use this action. Refresh the list');
      if(mode==='resend'){let queued=0;for(const c of contacts){const before=Number(this.db.prepare('SELECT count(*) n FROM transactional_outbox WHERE contact_id=?').get(c.id)?.n);this.resendConfirmation(c.email);queued+=Number(this.db.prepare('SELECT count(*) n FROM transactional_outbox WHERE contact_id=?').get(c.id)?.n)>before?1:0;}event(this.db,'admin_confirmation_batch',{selected:ids.length,queued});return{selected:ids.length,queued,skipped:ids.length-queued};}
      for(const c of contacts){
        if(c.confirmed_at||c.email_verified_at||this.db.prepare('SELECT id FROM lead_submissions WHERE contact_id=? AND confirmed_at IS NOT NULL LIMIT 1').get(c.id)||this.db.prepare('SELECT id FROM email_queue WHERE contact_id=? LIMIT 1').get(c.id)||this.db.prepare('SELECT id FROM automation_enrollments WHERE contact_id=? LIMIT 1').get(c.id)||this.db.prepare('SELECT token_hash FROM download_tokens WHERE contact_id=? LIMIT 1').get(c.id)||this.db.prepare("SELECT id FROM transactional_outbox WHERE contact_id=? AND status='processing' LIMIT 1").get(c.id))throw new HttpError(409,'CONTACT_IN_USE','A selected contact has confirmed history or an email being processed. It cannot be deleted here');
      }
      for(const c of contacts){
        const submissions=this.db.prepare('SELECT id FROM lead_submissions WHERE contact_id=?').all(c.id);
        for(const row of submissions){if(this.db.prepare('SELECT id FROM campaigns WHERE lead_submission_id=? LIMIT 1').get(Number(row.id)))throw new HttpError(409,'CONTACT_IN_USE','A selected contact has a connected campaign');this.db.prepare('DELETE FROM media_usage WHERE owner_key=?').run(`submission:${row.id}`);this.db.prepare('DELETE FROM admin_notifications WHERE submission_id=?').run(Number(row.id));}
        this.db.prepare('DELETE FROM transactional_outbox WHERE contact_id=?').run(c.id);
        this.db.prepare('DELETE FROM contact_tokens WHERE contact_id=?').run(c.id);
        this.db.prepare('DELETE FROM events WHERE contact_id=?').run(c.id);
        this.db.prepare('DELETE FROM lead_submissions WHERE contact_id=?').run(c.id);
        this.db.prepare('DELETE FROM contacts WHERE id=?').run(c.id);
      }
      event(this.db,'unconfirmed_contacts_deleted',{count:ids.length});return{deleted:ids.length};
    });
  }
  resendConfirmation(email:string,source?:{type:string;id:string;promotionId?:string}){transaction(this.db,()=>{
    const contact=this.db.prepare("SELECT * FROM contacts WHERE email=? AND status IN ('pending','confirmed','unsubscribed')").get(email.toLowerCase());
    if(!contact||(contact.last_confirmation_at&&Date.now()-Number(contact.last_confirmation_at)<60000))return;
    const submission=source&&['footer','newsletter'].includes(source.type)?this.db.prepare("SELECT * FROM lead_submissions WHERE contact_id=? AND source_type IN ('footer','newsletter') ORDER BY id DESC LIMIT 1").get(Number(contact.id)):source?this.db.prepare("SELECT * FROM lead_submissions WHERE contact_id=? AND source_type=? AND source_id=? AND coalesce(promotion_key,'')=? ORDER BY id DESC LIMIT 1").get(Number(contact.id),source.type,source.id,source.promotionId??''):this.db.prepare('SELECT * FROM lead_submissions WHERE contact_id=? ORDER BY id DESC LIMIT 1').get(Number(contact.id));if(!submission)return;
    // Opt-out can only be reversed after a new, explicit consenting submission.
    if(contact.status==='unsubscribed'&&(submission.confirmed_at||!contact.unsubscribed_at||Date.parse(String(submission.created_at))<Date.parse(String(contact.unsubscribed_at))))return;
    const settings=this.settings.read(),signup=this.content.sections().signup,confirmation=this.createToken(Number(contact.id),'confirm',Number(submission.id),contact.status==='unsubscribed'),unsubscribe=this.createToken(Number(contact.id),'unsubscribe');
    const original=submission.page_snapshot?JSON.parse(String(submission.page_snapshot)):null;const base=(original?.publicOrigin||settings.domains.publicUrl).replace(/\/$/,'');
    const confirmationSettings=submission.page_snapshot?JSON.parse(String(submission.page_snapshot)):signup;
    const replacements:Record<string,string>={name:String(submission.name),siteName:settings.general.siteName,confirmationUrl:`${base}/confirm/${confirmation.raw}`,unsubscribeUrl:`${base}/unsubscribe/${unsubscribe.raw}`};
    const fill=(value:string)=>value.replace(/\{(name|siteName|confirmationUrl|unsubscribeUrl)\}/g,(_match,key:string)=>replacements[key]!);
    const htmlMode=/<[a-z][\s\S]*>/i.test(confirmationSettings.confirmationBody);
      const body=htmlMode?confirmationSettings.confirmationBody.replace(/\{(name|siteName|confirmationUrl|unsubscribeUrl)\}/g,(_m:string,key:string)=>escapeHtml(replacements[key]!)):fill(confirmationSettings.confirmationBody);let text=body;if(!confirmationSettings.confirmationBody.includes('{confirmationUrl}'))text+=`\n\nConfirm: ${replacements.confirmationUrl}`;if(!confirmationSettings.confirmationBody.includes('{unsubscribeUrl}'))text+=`\n\nUnsubscribe: ${replacements.unsubscribeUrl}`;
    const rendered=renderConfirmation(fill(confirmationSettings.confirmationSubject),text,{...settings,domains:{...settings.domains,publicUrl:base}},replacements.confirmationUrl!,replacements.unsubscribeUrl!,htmlMode,replacements.name!);this.queue(Number(contact.id),confirmation.hash,'confirmation',rendered.subject,rendered.text,rendered.html);this.db.prepare('UPDATE contacts SET last_confirmation_at=? WHERE id=?').run(Date.now(),Number(contact.id));event(this.db,'confirmation_queued',{submissionId:Number(submission.id),resend:true},Number(contact.id));
  });}
  private getToken(raw:string,purpose:string){
    if(!/^[a-f0-9]{64}$/.test(raw))throw new HttpError(400,'INVALID_TOKEN','This link is invalid');
    const found=this.db.prepare('SELECT t.*,c.status FROM contact_tokens t JOIN contacts c ON c.id=t.contact_id WHERE token_hash=? AND purpose=?').get(tokenHash(raw),purpose);
    if(!found)throw new HttpError(400,'INVALID_TOKEN','This link is invalid');
    if(found.expires_at&&Number(found.expires_at)<=Date.now())throw new HttpError(410,'TOKEN_EXPIRED','This confirmation link has expired. Request another confirmation email.');
    return found;
  }
  inspect(raw:string,purpose:'confirm'|'unsubscribe'){
    const entry=this.getToken(raw,purpose),submission=entry.submission_id?this.db.prepare('SELECT page_snapshot,confirmed_at FROM lead_submissions WHERE id=?').get(Number(entry.submission_id)):undefined;
    const signup=submission?.page_snapshot?JSON.parse(String(submission.page_snapshot)):this.content.sections().signup;
    let downloadUrl:string|null=null,offerUrl:string|null=null;const recommendations:{title:string;message:string;href:string;affiliate:boolean}[]=[];
    if(purpose==='confirm'&&entry.consumed_at&&entry.status==='confirmed'&&submission?.confirmed_at){
      if(signup.resourceId){const rawDownload=token();this.db.prepare('INSERT INTO download_tokens(token_hash,contact_id,submission_id,media_id,expires_at,page_snapshot) VALUES(?,?,?,?,?,?)').run(tokenHash(rawDownload),Number(entry.contact_id),Number(entry.submission_id),Number(signup.resourceId),Date.now()+86400000,signup.downloadPage?JSON.stringify(signup.downloadPage):null);downloadUrl=`/${signup.downloadPage?'downloads':'download'}/${rawDownload}`;}
      for(const rule of signup.recommendations??[]){if(signup.answers?.[rule.questionKey]!==rule.answer)continue;const offer=this.db.prepare("SELECT slug,title,data FROM content_items WHERE id=? AND kind='offer' AND status='active'").get(rule.offerId);if(offer&&!recommendations.some(r=>r.title===offer.title)){const data=JSON.parse(String(offer.data));recommendations.push({title:String(offer.title),message:rule.message,href:data.action==='affiliate'?`/go/${offer.slug}`:`/resources/offer/${offer.slug}`,affiliate:data.action==='affiliate'});}}
      if(signup.offerId){const offer=this.db.prepare("SELECT slug FROM content_items WHERE id=? AND kind='offer' AND status='active'").get(Number(signup.offerId));if(offer)offerUrl=`/go/${offer.slug}`;}
    }
    if(purpose==='confirm'&&blockedStatuses.includes(String(entry.status)))throw new HttpError(409,'CONTACT_SUPPRESSED','This subscription cannot be activated');
    return{recommendations,downloadUrl,offerUrl,completed:purpose==='confirm'?!!entry.consumed_at&&entry.status==='confirmed'&&!!submission?.confirmed_at:['unsubscribed',...blockedStatuses].includes(String(entry.status)),headline:signup.successHeadline,message:signup.successMessage,returnLabel:signup.returnLabel,returnUrl:signup.returnUrl};
  }
  confirm(raw:string){
    return transaction(this.db,()=>{
      const entry=this.getToken(raw,'confirm');
      if(blockedStatuses.includes(String(entry.status)))throw new HttpError(409,'CONTACT_SUPPRESSED','This subscription cannot be activated');
      if(entry.consumed_at){const original=this.db.prepare('SELECT confirmed_at FROM lead_submissions WHERE id=?').get(Number(entry.submission_id));if(entry.status!=='confirmed'||!original?.confirmed_at)throw new HttpError(409,'TOKEN_USED','This confirmation link was already used or replaced. Request a new confirmation email.');return this.inspect(raw,'confirm');}
      if(entry.status==='unsubscribed'&&!entry.resubscribe)throw new HttpError(409,'TOKEN_USED','Request a new confirmation email to subscribe again');
      const submission=this.db.prepare('SELECT * FROM lead_submissions WHERE id=?').get(Number(entry.submission_id))!;
      if(entry.status==='confirmed'&&submission.confirmed_at){
        this.db.prepare("UPDATE contact_tokens SET consumed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?").run(String(entry.token_hash));
        this.db.prepare("UPDATE contacts SET email_verified_at=coalesce(email_verified_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=?").run(Number(entry.contact_id));
        this.db.prepare("UPDATE transactional_outbox SET status='cancelled' WHERE token_hash=? AND purpose='confirmation' AND status='pending'").run(String(entry.token_hash));
        return this.inspect(raw,'confirm');
      }
      const country=countryInfo(String(submission.country));
      if(entry.status!=='confirmed')this.db.prepare("UPDATE contacts SET name=?,country=?,continent=?,status='confirmed',confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),unsubscribed_at=NULL WHERE id=?").run(String(submission.name),country.code,country.continent,Number(entry.contact_id));
      this.db.prepare("UPDATE lead_submissions SET confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(Number(entry.submission_id));
      this.db.prepare("UPDATE contact_tokens SET consumed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?").run(String(entry.token_hash));
      this.db.prepare("UPDATE transactional_outbox SET status='cancelled' WHERE token_hash=? AND purpose='confirmation' AND status='pending'").run(String(entry.token_hash));
      this.tag(Number(entry.contact_id),JSON.parse(String(submission.tags)));event(this.db,'lead_confirmed',{submissionId:Number(entry.submission_id),resubscribed:!!entry.resubscribe},Number(entry.contact_id));
      this.db.prepare("UPDATE contacts SET email_verified_at=coalesce(email_verified_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),consent_mode='double' WHERE id=?").run(Number(entry.contact_id));
      this.notifyActivation(Number(entry.submission_id));this.deliverSubmission(Number(entry.contact_id),Number(entry.submission_id));
      return this.inspect(raw,'confirm');
    });
  }
  private notifyActivation(submissionId:number){this.db.prepare("INSERT OR IGNORE INTO admin_notifications(submission_id,stage) SELECT id,'activated' FROM lead_submissions WHERE id=? AND promotion_key IS NOT NULL").run(submissionId);}
  private deliverSubmission(contactId:number,submissionId:number){
    const submission=this.db.prepare('SELECT * FROM lead_submissions WHERE id=? AND contact_id=?').get(submissionId,contactId)!;
      const page=submission.page_snapshot?JSON.parse(String(submission.page_snapshot)):null;if(page?.directEmail){const email=page.directEmail;const campaignId=Number(this.db.prepare("INSERT INTO campaigns(name,newsletter_id,audience,snapshot,status,scheduled_at,lead_submission_id) VALUES(?,?,?,?,'scheduled',?,?)").run(`${submission.source_label} · immediate offer email`,email.id,JSON.stringify({type:'contacts',contactIds:[contactId]}),JSON.stringify(email),Date.now(),submissionId).lastInsertRowid);this.db.prepare('INSERT OR IGNORE INTO media_usage(media_id,owner_key) SELECT media_id,? FROM media_usage WHERE owner_key=?').run(`campaign:${campaignId}`,`submission:${submission.id}`);event(this.db,'page_email_queued',{campaignId,submissionId:submissionId},contactId);}if(page?.automationId)new AutomationStore(this.db).enroll(Number(page.automationId),contactId,submissionId);
  }
  unsubscribeContact(id:number){
    const contact=this.db.prepare('SELECT status FROM contacts WHERE id=?').get(id);
    if(!contact)throw new HttpError(404,'NOT_FOUND','Contact not found');
    if(!blockedStatuses.includes(String(contact.status))&&contact.status!=='unsubscribed'){this.db.prepare("UPDATE contacts SET status='unsubscribed',unsubscribed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_confirmation_at=NULL WHERE id=?").run(id);event(this.db,'unsubscribed',{},id);}
    this.db.prepare("UPDATE transactional_outbox SET status='cancelled' WHERE contact_id=? AND status IN ('pending','processing')").run(id);
    this.db.prepare("UPDATE email_queue SET status='cancelled',last_error='Contact unsubscribed' WHERE contact_id=? AND status='pending'").run(id);
    new AutomationStore(this.db).sync();
    this.db.prepare("UPDATE contact_tokens SET consumed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE contact_id=? AND purpose='confirm' AND consumed_at IS NULL").run(id);
  }
  unsubscribe(raw:string){transaction(this.db,()=>{const entry=this.getToken(raw,'unsubscribe');this.unsubscribeContact(Number(entry.contact_id));});return{message:'You have been unsubscribed. You will not receive marketing emails.'};}
  requestUnsubscribe(email:string){transaction(this.db,()=>{
    const contact=this.db.prepare("SELECT * FROM contacts WHERE email=? AND status IN ('pending','confirmed')").get(email.toLowerCase());if(!contact)return;
    if(this.db.prepare("SELECT id FROM transactional_outbox WHERE contact_id=? AND purpose='unsubscribe_link' AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute')").get(Number(contact.id)))return;
    const key=this.createToken(Number(contact.id),'unsubscribe');const base=this.settings.read().domains.publicUrl.replace(/\/$/,'');this.queue(Number(contact.id),key.hash,'unsubscribe_link','Your unsubscribe link',`To unsubscribe, open this link:\n${base}/unsubscribe/${key.raw}\n\nIf you did not request this link, ignore this email.`);
  });}
  contact(id:number):Contact{
    const row=this.db.prepare('SELECT id,name,email,country,continent,status,source_type,source_id,source_label,created_at,confirmed_at,unsubscribed_at,last_open_at,last_click_at,consent_mode,email_verified_at FROM contacts WHERE id=?').get(id);if(!row)throw new HttpError(404,'NOT_FOUND','Contact not found');
    return{...row,tags:this.db.prepare('SELECT t.id,t.name FROM tags t JOIN contact_tags ct ON ct.tag_id=t.id WHERE ct.contact_id=? ORDER BY t.name').all(id)} as unknown as Contact;
  }
  setTags(id:number,names:string[]){this.contact(id);transaction(this.db,()=>{this.db.prepare('DELETE FROM contact_tags WHERE contact_id=?').run(id);this.tag(id,names);event(this.db,'contact_tags_updated',{},id);});return this.contact(id);}
}





