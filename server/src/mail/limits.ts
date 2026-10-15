import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {SmtpSettings} from '@affiliate/shared';
// Call inside the same database transaction as the message claim. A failed or
// ambiguous attempt still consumes allowance; never refund an uncertain delivery.
export function reserveEmailAllowance(db:DatabaseSync,smtp:SmtpSettings,now=Date.now()){
 const key=createHash('sha256').update(JSON.stringify([smtp.host.toLowerCase(),(smtp.username||smtp.fromEmail).toLowerCase()])).digest('hex');
 const hour=smtp.maxPerHour??450,minute=smtp.maxPerMinute??8;
 const counts=db.prepare('SELECT count(*) hour,sum(CASE WHEN claimed_at>? THEN 1 ELSE 0 END) minute FROM email_send_leases WHERE sender_key=? AND claimed_at>?').get(now-60000,key,now-3600000)!;
 if(Number(counts.hour)>=hour||Number(counts.minute??0)>=minute)return false;
 db.prepare('DELETE FROM email_send_leases WHERE claimed_at<=?').run(now-86400000);
 db.prepare('INSERT INTO email_send_leases(sender_key,claimed_at) VALUES(?,?)').run(key,now);return true;
}
