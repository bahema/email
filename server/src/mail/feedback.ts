import {CampaignStore} from '../marketing/campaigns.js';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import {transaction,event} from '../db/helpers.js';
import {AutomationStore} from '../automations/store.js';
const normalized=(id:string)=>id.trim().replace(/^<|>$/g,'');
const recipientHash=(email:string)=>createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
export function beginDelivery(db:DatabaseSync,kind:'transactional'|'marketing',jobId:number,contactId:number,recipient:string,messageId:string,transport='smtp'){
 db.prepare("INSERT INTO email_delivery_messages(kind,job_id,contact_id,recipient,message_id,transport) VALUES(?,?,?,?,?,?) ON CONFLICT(kind,job_id) DO UPDATE SET message_id=excluded.message_id,transport=excluded.transport WHERE accepted_at IS NULL").run(kind,jobId,contactId,recipientHash(recipient),normalized(messageId),transport);
 return Number(db.prepare('SELECT id FROM email_delivery_messages WHERE kind=? AND job_id=?').get(kind,jobId)!.id);
}
export function acceptedDelivery(db:DatabaseSync,id:number,receipt?:void|{providerMessageId:string}){db.prepare("UPDATE email_delivery_messages SET accepted_at=coalesce(accepted_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),provider_message_id=coalesce(?,provider_message_id),delivery_status=CASE WHEN delivery_status='unknown' THEN 'accepted' ELSE delivery_status END WHERE id=?").run(receipt?.providerMessageId?normalized(receipt.providerMessageId).slice(0,998):null,id);}
const webhookSchema=z.object({signature:z.object({timestamp:z.union([z.string().regex(/^\d{1,12}$/),z.number().int().nonnegative()]),token:z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),signature:z.string().regex(/^[a-f0-9]{64}$/i)}),'event-data':z.object({id:z.string().min(1).max(200),event:z.string().max(100),timestamp:z.number().finite().nonnegative(),recipient:z.string().trim().toLowerCase().pipe(z.email().max(254)),severity:z.string().max(50).optional(),message:z.object({headers:z.object({'message-id':z.string().min(1).max(1000)})})})});
export class FeedbackError extends Error{constructor(public status:number){super('Invalid delivery feedback');}}
export function applyMailgunFeedback(db:DatabaseSync,secret:string,input:unknown,now=Date.now()){
 const result=webhookSchema.safeParse(input);if(!result.success||!secret)throw new FeedbackError(401);const payload=result.data,s=payload.signature,stamp=Number(s.timestamp)*1000;
 if(!Number.isSafeInteger(stamp)||stamp>now+300000||stamp<now-24*3600000)throw new FeedbackError(401);
 const expected=createHmac('sha256',secret).update(String(s.timestamp)+s.token).digest(),supplied=Buffer.from(s.signature,'hex');if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw new FeedbackError(401);
 const data=payload['event-data'],kind=data.event==='delivered'?'delivered':data.event==='complained'?'complained':data.event==='unsubscribed'?'unsubscribed':data.event==='failed'?data.severity==='permanent'?'bounced':data.severity==='temporary'?'temporary_failure':null:null;
 if(!kind)return{applied:false};const occurred=Math.round(data.timestamp*1000);if(!Number.isSafeInteger(occurred)||occurred>now+300000)throw new FeedbackError(400);
 return transaction(db,()=>{
  const fingerprint=createHash('sha256').update(s.token).digest('hex');
  if(db.prepare('SELECT id FROM email_delivery_events WHERE provider_event_id=? OR token_hash=?').get(data.id,fingerprint))return{applied:false};
  const id=normalized(data.message.headers['message-id']),message=db.prepare('SELECT * FROM email_delivery_messages WHERE (message_id=? OR provider_message_id=?) AND recipient=? AND transport=?').get(id,id,recipientHash(data.recipient),'mailgun');
  if(!message||occurred<Date.parse(String(message.created_at))-300000)return{applied:false};
  db.prepare('INSERT INTO email_delivery_events(provider_event_id,token_hash,message_id,kind,occurred_at) VALUES(?,?,?,?,?)').run(data.id,fingerprint,Number(message.id),kind,occurred);
  const acceptedAt=new Date(now).toISOString();
  db.prepare('UPDATE email_delivery_messages SET accepted_at=coalesce(accepted_at,?) WHERE id=?').run(acceptedAt,Number(message.id));
  const table=message.kind==='marketing'?'email_queue':'transactional_outbox';
  db.prepare(`UPDATE ${table} SET status='sent',sent_at=coalesce(sent_at,?),last_error=NULL WHERE id=? AND (status='processing' OR status='failed' AND lower(coalesce(last_error,'')) LIKE '%uncertain%')`).run(acceptedAt,Number(message.job_id));
  if(message.kind==='marketing'){const job=db.prepare('SELECT campaign_id FROM email_queue WHERE id=?').get(Number(message.job_id));if(job)new CampaignStore(db).refresh(Number(job.campaign_id));}
  const terminal=['bounced','complained','unsubscribed'].includes(String(message.delivery_status));
  if(kind==='complained'||!terminal&&(kind==='bounced'||kind==='unsubscribed'||kind==='delivered'||message.delivery_status!=='delivered'&&occurred>=Number(message.status_at)))db.prepare('UPDATE email_delivery_messages SET delivery_status=?,status_at=? WHERE id=?').run(kind,occurred,Number(message.id));
  const contact=message.contact_id?db.prepare('SELECT id,status FROM contacts WHERE id=?').get(Number(message.contact_id)):null;
  if(contact&&['bounced','complained','unsubscribed'].includes(kind)){
   const old=String(contact.status),status=old==='suppressed'||old==='complained'?old:kind==='complained'?'complained':old==='bounced'?'bounced':kind==='bounced'?'bounced':'unsubscribed';
   db.prepare("UPDATE contacts SET status=?,unsubscribed_at=CASE WHEN ?='unsubscribed' THEN coalesce(unsubscribed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE unsubscribed_at END WHERE id=?").run(status,status,Number(contact.id));
   db.prepare("UPDATE email_queue SET status='cancelled',last_error='Provider feedback blocked further sending' WHERE contact_id=? AND status='pending'").run(Number(contact.id));
   db.prepare("UPDATE transactional_outbox SET status='cancelled' WHERE contact_id=? AND status='pending'").run(Number(contact.id));
   new AutomationStore(db).sync();
  }
  event(db,'email_provider_'+kind,{deliveryMessageId:Number(message.id)},contact?Number(contact.id):undefined);
  return{applied:true};
 });
}
