import {reserveEmailAllowance} from './limits.js';
import { renderConfirmation } from './confirmation.js';
import { frameEmail } from './branding.js';
import { escapeHtml } from '../marketing/newsletters.js';
import type { DatabaseSync } from 'node:sqlite';
import type { SettingsStore } from '../settings/store.js';
import { decryptSecret } from '../security/crypto.js';
import { sendTransactional,safeToRetrySmtp, type SmtpCredentials } from '../settings/email.js';
import { event,transaction } from '../db/helpers.js';
import { blockedStatuses } from '../contacts/store.js';

export type TransactionalSender=(settings:SmtpCredentials,recipient:string,subject:string,text:string,messageId:string,html?:string)=>Promise<void>;
export class TransactionalWorker {
  private running=false;
  private inFlight:Promise<void>|null=null;
  constructor(private db:DatabaseSync,private settings:SettingsStore,private key:string,private sender:TransactionalSender=sendTransactional){}
  async tick(){
    if(this.running)return;this.running=true;
    try{
      this.db.prepare('INSERT INTO worker_heartbeats(name,seen_at) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET seen_at=excluded.seen_at').run('transactional',Date.now());
      // SMTP acceptance may have preceded a crash. Do not silently resend ambiguous deliveries.
      this.db.prepare("UPDATE transactional_outbox SET status='failed',last_error='Delivery outcome uncertain after interruption; request a new link' WHERE status='processing' AND claimed_at<?").run(Date.now()-120000);
      const smtp=this.settings.smtpCredentials();if(!smtp.host||!smtp.fromEmail||(smtp.username&&!smtp.password))return;
      const job=transaction(this.db,()=>{
        const row=this.db.prepare("SELECT * FROM transactional_outbox WHERE status='pending' AND scheduled_at<=? ORDER BY scheduled_at,id LIMIT 1").get(Date.now());
        if(!row)return;
        if(!reserveEmailAllowance(this.db,smtp))return;
        this.db.prepare("UPDATE transactional_outbox SET status='processing',claimed_at=?,attempts=attempts+1 WHERE id=? AND status='pending'").run(Date.now(),Number(row.id));return row;
      });
      if(!job)return;
      const token=this.db.prepare('SELECT * FROM contact_tokens WHERE token_hash=?').get(String(job.token_hash));
      const contact=this.db.prepare('SELECT name,email,status FROM contacts WHERE id=?').get(Number(job.contact_id));
      const invalid=!contact||!token||blockedStatuses.includes(String(contact.status))||(token.expires_at&&Number(token.expires_at)<=Date.now())||(job.purpose==='confirmation'&&(token.consumed_at||(contact.status==='unsubscribed'&&!token.resubscribe)))||(job.purpose==='unsubscribe_link'&&contact.status==='unsubscribed');
      if(invalid){this.db.prepare("UPDATE transactional_outbox SET status='cancelled' WHERE id=?").run(Number(job.id));return;}
      try{
        const payload=JSON.parse(decryptSecret(String(job.payload),this.key,'contact-mail')) as {subject:string;text:string;html?:string};
        const currentSettings=this.settings.read();
        const url=payload.text.match(/https?:\/\/[^\s<>]+\/unsubscribe\/[a-f0-9]+/)?.[0]??currentSettings.domains.publicUrl+'/unsubscribe';
        const confirm=payload.text.match(/https?:\/\/[^\s<>]+\/confirm\/[a-f0-9]+/)?.[0];
        let subject=payload.subject,text=payload.text,html=payload.html;
        if(job.purpose==='confirmation'){
          if(!confirm)throw new Error('Confirmation URL missing');
          const submission=token.submission_id?this.db.prepare('SELECT name FROM lead_submissions WHERE id=?').get(Number(token.submission_id)):null;
          // System confirmations always use current copy, even when an old HTML snapshot was queued.
          // Keep the original link origin: promoted funnels can use their own verified domain.
          const rendered=renderConfirmation('', '',currentSettings,confirm,url,false,String(submission?.name||contact.name||'there'));
          subject=rendered.subject;text=rendered.text;html=rendered.html;
        }
        html??=frameEmail('<p>'+escapeHtml(text).replace(/\n/g,'<br>')+'</p>',currentSettings,url);
        await this.sender(smtp,String(contact.email),subject,text,`<transactional-${job.id}@${smtp.fromEmail.split('@')[1]}>`,html);
        const updated=this.db.prepare("UPDATE transactional_outbox SET status='sent',sent_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_error=NULL WHERE id=? AND status='processing'").run(Number(job.id));
        if(updated.changes)event(this.db,job.purpose==='confirmation'?'confirmation_sent':'unsubscribe_link_sent',{outboxId:Number(job.id)},Number(job.contact_id));
      }catch(error){
        const code=String((error as {code?:string})?.code??'DELIVERY_ERROR');
        const retryable=safeToRetrySmtp(error)&&Number(job.attempts)<2;
        const safeError=retryable?'SMTP connection failed; retry scheduled':code==='EAUTH'?'SMTP authentication failed':['ETIMEDOUT','ECONNECTION','ESOCKET'].includes(code)?'Delivery outcome uncertain after interruption; request a new link':'SMTP delivery failed; check saved configuration';
        this.db.prepare("UPDATE transactional_outbox SET status=?,scheduled_at=?,last_error=? WHERE id=? AND status='processing'").run(retryable?'pending':'failed',Date.now()+30000*(Number(job.attempts)+1),safeError,Number(job.id));event(this.db,'email_failed',{outboxId:Number(job.id),retryScheduled:retryable},Number(job.contact_id));
      }
    }finally{this.running=false;}
  }
  start(unref=true){const timer=setInterval(()=>{if(!this.running)this.inFlight=this.tick().catch(()=>console.error('Transactional worker failed; check system status')).finally(()=>{this.inFlight=null;});},1000);if(unref)timer.unref();return async()=>{clearInterval(timer);await this.inFlight;};}
}

