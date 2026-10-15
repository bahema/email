import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { projectRoot, config } from '../config.js';

const path = resolve(projectRoot, '.env');
const existing = existsSync(path) ? readFileSync(path, 'utf8') : readFileSync(resolve(projectRoot, '.env.example'), 'utf8');
if (config.SETTINGS_ENCRYPTION_KEY) console.info('Settings encryption key already configured. No changes made.');
else {
  writeFileSync(path, `${existing.trimEnd()}\nSETTINGS_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
  console.info('Created a settings encryption key in .env. Keep this key with your backups; it is required to decrypt SMTP credentials.');
}
