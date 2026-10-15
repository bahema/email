import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import { siteOrigin } from './settings/schema.js';

const moduleRoot = fileURLToPath(new URL('../../', import.meta.url));
// Built output lives three directories deeper than source.
export const projectRoot = import.meta.url.includes('/dist/') ? resolve(moduleRoot, '../..') : moduleRoot;
const root = projectRoot;
loadEnv({ path: resolve(root, '.env'), quiet: true });

export const configurationSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  SITE_URL: siteOrigin.default('http://localhost:5173'),
  TIMEZONE: z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Invalid timezone').default('Africa/Kigali'),
  DATABASE_PATH: z.string().min(1).default('./data/affiliate.sqlite'),
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  SETTINGS_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  TRUST_PROXY: z.enum(['false', 'true']).default('false'),
}).superRefine((value,ctx)=>{
  if(value.NODE_ENV==='production'){
    if(!value.SITE_URL.startsWith('https://'))ctx.addIssue({code:'custom',path:['SITE_URL'],message:'Production requires an HTTPS site origin'});
    if(!value.SETTINGS_ENCRYPTION_KEY)ctx.addIssue({code:'custom',path:['SETTINGS_ENCRYPTION_KEY'],message:'Production requires the original encryption key'});
  }
});
const parsed = configurationSchema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid configuration: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
export const config = {
  ...parsed.data,
  databasePath: resolve(root, parsed.data.DATABASE_PATH),
  uploadDir: resolve(root, parsed.data.UPLOAD_DIR),
  clientDist: resolve(root, 'client/dist'),
};


