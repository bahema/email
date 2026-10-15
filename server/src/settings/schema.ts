import { z } from 'zod';
import type { SettingsResponse } from '@affiliate/shared';

const text = (max = 2000) => z.string().trim().max(max);
const email = z.union([z.email().max(254), z.literal('')]);
const url = z.string().max(2000).refine(value => { if (!value) return true; try { const parsed=new URL(value); return ['http:', 'https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password; } catch { return false; } }, 'Use a public HTTP or HTTPS URL without credentials');
const profileUrl=url.refine(v=>{if(!v)return true;try{const u=new URL(v);return !u.username&&!u.password;}catch{return false;}},'Use a public HTTP(S) URL without credentials');
const iconUrl=profileUrl.refine(v=>{if(!v)return true;try{return !/^\/(api\/admin|downloads?)(\/|$)/.test(new URL(v).pathname);}catch{return false;}},'Use a public image URL');
const timezone = z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Invalid timezone');
export const siteOrigin=z.string().max(2000).refine(value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/';}catch{return false;}},'Use an HTTP or HTTPS site origin without credentials, path, query or fragment');
export const safeExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'pdf', 'txt', 'doc', 'docx', 'zip', 'mp4', 'webm'];
export const settingsSchemas = {
  activity:z.object({enabled:z.boolean(),showLocations:z.boolean(),days:z.number().int().min(1).max(90),intervalSeconds:z.number().int().min(5).max(30)}).strict(),
  general: z.object({ siteName: text(120).min(1), siteUrl: url.refine(Boolean, 'Site URL is required'), adminEmail: email, timezone, logoUrl: iconUrl, defaultSenderName: text(120) }).strict(),
  smtp: z.object({ host: text(253).refine(value => !value || /^[a-z0-9._:-]+$/i.test(value), 'Use a hostname or IP address'), port: z.number().int().min(1).max(65535), encryption: z.enum(['tls', 'starttls', 'none']), username: text(254), fromName: text(120), fromEmail: email, replyTo: email,
    maxPerHour:z.number().int().min(1).max(100000).default(450), maxPerMinute:z.number().int().min(1).max(1000).default(8), password: z.string().max(1024).optional(), clearPassword: z.boolean().optional(),
  }).strict().refine(value => !(value.password && value.clearPassword), 'Choose a new password or clear it, not both').refine(value => value.encryption !== 'none' || ['localhost', '127.0.0.1', '::1', ''].includes(value.host), 'Unencrypted SMTP is allowed only on loopback hosts'),
  emailDefaults: z.object({ headerBackground:z.string().regex(/^#[a-f0-9]{6}$/i).default('#193f48'), footer: text(10000), unsubscribeText: text(500).min(1), affiliateDisclosure: text(5000), identity: text(2000),address:text(2000).default(''),contactEmail:email.default(''),contactPhone:text(100).default(''),websiteDescription:text(2000).default(''),socialLinks:z.array(z.object({platform:text(60).min(1),url:profileUrl,iconUrl:iconUrl.default('')}).strict()).max(20).default([]) }).strict(),
  tracking: z.object({ opens: z.boolean(), emailClicks: z.boolean(), affiliateClicks: z.boolean(), utm: z.boolean() }).strict(),
  domains: z.object({ publicUrl: siteOrigin,dkimSelector:z.string().trim().regex(/^[a-zA-Z0-9_-]{1,63}(?:\.[a-zA-Z0-9_-]{1,63}){0,3}$/).default('privateemail') }).strict(),
  compliance: z.object({ doubleOptIn: z.boolean(), privacyUrl: url, termsUrl: url, affiliateDisclosureUrl: url, consentText: text(2000).min(1), unsubscribeFooter: text(2000).min(1) }).strict(),
  affiliate: z.object({ disclosure: text(5000) }).strict(),
  uploads: z.object({ allowedExtensions: z.array(z.enum(safeExtensions as [string, ...string[]])).min(1).max(safeExtensions.length).refine(values => new Set(values).size === values.length, 'Remove duplicate extensions'), maxSizeMb: z.number().int().min(1).max(100) }).strict(),
};

export function defaultSettings(siteUrl: string, timeZone: string): SettingsResponse {
  return {
    activity:{enabled:true,showLocations:true,days:30,intervalSeconds:8},
    general: { siteName: 'Affiliate Engine', siteUrl, adminEmail: '', timezone: timeZone, logoUrl: '', defaultSenderName: 'Affiliate Engine' },
    smtp: { host: '', port: 587, encryption: 'starttls', username: '', fromName: 'Affiliate Engine', fromEmail: '', replyTo: '', passwordSet: false, maxPerHour:450,maxPerMinute:8 },
    emailDefaults: { headerBackground:'#193f48', footer: '', unsubscribeText: 'Unsubscribe', affiliateDisclosure: 'We may earn a commission when you visit or purchase through our affiliate links.', identity: '',address:'',contactEmail:'',contactPhone:'',websiteDescription:'',socialLinks:[] },
    tracking: { opens: false, emailClicks: true, affiliateClicks: true, utm: true },
    domains: { publicUrl: siteUrl,dkimSelector:'privateemail' },
    compliance: { doubleOptIn: true, privacyUrl: '', termsUrl: '', affiliateDisclosureUrl: '', consentText: 'I agree to receive emails and can unsubscribe at any time.', unsubscribeFooter: 'You can unsubscribe at any time using the link in each email.' },
    affiliate: { disclosure: 'We may earn a commission when you visit or purchase through our affiliate links.' },
    uploads: { allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'txt', 'docx'], maxSizeMb: 10 },
  };
}

