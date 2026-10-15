import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, scryptOptions, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$32768$8$3$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$32768$8$3' || !/^[a-f0-9]{32}$/.test(parts[4] ?? '') || !/^[a-f0-9]{128}$/.test(parts[5] ?? '')) return false;
  return timingSafeEqual(await derive(password, parts[4]!), Buffer.from(parts[5]!, 'hex'));
}
export const token = () => randomBytes(32).toString('hex');
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function sameToken(a: string, b: string): boolean {
  return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function encryptionKey(key: string): Buffer {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('Settings encryption key is not configured');
  return Buffer.from(key, 'hex');
}
export function encryptSecret(value: string, key: string, context = 'smtp-password'): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(`affiliate-engine:${context}:v1`));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}
export function decryptSecret(value: string, key: string, context = 'smtp-password'): string {
  const [version, iv, tag, encrypted] = value.split(':');
  if (version !== 'v1' || !iv || !tag || encrypted === undefined) throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(iv, 'hex'));
  decipher.setAAD(Buffer.from(`affiliate-engine:${context}:v1`));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8');
}

