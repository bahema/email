import { recurrenceSchema,nextRun } from './recurrence.js';
import { z } from 'zod';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { Campaign } from '@affiliate/shared';
import { SegmentStore,segmentSchema } from './segments.js';
import { NewsletterStore } from './newsletters.js';
import { HttpError } from '../http.js';
import { transaction,event } from '../db/helpers.js';

export const audienceSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('all')}).strict(),
  z.object({type:z.literal('continents'),continents:z.array(z.enum(['Africa','Asia','Europe','North America','South America','Oceania'])).min(1).max(6).refine(v=>new Set(v).size===v.length,'Choose each continent once')}).strict(),
  z.object({type:z.literal('segment'),segmentId:z.number().int().positive()}).strict(),
  z.object({type:z.literal('contacts'),contactIds:z.array(z.number().int().positive()).min(1).max(1000).refine(ids=>new Set(ids).size===ids.length,'Remove duplicate IDs')}).strict(),
]);
const savedAudienceSchema=z.union([audienceSchema,z.object({type:z.literal('segment'),segmentId:z.number().int().positive(),segment:segmentSchema}).strict()]);
export const campaignSchema=z.object({name:z.string().trim().min(1).max(120),newsletterId:z.number().int().positive(),audience:audienceSchema}).strict();
export class CampaignStore {
  private segments:SegmentStore;private newsletters:NewsletterStore;
  constructor(private db:DatabaseSync){this.segments=new SegmentStore(db);this.newsletters=new NewsletterStore(db);}
  get(id:number):Campaign&{snapshot:string|null;archived_at?:string|null}{const row=this.db.prepare('SELECT * FROM campaigns WHERE id=?').get(id);if(!row)throw new HttpError(404,'NOT_FOUND','Campaign not found');return{...(row as unknown as Campaign),id:Number(row.id),snapshot:row.snapshot as string|null,audience:JSON.parse(String(row.audience)),counts:this.counts(id)};}
  counts(id:number){return this.db.prepare('SELECT status,count(*) count FROM email_queue WHERE campaign_id=? GROUP BY status').all(id).map(row=>({status:String(row.status),count:Number(row.count)}));}
  list(){return this.db.prepare('SELECT id FROM campaigns WHERE id IN (SELECT id FROM campaigns WHERE archived_at IS NULL AND automation_enrollment_id IS NULL AND lead_submission_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 200) OR id IN (SELECT id FROM campaigns WHERE archived_at IS NULL AND lead_submission_id IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 200) ORDER BY created_at DESC,id DESC').all().map(row=>{const {snapshot,...campaign}=this.get(Number(row.id));return campaign;});}
  save(input:unknown,id?:number){const data=campaignSchema.parse(input);if(this.newsletters.get(data.newsletterId).archived_at)throw new HttpError(409,'ARCHIVED_EMAIL','Choose an email still in the saved library');if(data.audience.type==='segment')this.segments.get(data.audience.segmentId);
    if(id){if(this.get(id).archived_at||this.get(id).status!=='draft')throw new HttpError(409,'CAMPAIGN_LOCKED','Only drafts can be edited');this.db.prepare("UPDATE campaigns SET name=?,newsletter_id=?,audience=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(data.name,data.newsletterId,JSON.stringify(data.audience),id);}else id=Number(this.db.prepare('INSERT INTO campaigns(name,newsletter_id,audience) VALUES(?,?,?)').run(data.name,data.newsletterId,JSON.stringify(data.audience)).lastInsertRowid);return this.get(id);
  }
  audienceQuery(input:unknown){const audience=savedAudienceSchema.parse(input);let sql="c.status='confirmed'",values:SQLInputValue[]=[];
    if(audience.type==='segment'){const segment='segment' in audience?audience.segment:this.segments.get(audience.segmentId);const compiled=this.segments.compile(segmentSchema.parse({name:segment.name,mode:segment.mode,rules:segment.rules}));sql+=` AND ${compiled.sql}`;values=compiled.values;}
    if(audience.type==='continents'){sql+=` AND c.continent IN (${audience.continents.map(()=>'?').join(',')})`;values=audience.continents;}
    if(audience.type==='contacts'){sql+=` AND c.id IN (${audience.contactIds.map(()=>'?').join(',')})`;values=audience.contactIds;}
    return{sql,values};
  }
  preview(input:unknown){const {sql,values}=this.audienceQuery(input);return{eligible:Number(this.db.prepare(`SELECT count(*) n FROM contacts c WHERE ${sql}`).get(...values)!.n),contacts:this.db.prepare(`SELECT c.id,c.name,c.email,c.country,c.continent FROM contacts c WHERE ${sql} ORDER BY c.id LIMIT 25`).all(...values)};}
  launch(id:number,scheduledAt:number){return transaction(this.db,()=>this.freeze(id,scheduledAt));}
  private freeze(id:number,scheduledAt:number){
    const campaign=this.get(id);if(campaign.archived_at||campaign.status!=='draft')throw new HttpError(409,'CAMPAIGN_LOCKED','This campaign has already been launched');
    const newsletter=this.newsletters.get(Number(campaign.newsletter_id));if(newsletter.status!=='ready')throw new HttpError(400,'NEWSLETTER_NOT_READY','Mark the newsletter ready before launching');
    if(newsletter.html.includes('{downloadUrl}')&&!campaign.lead_submission_id&&!this.db.prepare('SELECT automation_enrollment_id FROM campaigns WHERE id=?').get(id)?.automation_enrollment_id)throw new HttpError(400,'FUNNEL_EMAIL_ONLY','Protected download emails must be sent through their confirmed lead-page journey');
    let audience:z.infer<typeof savedAudienceSchema>=savedAudienceSchema.parse(campaign.audience);if(audience.type==='segment'){const segment=this.segments.get(audience.segmentId);audience={...audience,segment:{name:segment.name,mode:segment.mode,rules:segment.rules}};}
    this.db.prepare("UPDATE campaigns SET status='scheduled',scheduled_at=?,snapshot=?,audience=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(scheduledAt,JSON.stringify(newsletter),JSON.stringify(audience),id);
    // Freeze media references until the campaign is removed (no destructive removal in V1).
    this.db.prepare('INSERT OR IGNORE INTO media_usage(media_id,owner_key) SELECT media_id,? FROM media_usage WHERE owner_key=?').run(`campaign:${id}`,`newsletter:${newsletter.id}`);
    event(this.db,'campaign_scheduled',{campaignId:id,scheduledAt});return this.get(id);
  }
  resolveDue(now:number){
    this.resolveRecurring(now);
    const due=this.db.prepare("SELECT id FROM campaigns WHERE status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at,id LIMIT 5").all(now);
    for(const row of due)transaction(this.db,()=>{
      const campaign=this.get(Number(row.id));if(campaign.status!=='scheduled')return;
      const {sql,values}=this.audienceQuery(campaign.audience),snapshot=JSON.parse(String(campaign.snapshot));
      this.db.prepare(`INSERT OR IGNORE INTO email_queue(campaign_id,contact_id,newsletter_id,recipient,subject,scheduled_at) SELECT ?,c.id,?,c.email,?,? FROM contacts c WHERE ${sql}`).run(Number(row.id),Number(campaign.newsletter_id),String(snapshot.subject),now,...values);
      // Step actions run once when a due step resolves, inside its queue transaction.
      const tags=JSON.parse(String(this.db.prepare('SELECT automation_tags FROM campaigns WHERE id=?').get(Number(row.id))!.automation_tags)) as string[];
      for(const name of tags){this.db.prepare('INSERT INTO tags(name) VALUES(?) ON CONFLICT(name) DO NOTHING').run(name);this.db.prepare('INSERT OR IGNORE INTO contact_tags(contact_id,tag_id) SELECT contact_id,(SELECT id FROM tags WHERE name=?) FROM email_queue WHERE campaign_id=?').run(name,Number(row.id));}
      this.db.prepare("UPDATE campaigns SET status='sending',resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(Number(row.id));event(this.db,'campaign_started',{campaignId:Number(row.id)});this.refresh(Number(row.id));
    });
  }
  refresh(id:number){const pending=this.db.prepare("SELECT count(*) n FROM email_queue WHERE campaign_id=? AND status IN ('pending','processing')").get(id)!;
    if(Number(pending.n))return;
    const failures=Number(this.db.prepare("SELECT count(*) n FROM email_queue WHERE campaign_id=? AND status='failed'").get(id)!.n);
    this.db.prepare("UPDATE campaigns SET status=?,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='sending'").run(failures?'failed':'sent',id);
  }
  control(id:number,action:'pause'|'resume'|'cancel'){return transaction(this.db,()=>{
    const campaign=this.get(id),status=String(campaign.status);
    if(action==='pause'){if(!['scheduled','sending'].includes(status))throw new HttpError(409,'INVALID_STATE','Only scheduled or sending campaigns can be paused');this.db.prepare("UPDATE campaigns SET status='paused' WHERE id=?").run(id);}
    if(action==='resume'){if(status!=='paused')throw new HttpError(409,'INVALID_STATE','Only paused campaigns can resume');this.db.prepare('UPDATE campaigns SET status=? WHERE id=?').run(campaign.resolved_at?'sending':'scheduled',id);this.refresh(id);}
    if(action==='cancel'){if(!['draft','scheduled','sending','paused'].includes(status))throw new HttpError(409,'INVALID_STATE','Campaign is already finished');this.db.prepare("UPDATE campaigns SET status='cancelled' WHERE id=?").run(id);this.db.prepare("UPDATE email_queue SET status='cancelled' WHERE campaign_id=? AND status='pending'").run(id);}
    event(this.db,`campaign_${action}`,{campaignId:id});return this.get(id);
  });}
  recurring(){return this.db.prepare('SELECT r.*,n.title newsletter_title,(SELECT count(*) FROM recurring_occurrences o WHERE o.schedule_id=r.id) occurrences FROM recurring_campaigns r JOIN newsletters n ON n.id=r.newsletter_id ORDER BY r.id DESC').all().map(r=>({...r,id:Number(r.id),audience:JSON.parse(String(r.audience))}));}
  saveRecurring(input:unknown,now=Date.now()){const d=recurrenceSchema.parse(input),audience=audienceSchema.parse(d.audience);this.audienceQuery(audience);if(this.newsletters.get(d.newsletterId).status!=='ready')throw new HttpError(400,'NEWSLETTER_NOT_READY','Choose a ready email');const next=nextRun(d.startDate,d.localTime,d.timezone,d.interval,now);const id=Number(this.db.prepare('INSERT INTO recurring_campaigns(name,newsletter_id,audience,interval,timezone,local_time,anchor_date,next_run) VALUES(?,?,?,?,?,?,?,?)').run(d.name,d.newsletterId,JSON.stringify(audience),d.interval,d.timezone,d.localTime,d.startDate,next).lastInsertRowid);event(this.db,'recurring_created',{scheduleId:id});return this.recurring().find(r=>Number(r.id)===id);}
  controlRecurring(id:number,status:'running'|'paused',now=Date.now()){const r=this.db.prepare('SELECT * FROM recurring_campaigns WHERE id=?').get(id);if(!r)throw new HttpError(404,'NOT_FOUND','Recurring schedule not found');if(status==='running'){if(this.newsletters.get(Number(r.newsletter_id)).status!=='ready')throw new HttpError(400,'NEWSLETTER_NOT_READY','Mark the email ready first');this.audienceQuery(JSON.parse(String(r.audience)));}const next=status==='running'?nextRun(String(r.anchor_date),String(r.local_time),String(r.timezone),r.interval as 'daily'|'weekly',now):Number(r.next_run);this.db.prepare('UPDATE recurring_campaigns SET status=?,next_run=?,last_error=NULL WHERE id=?').run(status,next,id);event(this.db,'recurring_'+status,{scheduleId:id});return this.recurring().find(r=>Number(r.id)===id);}
  resolveRecurring(now:number){for(const row of this.db.prepare("SELECT * FROM recurring_campaigns WHERE status='running' AND next_run<=? ORDER BY next_run,id LIMIT 5").all(now)){try{transaction(this.db,()=>{const r=this.db.prepare("SELECT * FROM recurring_campaigns WHERE id=? AND status='running' AND next_run<=?").get(Number(row.id),now);if(!r)return;const due=Number(r.next_run);if(!this.db.prepare('SELECT campaign_id FROM recurring_occurrences WHERE schedule_id=? AND due_at=?').get(Number(r.id),due)){const c=this.save({name:String(r.name)+' · '+new Date(due).toISOString().slice(0,10),newsletterId:Number(r.newsletter_id),audience:JSON.parse(String(r.audience))});this.freeze(c.id,due);this.db.prepare('INSERT INTO recurring_occurrences(schedule_id,due_at,campaign_id) VALUES(?,?,?)').run(Number(r.id),due,c.id);}this.db.prepare('UPDATE recurring_campaigns SET next_run=?,last_error=NULL WHERE id=?').run(nextRun(String(r.anchor_date),String(r.local_time),String(r.timezone),r.interval as 'daily'|'weekly',now),Number(r.id));});}catch{this.db.prepare("UPDATE recurring_campaigns SET status='paused',last_error='Schedule paused: check the ready email and audience before resuming.' WHERE id=?").run(Number(row.id));event(this.db,'recurring_blocked',{scheduleId:Number(row.id)});}}}
  occurrenceHistory(id:number){return this.db.prepare('SELECT o.due_at,c.id,c.name,c.status FROM recurring_occurrences o JOIN campaigns c ON c.id=o.campaign_id WHERE o.schedule_id=? ORDER BY o.due_at DESC LIMIT 50').all(id);}
  duplicate(id:number){const c=this.get(id);if(c.lead_submission_id||this.db.prepare('SELECT automation_enrollment_id FROM campaigns WHERE id=?').get(id)?.automation_enrollment_id)throw new HttpError(409,'MANAGED_EMAIL','Duplicate audience campaigns only');const audience=audienceSchema.parse(c.audience.type==='segment'?{type:'segment',segmentId:c.audience.segmentId}:c.audience);return this.save({name:c.name.slice(0,110)+' (copy)',newsletterId:c.newsletter_id,audience});}
  history(workspace:'newsletter'|'campaign',page=1,search='',status=''){
    const where=`c.archived_at IS NULL AND c.automation_enrollment_id IS NULL AND c.lead_submission_id IS NULL AND n.workspace=? AND (c.name LIKE ? OR COALESCE(json_extract(c.snapshot,'$.subject'),n.subject) LIKE ?) AND (?='' OR c.status=?)`;
    const args=[workspace,`%${search}%`,`%${search}%`,status,status];
    return{items:this.db.prepare(`SELECT c.id,c.name,c.status,c.created_at,c.completed_at,COALESCE(json_extract(c.snapshot,'$.subject'),n.subject) subject,(SELECT count(*) FROM email_queue q WHERE q.campaign_id=c.id AND q.status='sent') sent_count FROM campaigns c JOIN newsletters n ON n.id=c.newsletter_id WHERE ${where} ORDER BY c.id DESC LIMIT 25 OFFSET ?`).all(...args,(page-1)*25),total:Number(this.db.prepare(`SELECT count(*) n FROM campaigns c JOIN newsletters n ON n.id=c.newsletter_id WHERE ${where}`).get(...args)?.n),page,pageSize:25};
  }
  archive(id:number){const c=this.get(id);if(c.lead_submission_id||this.db.prepare('SELECT automation_enrollment_id FROM campaigns WHERE id=?').get(id)?.automation_enrollment_id)throw new HttpError(409,'MANAGED_EMAIL','Use the lead-page or sequence controls for this send');if(!['draft','sent','failed','cancelled'].includes(c.status)||this.db.prepare("SELECT id FROM email_queue WHERE campaign_id=? AND status IN ('pending','processing') LIMIT 1").get(id))throw new HttpError(409,'ACTIVE_SEND','Cancel the campaign and wait for delivery to stop before deleting it');this.db.prepare("UPDATE campaigns SET archived_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id);event(this.db,'campaign_archived',{campaignId:id});}
  reuseEmail(id:number,workspace:'newsletter'|'campaign'){const c=this.get(id);if(c.lead_submission_id||this.db.prepare('SELECT automation_enrollment_id FROM campaigns WHERE id=?').get(id)?.automation_enrollment_id)throw new HttpError(409,'MANAGED_EMAIL','Use the connected email for this managed send');const n=c.snapshot?JSON.parse(c.snapshot):this.newsletters.get(c.newsletter_id);return this.newsletters.save({title:String(n.title).slice(0,110)+' (copy)',subject:n.subject,preheader:n.preheader,html:n.html,status:'draft',workspace});}
  deliveries(id:number,page=1){this.get(id);return{total:Number(this.db.prepare('SELECT count(*) n FROM email_queue WHERE campaign_id=?').get(id)!.n),jobs:this.db.prepare('SELECT id,recipient,subject,status,attempts,scheduled_at,sent_at,last_error,opened_at,clicked_at FROM email_queue WHERE campaign_id=? ORDER BY id DESC LIMIT 50 OFFSET ?').all(id,(page-1)*50)};}
}
