import { inlineSystemLogo } from '../mail/inline-logo.js';
import nodemailer from 'nodemailer';
import type { SmtpSettings } from '@affiliate/shared';
import { HttpError } from '../http.js';
import type { RenderedEmail } from '../marketing/newsletters.js';

export type SmtpCredentials = SmtpSettings & { password: string };
export interface EmailService {
  verify(settings: SmtpCredentials): Promise<void>;
  sendTest(settings: SmtpCredentials, recipient: string): Promise<void>;
}
function transport(settings: SmtpCredentials) {
  if (!settings.host) throw new HttpError(400, 'SMTP_NOT_CONFIGURED', 'Save an SMTP host first');
  if (settings.username && !settings.password) throw new HttpError(400, 'SMTP_NOT_CONFIGURED', 'Save an SMTP password for this username');
  return nodemailer.createTransport({
    host: settings.host, port: settings.port,
    secure: settings.encryption === 'tls', requireTLS: settings.encryption === 'starttls', ignoreTLS: settings.encryption === 'none',
    auth: settings.username ? { user: settings.username, pass: settings.password } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    disableFileAccess: true, disableUrlAccess: true,
  });
}
export const smtpService: EmailService = {
  async verify(settings) {
    const sender = transport(settings);
    try { await sender.verify(); } finally { sender.close(); }
  },
  async sendTest(settings, recipient) {
    if (!settings.fromEmail) throw new HttpError(400, 'SMTP_NOT_CONFIGURED', 'Save a sender email first');
    const sender = transport(settings);
    try {
      await sender.sendMail({ from: { name: settings.fromName, address: settings.fromEmail }, to: recipient, replyTo: settings.replyTo || undefined, subject: 'Affiliate Engine SMTP test', text: 'Your Affiliate Engine SMTP test was accepted by the mail server. This is a configuration test, not a marketing campaign.' });
    } finally { sender.close(); }
  },
};
export function smtpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const code = (error as { code?: string })?.code;
  const message = code === 'EAUTH' ? 'SMTP authentication failed. Check the saved username and password.' : code === 'ETIMEDOUT' ? 'SMTP connection timed out. Check the host, port and network.' : 'SMTP test failed. Check the host, port, encryption, credentials and sender permissions.';
  return new HttpError(502, 'SMTP_TEST_FAILED', message);
}

export async function sendTransactional(settings:SmtpCredentials,recipient:string,subject:string,text:string,messageId:string,html?:string):Promise<void>{
  if(!settings.fromEmail)throw new HttpError(400,'SMTP_NOT_CONFIGURED','Save a sender email first');
  const sender=transport(settings);
  try{await sender.sendMail({from:{name:settings.fromName,address:settings.fromEmail},to:recipient,replyTo:settings.replyTo||undefined,subject,text,...inlineSystemLogo(html),messageId});}finally{sender.close();}
}

// A closed connection can occur after DATA acceptance. Retry only proven pre-send failures.
export function safeToRetrySmtp(error:unknown){const failure=error as {code?:string;syscall?:string};return ['ECONNREFUSED','ENOTFOUND','EDNS'].includes(failure?.code??'')||(failure?.code==='ESOCKET'&&failure.syscall==='connect');}

export type MarketingSender=(settings:SmtpCredentials,recipient:string,email:RenderedEmail,messageId:string)=>Promise<void>;
export const sendMarketing:MarketingSender=async(settings,recipient,email,messageId)=>{
  if(!settings.fromEmail)throw new HttpError(400,'SMTP_NOT_CONFIGURED','Save a sender email first');
  const sender=transport(settings);
  const unsubscribe=new URL(email.unsubscribeUrl),raw=unsubscribe.pathname.match(/^\/unsubscribe\/([a-f0-9]{64})$/)?.[1];
  const oneClick=raw?new URL('/api/public/unsubscribe/'+raw+'/one-click',unsubscribe.origin).href:null;
  try{await sender.sendMail({from:{name:settings.fromName,address:settings.fromEmail},to:recipient,replyTo:settings.replyTo||undefined,subject:email.subject,...inlineSystemLogo(email.html),text:email.text,messageId,list:{unsubscribe:{url:oneClick||email.unsubscribeUrl,comment:'Unsubscribe'}},...(oneClick?{headers:{'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}:{})});}finally{sender.close();}
};
