import {DeliveryStore} from '../mail/delivery-settings.js';
import type { DatabaseSync } from 'node:sqlite';
import type { SettingsResponse, SettingsSection } from '@affiliate/shared';
import { decryptSecret, encryptSecret } from '../security/crypto.js';
import { defaultSettings, settingsSchemas } from './schema.js';

export class SettingsStore {
  constructor(private db: DatabaseSync, private key: string, private siteUrl: string, private timezone: string) {}
  private get(key: string): unknown {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(String(row.value)) : undefined;
  }
  private set(key: string, value: unknown) {
    this.db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").run(key, JSON.stringify(value));
  }
  read(): SettingsResponse {
    const result = defaultSettings(this.siteUrl, this.timezone);
    for (const section of Object.keys(settingsSchemas) as SettingsSection[]) {
      const stored = this.get(section);
      if (stored !== undefined) {
        // Return only schema-approved fields, never stored secret material.
        const parsed = settingsSchemas[section].parse(stored);
        if (section === 'smtp') {
          const { password: _password, clearPassword: _clear, ...safe } = settingsSchemas.smtp.parse(parsed);
          result.smtp = { ...safe, passwordSet: !!this.get('smtp_password') };
        } else Object.assign(result, { [section]: parsed });
      }
    }
    result.smtp.passwordSet = !!this.get('smtp_password');
    return result;
  }
  save(section: SettingsSection, input: unknown): SettingsResponse {
    const parsed = settingsSchemas[section].parse(input);
    const before=this.read()[section] as unknown as Record<string,unknown>;
    const changed=Object.entries(parsed).filter(([key,value])=>!['password','clearPassword'].includes(key)&&JSON.stringify(before[key])!==JSON.stringify(value)).map(([key])=>key);
    if(section==='smtp'&&('password' in parsed&&parsed.password||'clearPassword' in parsed&&parsed.clearPassword))changed.push('credentials');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (section === 'smtp') {
        const { password, clearPassword, ...settings } = settingsSchemas.smtp.parse(parsed);
        if (password) this.set('smtp_password', encryptSecret(password, this.key));
        else if (clearPassword) this.db.prepare('DELETE FROM settings WHERE key = ?').run('smtp_password');
        this.set(section, settings);
      } else this.set(section, parsed);
      this.db.prepare('INSERT INTO events (type,metadata) VALUES (?,?)').run('settings_updated', JSON.stringify({ section,fields:changed }));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.read();
  }
  delivery(){return new DeliveryStore(this.db,this.key);}
  smtpCredentials() {
    const encrypted = this.get('smtp_password');
    return { ...this.read().smtp,...this.delivery().credentials(), password: typeof encrypted === 'string' ? decryptSecret(encrypted, this.key) : '' };
  }
}
