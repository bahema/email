import { resolveTxt } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { HttpError } from '../http.js';
export const hostSchema=z.string().trim().toLowerCase().max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,'Enter a domain name without scheme, port or path');
export class FunnelDomains{
 constructor(private db:DatabaseSync){}
 list(){return this.db.prepare('SELECT * FROM funnel_domains ORDER BY id DESC').all();}
 create(input:unknown){const d=z.object({host:hostSchema,pageId:z.number().int().positive()}).strict().parse(input);if(!this.db.prepare('SELECT id FROM lead_pages WHERE id=?').get(d.pageId))throw new HttpError(404,'NOT_FOUND','Save the funnel first');if(this.db.prepare('SELECT id FROM funnel_domains WHERE host=?').get(d.host))throw new HttpError(409,'DOMAIN_EXISTS','This host is already registered');const id=Number(this.db.prepare('INSERT INTO funnel_domains(host,challenge,page_id) VALUES(?,?,?)').run(d.host,randomBytes(24).toString('hex'),d.pageId).lastInsertRowid);return this.list().find(d=>Number(d.id)===id);}
 async verify(id:number,lookup:(host:string)=>Promise<string[][]>=resolveTxt){const row=this.db.prepare('SELECT * FROM funnel_domains WHERE id=?').get(id);if(!row)throw new HttpError(404,'NOT_FOUND','Domain not found');let records:string[][];try{records=await lookup('_affiliate-funnel.'+String(row.host));}catch{throw new HttpError(400,'DNS_PENDING','TXT ownership record is not visible yet. Check the record and try again.');}if(!records.some(r=>r.join('')==='affiliate-funnel='+row.challenge))throw new HttpError(400,'DNS_PENDING','Ownership TXT value does not match');this.db.prepare("UPDATE funnel_domains SET verified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id);return this.list().find(d=>Number(d.id)===id);}
 remove(id:number){this.db.prepare('DELETE FROM funnel_domains WHERE id=?').run(id);return{message:'Domain mapping removed. DNS records at your provider are unchanged.'};}
 resolve(host:string){const row=this.db.prepare("SELECT p.slug,d.host FROM funnel_domains d JOIN lead_pages p ON p.id=d.page_id WHERE d.host=? AND d.verified_at IS NOT NULL AND p.status='active'").get(host.toLowerCase());return row?{slug:String(row.slug),host:String(row.host)}:null;}
}
