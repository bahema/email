import type {DatabaseSync} from 'node:sqlite';
export function heroResults(db:DatabaseSync,id:number,days:number){
 const from=new Date(Date.now()-days*86400000).toISOString();
 const submissions=db.prepare("SELECT coalesce(promotion_key,'legacy') key,count(*) submissions,count(DISTINCT contact_id) contacts,sum(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END) activated FROM lead_submissions WHERE source_type='hero' AND source_id=? AND created_at>=? GROUP BY promotion_key").all(String(id),from);
 const clicks=db.prepare("SELECT json_extract(metadata,'$.promotionKey') key,count(*) clicks FROM events WHERE type='affiliate_clicked' AND json_extract(metadata,'$.heroId')=? AND created_at>=? GROUP BY json_extract(metadata,'$.promotionKey')").all(id,from);
 const keys=new Set([...submissions,...clicks].map(r=>String(r.key)));
 return{days,items:[...keys].map(key=>{const s=submissions.find(r=>String(r.key)===key),c=clicks.find(r=>String(r.key)===key);return{key,submissions:Number(s?.submissions??0),contacts:Number(s?.contacts??0),activated:Number(s?.activated??0),affiliateClicks:Number(c?.clicks??0)};})};
}
