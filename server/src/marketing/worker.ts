import {senderReady} from '../mail/mailgun.js';
import {beginDelivery,acceptedDelivery} from '../mail/feedback.js';
import {reserveEmailAllowance} from '../mail/limits.js';
import type { DatabaseSync } from 'node:sqlite';
import type { SettingsStore } from '../settings/store.js';
import { sendMarketing,safeToRetrySmtp,type MarketingSender } from '../settings/email.js';
import { renderEmail,type Newsletter } from './newsletters.js';
import { CampaignStore } from './campaigns.js';
import { token,tokenHash } from '../security/crypto.js';
import { transaction,event } from '../db/helpers.js';
import { AutomationStore } from '../automations/store.js';

// One message every two seconds across workers, with durable atomic claims.
export class MarketingWorker {
  private running=false;private inFlight:Promise<void>|null=null;private campaigns:CampaignStore;
  constructor(private db:DatabaseSync,private settings:SettingsStore,private sender:MarketingSender=sendMarketing){this.campaigns=new CampaignStore(db);}
  async tick(now=Date.now()){
    if(this.running)return;this.running=true;
    try{
      this.db.prepare('INSERT INTO worker_heartbeats(name,seen_at) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET seen_at=excluded.seen_at').run('marketing',now);
      const interrupted=this.db.prepare("SELECT id,campaign_id FROM email_queue WHERE status='processing' AND claimed_at<?").all(now-120000);
      for(const job of interrupted){this.db.prepare("UPDATE email_queue SET status='failed',last_error='Delivery outcome uncertain after interruption; not automatically resent' WHERE id=? AND status='processing'").run(Number(job.id));event(this.db,'email_failed',{queueId:Number(job.id),campaignId:Number(job.campaign_id),uncertain:true});this.campaigns.refresh(Number(job.campaign_id));}
      if(this.settings.delivery().config().paused)return;
      transaction(this.db,()=>new AutomationStore(this.db).sync());
      this.campaigns.resolveDue(now);
      // Cancel blocked recipients even while the campaign is paused or SMTP is absent.
      this.db.prepare("UPDATE email_queue SET status='cancelled',last_error='Contact is not confirmed' WHERE status='pending' AND contact_id IN (SELECT id FROM contacts WHERE status!='confirmed')").run();
      for(const row of this.db.prepare("SELECT id FROM campaigns WHERE status='sending'").all())this.campaigns.refresh(Number(row.id));
      const smtp=this.settings.smtpCredentials();if(!senderReady(smtp))return;
      const job=transaction(this.db,()=>{
        // A separate throttle lease keeps multiple processes from increasing the configured pace.
        const last=this.db.prepare("SELECT seen_at FROM worker_heartbeats WHERE name='marketing_delivery'").get();if(last&&now-Number(last.seen_at)<2000)return;
        const row=this.db.prepare("SELECT q.*,c.snapshot,c.automation_enrollment_id,c.lead_submission_id FROM email_queue q JOIN campaigns c ON c.id=q.campaign_id JOIN contacts p ON p.id=q.contact_id WHERE q.status='pending' AND q.scheduled_at<=? AND c.status='sending' AND p.status='confirmed' ORDER BY q.scheduled_at,q.id LIMIT 1").get(now);if(!row)return;
        if(!reserveEmailAllowance(this.db,smtp,now))return;
        this.db.prepare("UPDATE email_queue SET status='processing',claimed_at=?,attempts=attempts+1 WHERE id=? AND status='pending'").run(now,Number(row.id));
        this.db.prepare("INSERT INTO worker_heartbeats(name,seen_at) VALUES('marketing_delivery',?) ON CONFLICT(name) DO UPDATE SET seen_at=excluded.seen_at").run(now);return row;
      });if(!job)return;
      try{
        const email=transaction(this.db,()=>{
          const contact=this.db.prepare('SELECT * FROM contacts WHERE id=?').get(Number(job.contact_id))!;
          if(contact.status!=='confirmed')return;
          const unsubscribe=token(),tracking=token(),settings=this.settings.read();let base=settings.domains.publicUrl.replace(/\/$/,'');
          this.db.prepare("INSERT INTO contact_tokens(token_hash,contact_id,purpose) VALUES(?,?,'unsubscribe')").run(tokenHash(unsubscribe),Number(job.contact_id));
          let resourceUrl='';
          if(job.automation_enrollment_id||job.lead_submission_id){const submission=job.lead_submission_id?this.db.prepare('SELECT id,page_snapshot FROM lead_submissions WHERE id=?').get(Number(job.lead_submission_id)):this.db.prepare('SELECT s.id,s.page_snapshot FROM automation_enrollments e JOIN lead_submissions s ON s.id=e.submission_id WHERE e.id=?').get(Number(job.automation_enrollment_id));const pageData=submission?.page_snapshot?JSON.parse(String(submission.page_snapshot)):null;if(pageData?.publicOrigin)base=pageData.publicOrigin.replace(/\/$/,'');const resourceId=pageData?.resourceId??null;if(resourceId){const raw=token();this.db.prepare('INSERT INTO download_tokens(token_hash,contact_id,submission_id,media_id,expires_at,page_snapshot) VALUES(?,?,?,?,?,?)').run(tokenHash(raw),Number(job.contact_id),Number(submission!.id),Number(resourceId),Date.now()+86400000,pageData.downloadPage?JSON.stringify(pageData.downloadPage):null);resourceUrl=`${base}/${pageData.downloadPage?'downloads':'download'}/${raw}`;}}
          const rendered=renderEmail(JSON.parse(String(job.snapshot)) as Newsletter,{...settings,domains:{publicUrl:base}},String(contact.name),`${base}/unsubscribe/${unsubscribe}`,{raw:tracking,opens:settings.tracking.opens,clicks:settings.tracking.emailClicks},resourceUrl);
          this.db.prepare('UPDATE email_queue SET tracking_token_hash=?,track_opens=?,track_clicks=?,subject=? WHERE id=?').run(tokenHash(tracking),settings.tracking.opens?1:0,settings.tracking.emailClicks?1:0,rendered.subject,Number(job.id));
          this.db.prepare('DELETE FROM email_links WHERE queue_id=?').run(Number(job.id));rendered.links.forEach((href,index)=>this.db.prepare('INSERT INTO email_links(queue_id,ordinal,destination) VALUES(?,?,?)').run(Number(job.id),index+1,href));return rendered;
        });
        if(!email){this.db.prepare("UPDATE email_queue SET status='cancelled' WHERE id=?").run(Number(job.id));return;}
        if(this.settings.delivery().config().paused){this.db.prepare("UPDATE email_queue SET status='pending',claimed_at=NULL WHERE id=? AND status='processing'").run(Number(job.id));return;}
        const messageId=`<campaign-${job.campaign_id}-contact-${job.contact_id}@${smtp.fromEmail.split('@')[1]}>`,deliveryId=beginDelivery(this.db,'marketing',Number(job.id),Number(job.contact_id),String(job.recipient),messageId,smtp.transport);
        const receipt=await this.sender(smtp,String(job.recipient),email,messageId);acceptedDelivery(this.db,deliveryId,receipt);
        this.db.prepare("UPDATE email_queue SET status='sent',sent_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_error=NULL WHERE id=? AND status='processing'").run(Number(job.id));event(this.db,'newsletter_sent',{queueId:Number(job.id),campaignId:Number(job.campaign_id),newsletterId:Number(job.newsletter_id)},Number(job.contact_id));
      }catch(error){
        if(this.db.prepare('SELECT status FROM email_queue WHERE id=?').get(Number(job.id))?.status==='sent')return;
        const code=String((error as {code?:string})?.code??''),retry=safeToRetrySmtp(error)&&Number(job.attempts)<2;
        const message=code==='EMAIL_API_UNCERTAIN'?'Email submission outcome uncertain; not automatically resent':code.startsWith('EMAIL_API_')?'Email API submission failed; review sender settings':retry?'SMTP connection failed; retry scheduled':code==='EAUTH'?'SMTP authentication failed':['ETIMEDOUT','ECONNECTION','ESOCKET'].includes(code)?'Delivery outcome uncertain after interruption; not automatically resent':'SMTP delivery failed; check saved configuration';
        this.db.prepare("UPDATE email_queue SET status=?,scheduled_at=?,last_error=? WHERE id=? AND status='processing'").run(retry?'pending':'failed',now+30000*(Number(job.attempts)+1),message,Number(job.id));event(this.db,'email_failed',{queueId:Number(job.id),campaignId:Number(job.campaign_id),retryScheduled:retry},Number(job.contact_id));
      }finally{this.campaigns.refresh(Number(job.campaign_id));transaction(this.db,()=>new AutomationStore(this.db).sync());}
    }finally{this.running=false;}
  }
  start(unref=true){const timer=setInterval(()=>{if(!this.running)this.inFlight=this.tick().catch(()=>console.error('Marketing worker failed; check system status')).finally(()=>{this.inFlight=null;});},1000);if(unref)timer.unref();return async()=>{clearInterval(timer);await this.inFlight;};}
}
