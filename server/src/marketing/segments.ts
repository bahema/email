import { z } from 'zod';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { HttpError } from '../http.js';

export const ruleSchema = z.object({
  field: z.enum(['status','country','continent','source_type','source_id','tag','created_at','confirmed_at','opened_within','clicked_within','campaign_opened','campaign_clicked']),
  operator: z.enum(['eq','neq','in','before','after','within']), value: z.string().trim().min(1).max(200),
}).strict().superRefine((rule,ctx)=>{
  const date=['created_at','confirmed_at'].includes(rule.field),within=['opened_within','clicked_within'].includes(rule.field),interaction=rule.field.startsWith('campaign_');
  const allowed=date?['before','after']:within?['within']:['country','continent'].includes(rule.field)?['eq','neq','in']:['eq','neq'];
  if(rule.operator==='in'){const values=rule.value.split('|');if(values.length>60||values.some(v=>!v.trim()))ctx.addIssue({code:'custom',message:'Choose 1–60 geographic values'});}
  if(!allowed.includes(rule.operator))ctx.addIssue({code:'custom',message:'Operator does not apply to this field'});
  if(date&&!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(rule.value))ctx.addIssue({code:'custom',message:'Use an ISO UTC date'});
  if(date&&!Number.isFinite(Date.parse(rule.value)))ctx.addIssue({code:'custom',message:'Invalid date'});
  if((within||interaction)&&(!/^\d+$/.test(rule.value)||Number(rule.value)<1||Number(rule.value)>(within?3650:2147483647)))ctx.addIssue({code:'custom',message:'Use a positive whole number in range'});
});
export const segmentSchema=z.object({name:z.string().trim().min(1).max(120),mode:z.enum(['and','or']),rules:z.array(ruleSchema).min(1).max(20)}).strict();
export type SegmentInput=z.infer<typeof segmentSchema>;
export class SegmentStore {
  constructor(private db:DatabaseSync){}
  list(){return this.db.prepare('SELECT * FROM segments ORDER BY updated_at DESC,id DESC').all().map(row=>({...row,id:Number(row.id),name:String(row.name),mode:row.mode as SegmentInput['mode'],rules:JSON.parse(String(row.rules)) as SegmentInput['rules']}));}
  get(id:number):SegmentInput&{id:number}{const row=this.db.prepare('SELECT * FROM segments WHERE id=?').get(id);if(!row)throw new HttpError(404,'NOT_FOUND','Segment not found');return{id,...segmentSchema.parse({name:row.name,mode:row.mode,rules:JSON.parse(String(row.rules))})};}
  save(input:unknown,id?:number){const data=segmentSchema.parse(input);if(id){this.get(id);this.db.prepare("UPDATE segments SET name=?,mode=?,rules=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(data.name,data.mode,JSON.stringify(data.rules),id);}else id=Number(this.db.prepare('INSERT INTO segments(name,mode,rules) VALUES(?,?,?)').run(data.name,data.mode,JSON.stringify(data.rules)).lastInsertRowid);return this.get(id);}
  compile(input:unknown,now=Date.now()){
    const data=segmentSchema.parse(input),values:SQLInputValue[]=[];
    const parts=data.rules.map(rule=>{
      const neg=rule.operator==='neq';
      if(rule.operator==='in'){const choices=rule.value.split('|').map(v=>v.trim());values.push(...choices);return `c.${rule.field} IN (${choices.map(()=>'?').join(',')})`;}
      if(rule.field==='tag'){values.push(rule.value.toLowerCase());return `${neg?'NOT ':''}EXISTS(SELECT 1 FROM contact_tags ct JOIN tags t ON t.id=ct.tag_id WHERE ct.contact_id=c.id AND t.name=?)`;}
      if(rule.field==='opened_within'||rule.field==='clicked_within'){values.push(new Date(now-Number(rule.value)*86400000).toISOString());return `c.${rule.field==='opened_within'?'last_open_at':'last_click_at'} >= ?`;}
      if(rule.field==='campaign_opened'||rule.field==='campaign_clicked'){values.push(Number(rule.value));return `${neg?'NOT ':''}EXISTS(SELECT 1 FROM email_queue q WHERE q.contact_id=c.id AND q.campaign_id=? AND q.${rule.field==='campaign_opened'?'opened_at':'clicked_at'} IS NOT NULL)`;}
      // Field and operator identifiers are exclusively from the validated allowlist.
      const op=rule.operator==='before'?'<':rule.operator==='after'?'>=':neg?'!=':'=';
      values.push(['created_at','confirmed_at'].includes(rule.field)?new Date(rule.value).toISOString():rule.value);
      return `c.${rule.field} ${op} ?`;
    });return{sql:`(${parts.join(data.mode==='and'?' AND ':' OR ')})`,values};
  }
  duplicate(id:number){const s=this.get(id);return this.save({name:(s.name+' copy').slice(0,120),mode:s.mode,rules:s.rules});}
  connections(id:number){this.get(id);return{campaigns:this.db.prepare("SELECT id,name,status,(snapshot IS NOT NULL) frozen FROM campaigns WHERE json_extract(audience,'$.segmentId')=? ORDER BY id DESC").all(id),schedules:this.db.prepare("SELECT id,name,status FROM recurring_campaigns WHERE json_extract(audience,'$.segmentId')=? ORDER BY id DESC").all(id)};}
  preview(input:unknown,options:{page?:number;view?:'all'|'eligible'|'excluded'}={}){const {sql,values}=this.compile(input),page=options.page??1,view=options.view??'all',extra=view==='eligible'?" AND c.status='confirmed'":view==='excluded'?" AND c.status!='confirmed'":'';return{page,pageSize:25,total:Number(this.db.prepare(`SELECT count(*) n FROM contacts c WHERE ${sql}${extra}`).get(...values)!.n),matched:Number(this.db.prepare(`SELECT count(*) n FROM contacts c WHERE ${sql}`).get(...values)!.n),eligible:Number(this.db.prepare(`SELECT count(*) n FROM contacts c WHERE c.status='confirmed' AND ${sql}`).get(...values)!.n),contacts:this.db.prepare(`SELECT c.id,c.name,c.email,c.status,c.country,c.continent FROM contacts c WHERE ${sql}${extra} ORDER BY c.id LIMIT 25 OFFSET ?`).all(...values,(page-1)*25)};}
}
