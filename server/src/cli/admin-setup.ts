import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents, type Key } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { z } from 'zod';
import { config } from '../config.js';
import { openDatabase } from '../db/database.js';
import { migrate } from '../db/migrations.js';
import { hashPassword } from '../security/crypto.js';
import { passwordSchema } from '../auth/routes.js';

async function hiddenPrompt(label: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Admin setup requires an interactive terminal');
  stdout.write(label);
  emitKeypressEvents(stdin);
  const previousRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    function finish(error?: Error) {
      stdin.off('keypress', onKey);
      stdin.setRawMode(previousRaw);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error); else resolve(value);
    }
    function onKey(text: string, key: Key) {
      if (key.ctrl && key.name === 'c') return finish(new Error('Setup cancelled'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') { if (value.length) { value = value.slice(0, -1); stdout.write('\b \b'); } return; }
      if (!key.ctrl && !key.meta && text && !/[\u0000-\u001f\u007f]/.test(text) && value.length + text.length <= 128) { value += text; stdout.write('*'.repeat(text.length)); }
    }
    stdin.on('keypress', onKey);
  });
}

const db = openDatabase(config.databasePath);
try {
  migrate(db);
  const exists = !!db.prepare('SELECT id FROM admin WHERE id = 1').get();
  const reset = process.argv.includes('--reset');
  if (exists && !reset) throw new Error('Admin already exists. Use Security settings to change the password, or admin:reset for local recovery.');
  if (!exists && reset) throw new Error('No admin exists. Run admin:setup first.');
  if (!stdin.isTTY) throw new Error('Run this command in an interactive terminal');
  const rl = createInterface({ input: stdin, output: stdout });
  let email: string;
  try {
    if (reset && await rl.question('Replace the sole admin login and revoke all sessions? Type RESET: ') !== 'RESET') throw new Error('Recovery cancelled');
    email = z.email().max(254).parse((await rl.question('Admin email: ')).trim().toLowerCase());
  } finally { rl.close(); }
  const password = passwordSchema.parse(await hiddenPrompt('Password (12+ characters): '));
  if (password !== await hiddenPrompt('Confirm password: ')) throw new Error('Passwords do not match');
  const hash = await hashPassword(password);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (reset) { db.prepare("UPDATE admin SET email=?,password_hash=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1").run(email, hash); db.exec('DELETE FROM admin_sessions'); }
    else db.prepare('INSERT INTO admin (id,email,password_hash) VALUES (1,?,?)').run(email, hash);
    db.prepare('INSERT INTO events (type) VALUES (?)').run(reset ? 'admin_recovered' : 'admin_created');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  console.info('Admin login saved. Log in at /admin/login.');
} catch (error) {
  console.error(error instanceof z.ZodError ? 'Invalid email or password. Use a valid email and a password of 12–128 characters.' : error instanceof Error ? error.message : 'Setup failed');
  process.exitCode = 1;
} finally { db.close(); }
