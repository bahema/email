import { emailAssetUrl,frameEmail } from '../mail/branding.js';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { SettingsResponse } from '@affiliate/shared';
import { HttpError } from '../http.js';
import { transaction } from '../db/helpers.js';

export const newsletterSchema=z.object({title:z.string().trim().min(1).max(120),subject:z.string().trim().min(1).max(200).refine(v=>!/[\r\n]/.test(v),'Subject must be one line'),preheader:z.string().trim().max(300).default(''),html:z.string().min(1).max(75000),status:z.enum(['draft','ready']).default('draft'),workspace:z.enum(['newsletter','campaign']).optional()}).strict();
export type Newsletter=z.infer<typeof newsletterSchema>&{id:number;archived_at?:string|null};
export const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function safeEmailUrl(value:string){
  if(value==='{unsubscribeUrl}'||value==='{downloadUrl}')return true;
  if(/^\/(?!\/)[^\\\s]*$/.test(value))return true;
  try{const url=new URL(value);return ['http:','https:','mailto:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}
}
const color=/^(#[0-9a-f]{3,8}|[a-z]{1,20}|rgb\([\d ,]+\))$/i;
export const emailTags=['p','br','div','span','h1','h2','h3','h4','strong','b','em','i','u','s','a','img','ul','ol','li','blockquote','hr','table','tbody','thead','tr','td','th'];
export const emailAttributes={'*':['style','align'],a:['href','title'],img:['src','alt','width','height'],table:['width','cellpadding','cellspacing','border','role'],td:['width','colspan','rowspan'],th:['width','colspan','rowspan']};
export function cleanEmailHtml(html:string){
  return sanitizeHtml(html,{
    allowedTags:emailTags,
    allowedAttributes:emailAttributes,
    allowedSchemes:['http','https','mailto'],allowProtocolRelative:false,
    allowedStyles:{'*':{'color':[color],'background-color':[color],'font-size':[/^\d{1,3}(px|pt|%)$/],'font-family':[/^[a-z ,'-]{1,100}$/i],'font-weight':[/^(normal|bold|[1-9]00)$/],'font-style':[/^(normal|italic)$/],'text-align':[/^(left|right|center|justify)$/],'text-decoration':[/^(none|underline|line-through)$/],'line-height':[/^[\d.]{1,5}(px|%|)?$/],'padding':[/^[\d px%]{1,40}$/],'margin':[/^[\d px%]{1,40}$/],'border':[/^\d{1,2}px solid #[a-f0-9]{3,8}$/i],'border-radius':[/^\d{1,2}px$/],'width':[/^\d{1,4}(px|%)$/],'max-width':[/^\d{1,4}(px|%)$/]}},
    transformTags:{a:(tag,attrs)=>({tagName:tag,attribs:{...attrs,href:attrs.href&&safeEmailUrl(attrs.href)?attrs.href:''}}),img:(tag,attrs)=>({tagName:tag,attribs:{...attrs,src:attrs.src&&safeEmailUrl(attrs.src)&&!attrs.src.startsWith('mailto:')&&attrs.src!=='{unsubscribeUrl}'?attrs.src:''}})},
  });
}
export class NewsletterStore {
  constructor(private db:DatabaseSync){}
  list(workspace?:'newsletter'|'campaign'){return this.db.prepare('SELECT id,title,subject,preheader,status,workspace,created_at,updated_at FROM newsletters WHERE archived_at IS NULL AND (? IS NULL OR workspace=?) ORDER BY updated_at DESC,id DESC').all(workspace??null,workspace??null);}
  library(workspace:'newsletter'|'campaign',page=1,search=''){
    const args=[workspace,`%${search}%`,`%${search}%`],where='n.archived_at IS NULL AND n.workspace=? AND (n.title LIKE ? OR n.subject LIKE ?)';
    return{items:this.db.prepare(`SELECT n.id,n.title,n.subject,n.preheader,n.status,n.workspace,n.updated_at,(SELECT count(*) FROM email_queue q WHERE q.newsletter_id=n.id AND q.status='sent') sent_count,(SELECT max(sent_at) FROM email_queue q WHERE q.newsletter_id=n.id AND q.status='sent') last_sent_at FROM newsletters n WHERE ${where} ORDER BY n.updated_at DESC,n.id DESC LIMIT 25 OFFSET ?`).all(...args,(page-1)*25),total:Number(this.db.prepare(`SELECT count(*) n FROM newsletters n WHERE ${where}`).get(...args)?.n),page,pageSize:25};
  }
  get(id:number):Newsletter{const row=this.db.prepare('SELECT * FROM newsletters WHERE id=?').get(id);if(!row)throw new HttpError(404,'NOT_FOUND','Newsletter not found');return row as unknown as Newsletter;}
  save(input:unknown,id?:number){const data=newsletterSchema.parse(input);if(id&&(this.get(id) as Newsletter&{archived_at?:string}).archived_at)throw new HttpError(409,'ARCHIVED_EMAIL','This email was deleted from the library');data.html=cleanEmailHtml(data.html);if(!data.html.trim())throw new HttpError(400,'EMPTY_EMAIL','Add email content');
    if(id&&this.db.prepare("SELECT id FROM lead_pages WHERE (json_extract(data,'$.directNewsletterId')=? AND json_extract(data,'$.downloadPageId') IS NOT NULL) OR (json_extract(published_snapshot,'$.data.directNewsletterId')=? AND json_extract(published_snapshot,'$.data.downloadPageId') IS NOT NULL) LIMIT 1").get(id,id)&&!data.html.includes('{downloadUrl}'))throw new HttpError(409,'DOWNLOAD_LINK_REQUIRED','This email delivers a protected resource. Keep its download button or disconnect the download page first');
    if(id&&data.status==='draft'&&this.pageUses(id))throw new HttpError(409,'IN_USE','A lead page uses this email; disconnect it before marking it draft');
    if(id&&data.status==='draft'&&this.db.prepare('SELECT id FROM automation_steps WHERE newsletter_id=? LIMIT 1').get(id))throw new HttpError(409,'IN_USE','Remove this newsletter from automations before marking it draft');
    transaction(this.db,()=>{
      if(id){this.get(id);this.db.prepare("UPDATE newsletters SET title=?,subject=?,preheader=?,html=?,status=?,workspace=COALESCE(?,workspace),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(data.title,data.subject,data.preheader,data.html,data.status,data.workspace??null,id);}else id=Number(this.db.prepare('INSERT INTO newsletters(title,subject,preheader,html,status,workspace) VALUES(?,?,?,?,?,?)').run(data.title,data.subject,data.preheader,data.html,data.status,data.workspace??'newsletter').lastInsertRowid);
      this.db.prepare('DELETE FROM media_usage WHERE owner_key=?').run(`newsletter:${id}`);
      if(/(?:src|href)=["'][^"']*\/api\/admin\/media\//i.test(data.html))throw new HttpError(400,'PRIVATE_MEDIA','Use a public image from Media library; admin/private file URLs cannot be used in emails');
    // Keep uploaded assets referenced by reusable newsletters from being deleted.
      const ids=new Set([...data.html.matchAll(/(?:src|href)="(?:https?:\/\/[^/"]+)?\/media\/(\d+)(?:[?][^"]*)?"/g)].map(match=>Number(match[1])));
      for(const mediaId of ids){const asset=this.db.prepare('SELECT visibility FROM media WHERE id=?').get(mediaId);if(!asset||asset.visibility!=='public')throw new HttpError(400,'PRIVATE_MEDIA','Newsletter assets must exist and be public');this.db.prepare('INSERT INTO media_usage(media_id,owner_key) VALUES(?,?)').run(mediaId,`newsletter:${id}`);}
    });return this.get(id!);
  }
  duplicate(id:number){const source=this.get(id);return this.save({title:`${source.title.slice(0,110)} (copy)`,subject:source.subject,preheader:source.preheader,html:source.html,status:'draft',workspace:source.workspace});}
  private pageUses(id:number){return this.db.prepare("SELECT id FROM lead_pages WHERE json_extract(data,'$.directNewsletterId')=? OR json_extract(published_snapshot,'$.data.directNewsletterId')=? LIMIT 1").get(id,id);}
  remove(id:number){this.get(id);if(this.db.prepare('SELECT id FROM recurring_campaigns WHERE newsletter_id=? LIMIT 1').get(id))throw new HttpError(409,'IN_USE','A recurring schedule uses this newsletter');if(this.pageUses(id)||this.db.prepare("SELECT id FROM lead_submissions WHERE json_extract(page_snapshot,'$.directEmail.id')=? LIMIT 1").get(id))throw new HttpError(409,'IN_USE','A lead page or acquired contact uses this email');if(this.db.prepare('SELECT id FROM automation_steps WHERE newsletter_id=? LIMIT 1').get(id))throw new HttpError(409,'IN_USE','An automation uses this newsletter');if(this.db.prepare("SELECT id FROM campaigns WHERE newsletter_id=? AND archived_at IS NULL AND status NOT IN ('sent','failed','cancelled') LIMIT 1").get(id))throw new HttpError(409,'IN_USE','An active or draft campaign uses this email. Cancel it or choose another email first');if(this.db.prepare('SELECT id FROM campaigns WHERE newsletter_id=? LIMIT 1').get(id)){this.db.prepare("UPDATE newsletters SET archived_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id);return;}transaction(this.db,()=>{this.db.prepare('DELETE FROM media_usage WHERE owner_key=?').run(`newsletter:${id}`);this.db.prepare('DELETE FROM newsletters WHERE id=?').run(id);});}
}
export interface RenderedEmail{subject:string;html:string;text:string;unsubscribeUrl:string;links:string[];}
export function renderEmail(newsletter:Newsletter,settings:SettingsResponse,name:string,unsubscribeUrl:string,tracking?:{raw:string;opens:boolean;clicks:boolean},resourceUrl=''):RenderedEmail{
  const base=settings.domains.publicUrl.replace(/\/$/,''),links:string[]=[],textLinks:string[]=[];
  let html=cleanEmailHtml(newsletter.html.replace(/\{name\}/g,()=>escapeHtml(name)).replace(/\{siteName\}/g,()=>escapeHtml(settings.general.siteName)).replace(/\{unsubscribeUrl\}/g,()=>escapeHtml(unsubscribeUrl)).replace(/\{downloadUrl\}/g,()=>escapeHtml(resourceUrl)));
  html=sanitizeHtml(html,{allowedTags:emailTags,allowedAttributes:emailAttributes,allowedSchemes:['http','https','mailto'],allowProtocolRelative:false,transformTags:{
    a:(tag,attrs)=>{let href=attrs.href||'';if(href.startsWith('/'))href=base+href;
      if(tracking?.clicks&&/^https?:/.test(href)&&href!==unsubscribeUrl&&!/^\/(unsubscribe|downloads?)\//.test(new URL(href).pathname)){links.push(href);href=`${base}/email/click/${tracking.raw}/${links.length}`;}
      if(href)textLinks.push(href);return{tagName:tag,attribs:{...attrs,href}};
    },img:(tag,attrs)=>({tagName:tag,attribs:{...attrs,src:emailAssetUrl(attrs.src||'',settings)}}),
  }});
  const preheader=newsletter.preheader.replace(/\{name\}/g,()=>name).replace(/\{siteName\}/g,()=>settings.general.siteName);
  html=frameEmail(html,settings,unsubscribeUrl,preheader);if(tracking?.opens)html=html.replace('</body>',`<img src="${base}/email/open/${tracking.raw}.gif" width="1" height="1" alt=""></body>`);
  const text=sanitizeHtml(html.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(p|div|h\d|li|tr)>/gi,'\n'),{allowedTags:[],allowedAttributes:{}}).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"')+`\n\nLinks:\n${[...new Set(textLinks)].join('\n')}\n\nUnsubscribe: ${unsubscribeUrl}`;
  return{subject:newsletter.subject.replace(/\{name\}/g,()=>name.replace(/[\r\n]/g,' ')).replace(/\{siteName\}/g,()=>settings.general.siteName.replace(/[\r\n]/g,' ')),html,text,unsubscribeUrl,links};
}

