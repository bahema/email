import type {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import {encryptSecret,decryptSecret} from '../security/crypto.js';
import {event} from '../db/helpers.js';
export const deliveryConfigSchema=z.object({transport:z.enum(['smtp','mailgun']).default('smtp'),providerApproved:z.boolean().default(false),paused:z.boolean().default(false),pauseReason:z.string().trim().max(200).default(''),mailgunDomain:z.string().trim().toLowerCase().max(253).refine(v=>!v||/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v),'Use a sending domain, without https:// or paths').default(''),region:z.enum(['us','eu']).default('us'),feedbackEnabled:z.boolean().default(false)}).strict();
export const deliveryInputSchema=deliveryConfigSchema.extend({apiKey:z.string().trim().max(2048).optional(),clearApiKey:z.boolean().optional(),webhookKey:z.string().trim().max(2048).optional(),clearWebhookKey:z.boolean().optional()}).refine(v=>!(v.apiKey&&v.clearApiKey)&&!(v.webhookKey&&v.clearWebhookKey),'Choose replacement or removal, not both');
export type DeliveryConfig=z.infer<typeof deliveryConfigSchema>;
export interface DeliveryCredentials {transport:'smtp'|'mailgun';providerApproved:boolean;mailgunDomain:string;region:'us'|'eu';deliveryApiKey:string;}
export class DeliveryStore{
 constructor(private db:DatabaseSync,private key:string){}
 private row(){return this.db.prepare('SELECT * FROM email_delivery_config WHERE id=1').get();}
 config():DeliveryConfig{const row=this.row();return deliveryConfigSchema.parse(row?JSON.parse(String(row.config)):{});}
 read(){const row=this.row();return{...this.config(),apiKeySet:!!row?.api_key,webhookKeySet:!!row?.webhook_key};}
 credentials():DeliveryCredentials{const row=this.row(),config=this.config();return{transport:config.transport,providerApproved:config.providerApproved,mailgunDomain:config.mailgunDomain,region:config.region,deliveryApiKey:config.transport==='mailgun'&&row?.api_key?decryptSecret(String(row.api_key),this.key,'delivery-api-key'):''};}
 webhookKey(){const row=this.row();return row?.webhook_key?decryptSecret(String(row.webhook_key),this.key,'delivery-webhook-key'):'';}
 save(input:unknown){const value=deliveryInputSchema.parse(input),config=deliveryConfigSchema.parse(Object.fromEntries(Object.entries(value).filter(([k])=>!['apiKey','clearApiKey','webhookKey','clearWebhookKey'].includes(k)))),row=this.row();const api=value.clearApiKey?null:value.apiKey?encryptSecret(value.apiKey,this.key,'delivery-api-key'):row?.api_key??null,webhook=value.clearWebhookKey?null:value.webhookKey?encryptSecret(value.webhookKey,this.key,'delivery-webhook-key'):row?.webhook_key??null;this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO email_delivery_config(id,config,api_key,webhook_key) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,api_key=excluded.api_key,webhook_key=excluded.webhook_key').run(JSON.stringify(config),api as string|null,webhook as string|null);event(this.db,'email_delivery_settings_updated',{transport:config.transport,paused:config.paused,feedbackEnabled:config.feedbackEnabled,credentialsChanged:!!(value.apiKey||value.clearApiKey||value.webhookKey||value.clearWebhookKey)});this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return this.read();}
 pause(paused:boolean){return this.save({...this.config(),paused});}
}
