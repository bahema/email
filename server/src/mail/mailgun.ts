import nodemailer from 'nodemailer';
import type {SmtpCredentials} from '../settings/email.js';
import {HttpError} from '../http.js';
export interface DeliveryReceipt{providerMessageId:string;}
const endpoint=(settings:SmtpCredentials)=>'https://'+(settings.region==='eu'?'api.eu.mailgun.net':'api.mailgun.net')+'/v3/domains/'+encodeURIComponent(settings.mailgunDomain||'');
export function senderReady(s:SmtpCredentials){return!!s.fromEmail&&(s.transport==='mailgun'?s.providerApproved===true&&!!s.mailgunDomain&&!!s.deliveryApiKey:!!s.host&&(!s.username||!!s.password));}
export async function verifyMailgun(settings:SmtpCredentials,fetcher:typeof fetch=fetch){if(!settings.fromEmail||!settings.mailgunDomain||!settings.deliveryApiKey)throw new HttpError(400,'EMAIL_NOT_CONFIGURED','Save the sending domain, sender address and API key first');let response:Response;try{response=await fetcher(endpoint(settings),{headers:{Authorization:'Basic '+Buffer.from('api:'+settings.deliveryApiKey).toString('base64')},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new HttpError(502,'EMAIL_API_UNAVAILABLE','The email provider could not be reached. Check the region and saved settings.');}if(!response.ok)throw new HttpError(502,'EMAIL_API_VERIFY_FAILED','Email provider verification failed. Check the API key permissions, region and sending domain.');}
export async function sendMailgun(settings:SmtpCredentials,message:Record<string,unknown>,recipient:string,fetcher:typeof fetch=fetch):Promise<DeliveryReceipt>{
 if(settings.providerApproved!==true)throw new HttpError(400,'EMAIL_PROVIDER_APPROVAL_REQUIRED','Confirm provider approval for your affiliate-marketing use before sending');
 if(!senderReady(settings))throw new HttpError(400,'EMAIL_NOT_CONFIGURED','Save the sending domain, sender address and API key first');
 const composer=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'}),compiled=await composer.sendMail({...message,disableFileAccess:true,disableUrlAccess:true}),form=new FormData();
 form.set('to',recipient);form.set('message',new Blob([compiled.message as Buffer<ArrayBuffer>],{type:'message/rfc822'}),'message.eml');
 let response:Response;try{response=await fetcher('https://'+(settings.region==='eu'?'api.eu.mailgun.net':'api.mailgun.net')+'/v3/'+encodeURIComponent(settings.mailgunDomain||'')+'/messages.mime',{method:'POST',headers:{Authorization:'Basic '+Buffer.from('api:'+settings.deliveryApiKey).toString('base64')},body:form,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw new HttpError(502,'EMAIL_API_UNCERTAIN','Email submission outcome is uncertain; it will not be automatically resent.');}
 if(!response.ok)throw new HttpError(502,'EMAIL_API_REJECTED','Email provider rejected this submission. Review credentials, domain permissions and account limits.');
 let body:unknown;try{body=await response.json();}catch{throw new HttpError(502,'EMAIL_API_UNCERTAIN','Email submission outcome is uncertain; it will not be automatically resent.');}
 const id=(body as {id?:unknown})?.id;if(typeof id!=='string'||!id||id.length>1000)throw new HttpError(502,'EMAIL_API_UNCERTAIN','Email submission outcome is uncertain; it will not be automatically resent.');return{providerMessageId:id};
}
