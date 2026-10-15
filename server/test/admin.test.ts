import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, errorHandler, type AppOptions } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrations.js';
import { hashPassword, verifyPassword, encryptSecret, decryptSecret, tokenHash } from '../src/security/crypto.js';
import { smtpError, smtpService } from '../src/settings/email.js';
import type { SmtpCredentials } from '../src/settings/email.js';

const password = 'fictional-test-password-123';
const encryptionKey = 'ab'.repeat(32);
const options: AppOptions = { secureCookies: false, sessionHours: 8, siteUrl: 'http://localhost:5173', allowLoopbackOrigins: true, encryptionKey, timezone: 'Africa/Kigali', environment: 'test' };
const fixtureHash = hashPassword(password);
async function fixture(extra: Partial<AppOptions> = {}, withAdmin = true, databasePath = ':memory:') {
  const db = openDatabase(databasePath);
  migrate(db);
  if (withAdmin) db.prepare('INSERT INTO admin(id,email,password_hash) VALUES(1,?,?)').run('owner@example.test', await fixtureHash);
  const app = createApp(db, 6, { ...options, ...extra });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { db, base, close: async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); db.close(); } };
}
function client(base: string) {
  let cookie = '';
  let csrf = '';
  async function request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(base + path, { method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie().at(-1);
    if (setCookie) cookie = setCookie.split(';')[0]!;
    const data = await response.json();
    if (data.csrfToken) csrf = data.csrfToken;
    return { status: response.status, data, headers: response.headers };
  }
  return { request, cookie: () => cookie, csrf: () => csrf, login: async () => { await request('/api/auth/session'); return request('/api/auth/login', 'POST', { email: 'owner@example.test', password }); } };
}

// All credentials and recipients in this file are fictional; no real mail is sent.
test('passwords use salted hashes and SMTP secret encryption detects tampering', async () => {
  const first = await fixtureHash;
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('incorrect-password', first), false);
  const encrypted = encryptSecret('smtp-only-test-secret', encryptionKey);
  assert.ok(!encrypted.includes('smtp-only-test-secret'));
  assert.equal(decryptSecret(encrypted, encryptionKey), 'smtp-only-test-secret');
  assert.throws(() => decryptSecret(encrypted, 'cd'.repeat(32)));
  assert.throws(() => decryptSecret(encrypted.slice(0, -2) + 'ff', encryptionKey));
});

test('admin routes require login, login requires CSRF and checks request origin', async () => {
  const f = await fixture();
  try {
    const c = client(f.base);
    assert.equal((await c.request('/api/admin/settings')).status, 401);
    assert.equal((await c.request('/api/admin/system')).status, 401);
    assert.equal((await c.request('/api/admin/settings/general', 'PUT', {})).status, 401);
    assert.equal((await c.request('/api/auth/password', 'POST', {})).status, 401);
    await c.request('/api/auth/session');
    const payload = { email: 'owner@example.test', password };
    assert.equal((await c.request('/api/auth/login', 'POST', payload, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await c.request('/api/auth/login', 'POST', payload, { Origin: 'https://hostile.example' })).status, 403);
    const result = await c.request('/api/auth/login', 'POST', payload, { Origin: 'http://127.0.0.1:5173' });
    assert.equal(result.status, 200);
    assert.equal(result.data.authenticated, true);
    assert.match(result.headers.getSetCookie().at(-1)!, /HttpOnly/);
    assert.match(result.headers.getSetCookie().at(-1)!, /SameSite=Strict/);
    assert.equal((await c.request('/api/admin/settings')).status, 200);
    assert.equal((await c.request('/api/admin/settings/tracking', 'PUT', { opens: true, emailClicks: true, affiliateClicks: true, utm: true }, { 'X-CSRF-Token': '' })).status, 403);
  } finally { await f.close(); }
});

test('login rotates opaque sessions, survives app reconstruction, logout revokes them', async () => {
  const f = await fixture();
  try {
    const c = client(f.base);
    await c.request('/api/auth/session');
    const anonymousCookie = c.cookie();
    assert.equal((await c.login()).status, 200);
    assert.notEqual(c.cookie(), anonymousCookie);
    const raw = c.cookie().split('=')[1]!;
    assert.ok(f.db.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash = ?').get(tokenHash(raw)));
    assert.equal(f.db.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash = ?').get(raw), undefined);
    assert.equal((await fetch(f.base + '/api/admin/settings', { headers: { Cookie: anonymousCookie } })).status, 401);
    // Reconstruct the API against the same database, as on a process restart.
    const app = createApp(f.db, 4, options); app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    try { assert.equal((await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/settings`, { headers: { Cookie: c.cookie() } })).status, 200); }
    finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    const oldCookie = c.cookie();
    assert.equal((await c.request('/api/auth/logout', 'POST', {})).status, 200);
    assert.equal((await fetch(f.base + '/api/admin/settings', { headers: { Cookie: oldCookie } })).status, 401);
  } finally { await f.close(); }
});

test('expired sessions are rejected and production cookies are Secure', async () => {
  const f = await fixture({ secureCookies: true });
  try {
    const c = client(f.base);
    const initial = await c.request('/api/auth/session');
    assert.match(initial.headers.getSetCookie()[0]!, /Secure/);
    assert.equal((await c.login()).status, 200);
    f.db.prepare('UPDATE admin_sessions SET expires_at = ?').run(Date.now() - 1);
    assert.equal((await c.request('/api/admin/settings')).status, 401);
    const fresh = await c.request('/api/auth/session');
    assert.equal(fresh.data.authenticated, false);
    assert.equal(f.db.prepare('SELECT count(*) AS count FROM admin_sessions').get()?.count, 1);
  } finally { await f.close(); }
});

test('failed logins return generic errors and are rate limited', async () => {
  const f = await fixture({ loginLimit: 2 });
  try {
    const c = client(f.base); await c.request('/api/auth/session');
    const payload = { email: 'owner@example.test', password: 'incorrect' };
    const first = await c.request('/api/auth/login', 'POST', payload);
    assert.equal(first.status, 401); assert.equal(first.data.error.code, 'INVALID_CREDENTIALS');
    assert.equal((await c.request('/api/auth/login', 'POST', payload)).status, 401);
    const blocked = await c.request('/api/auth/login', 'POST', payload);
    assert.equal(blocked.status, 429); assert.ok(blocked.headers.get('retry-after'));
  } finally { await f.close(); }
});

test('uninitialized installation requires local admin setup and does not expose setup API', async () => {
  const f = await fixture({}, false);
  try {
    const c = client(f.base);
    assert.equal((await c.request('/api/auth/session')).data.setupRequired, true);
    assert.equal((await c.request('/api/auth/setup', 'POST', {})).status, 404);
    assert.equal((await c.request('/api/auth/login', 'POST', { email: 'owner@example.test', password })).status, 401);
  } finally { await f.close(); }
});

test('settings persist, validate URLs/timezones/file types and never return SMTP secrets', async () => {
  const f = await fixture();
  try {
    const c = client(f.base); await c.login();
    const defaults = (await c.request('/api/admin/settings')).data;
    assert.equal(defaults.compliance.doubleOptIn, true);
    const general = { ...defaults.general, siteName: 'Test Site', adminEmail: 'contact@example.test', timezone: 'Africa/Kigali' };
    assert.equal((await c.request('/api/admin/settings/general', 'PUT', general)).status, 200);
    assert.equal((await c.request('/api/admin/settings')).data.general.siteName, 'Test Site');
    assert.equal((await c.request('/api/admin/settings/general', 'PUT', { ...general, timezone: 'Invalid/Timezone' })).status, 400);
    assert.equal((await c.request('/api/admin/settings/general', 'PUT', { ...general, logoUrl: 'javascript:alert(1)' })).status, 400);
    assert.equal((await c.request('/api/admin/settings/uploads', 'PUT', { allowedExtensions: ['exe'], maxSizeMb: 10 })).status, 400);
    const smtp = { host: 'smtp.example.test', port: 587, encryption: 'starttls', username: 'owner', fromName: 'Test', fromEmail: 'sender@example.test', replyTo: '', password: 'smtp-only-test-secret' };
    const saved = await c.request('/api/admin/settings/smtp', 'PUT', smtp);
    assert.equal(saved.status, 200); assert.equal(saved.data.smtp.passwordSet, true);
    assert.equal(saved.data.smtp.password, undefined);
    const stored = String(f.db.prepare('SELECT value FROM settings WHERE key = ?').get('smtp_password')?.value);
    assert.ok(!stored.includes(smtp.password));
    assert.ok(!JSON.stringify(saved.data).includes(smtp.password));
    assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM events').all()).includes(smtp.password));
    assert.equal((await c.request('/api/admin/settings/smtp', 'PUT', { ...smtp, password: '' })).data.smtp.passwordSet, true);
    assert.equal((await c.request('/api/admin/settings/smtp', 'PUT', { ...smtp, encryption: 'none' })).status, 400);
    const { password: _password, ...withoutSecret } = smtp;
    assert.equal((await c.request('/api/admin/settings/smtp', 'PUT', { ...withoutSecret, clearPassword: true })).data.smtp.passwordSet, false);
    assert.equal(f.db.prepare('SELECT value FROM settings WHERE key = ?').get('smtp_password'), undefined);
    const system = await c.request('/api/admin/system');
    assert.equal(system.data.database, 'connected');
    assert.ok(!JSON.stringify(system.data).includes(encryptionKey));
    assert.ok(!JSON.stringify(system.data).includes('affiliate.sqlite'));
  } finally { await f.close(); }
});

test('SMTP tests receive decrypted saved settings and apply test throttling without sending real mail', async () => {
  const verified: SmtpCredentials[] = [];
  const recipients: string[] = [];
  const f = await fixture({ emailService: { async verify(settings) { verified.push(settings); }, async sendTest(settings, recipient) { verified.push(settings); recipients.push(recipient); } } });
  try {
    const c = client(f.base); await c.login();
    await c.request('/api/admin/settings/smtp', 'PUT', { host: 'smtp.example.test', port: 587, encryption: 'starttls', username: 'owner', password: 'smtp-test-secret', fromName: 'Owner', fromEmail: 'owner@example.test', replyTo: '' });
    assert.equal((await c.request('/api/admin/smtp/verify', 'POST', {})).status, 200);
    assert.equal((await c.request('/api/admin/smtp/test', 'POST', { recipient: 'recipient@example.test' })).status, 200);
    assert.equal(verified[0]?.password, 'smtp-test-secret');
    assert.deepEqual(recipients, ['recipient@example.test']);
    assert.equal((await c.request('/api/admin/smtp/test', 'POST', { recipient: 'invalid-email' })).status, 400);
    assert.equal((await c.request('/api/admin/smtp/verify', 'POST', {})).status, 429);
    assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM events').all()).includes('smtp-test-secret'));
  } finally { await f.close(); }
});

test('SMTP failures do not expose provider errors or credentials', async () => {
  const f = await fixture({ emailService: { async verify() { throw Object.assign(new Error('server exposed secret smtp-test-secret'), { code: 'EAUTH' }); }, async sendTest() {} } });
  try {
    const c = client(f.base); await c.login();
    const result = await c.request('/api/admin/smtp/verify', 'POST', {});
    assert.equal(result.status, 502); assert.equal(result.data.error.code, 'SMTP_TEST_FAILED');
    assert.ok(!JSON.stringify(result.data).includes('smtp-test-secret'));
    assert.equal(smtpError(new Error('sensitive raw provider text')).status, 502);
  } finally { await f.close(); }
});

test('password changes require current password, rotate session and revoke other sessions', async () => {
  const f = await fixture();
  try {
    const a = client(f.base); const b = client(f.base);
    await a.login(); await b.login();
    const oldCookie = a.cookie();
    const newPassword = 'new-fictional-password-456';
    assert.equal((await a.request('/api/auth/password', 'POST', { currentPassword: 'wrong', newPassword })).status, 401);
    assert.equal((await a.request('/api/auth/password', 'POST', { currentPassword: password, newPassword: 'short' })).status, 400);
    assert.equal((await a.request('/api/auth/password', 'POST', { currentPassword: password, newPassword })).status, 200);
    assert.notEqual(a.cookie(), oldCookie);
    assert.equal((await b.request('/api/admin/settings')).status, 401);
    assert.equal((await a.request('/api/admin/settings')).status, 200);
    const stored = String(f.db.prepare('SELECT password_hash FROM admin WHERE id = 1').get()?.password_hash);
    assert.equal(await verifyPassword(password, stored), false);
    assert.equal(await verifyPassword(newPassword, stored), true);
  } finally { await f.close(); }
});


test('settings and authenticated sessions persist after closing and reopening the database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'affiliate-phase2-'));
  const path = join(directory, 'test.sqlite');
  let active: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    active = await fixture({}, true, path);
    const c = client(active.base); await c.login();
    const defaults = (await c.request('/api/admin/settings')).data;
    await c.request('/api/admin/settings/general', 'PUT', { ...defaults.general, siteName: 'Persistent test site' });
    const cookie = c.cookie();
    await active.close(); active = undefined;
    active = await fixture({}, false, path);
    const response = await fetch(active.base + '/api/admin/settings', { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).general.siteName, 'Persistent test site');
  } finally {
    if (active) await active.close();
    for (const file of [path, path + '-wal', path + '-shm']) rmSync(file, { force: true });
    rmdirSync(directory);
  }
});

test('Nodemailer verifies and submits a test message to a local capture server only', async () => {
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.setEncoding('utf8'); socket.write('220 test.local ESMTP\r\n');
    let buffer = ''; let data = false; let message = '';
    socket.on('data', chunk => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, ''); buffer = buffer.slice(newline + 1);
        if (data) {
          if (line === '.') { messages.push(message); message = ''; data = false; socket.write('250 Captured locally\r\n'); }
          else message += line + '\n';
        } else if (/^(EHLO|HELO) /i.test(line)) socket.write('250-test.local\r\n250 PIPELINING\r\n');
        else if (line === 'DATA') { data = true; socket.write('354 Send message\r\n'); }
        else if (line === 'QUIT') socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const settings: SmtpCredentials = { host: '127.0.0.1', port: (server.address() as AddressInfo).port, encryption: 'none', username: '', password: '', passwordSet: false, fromName: 'Local test', fromEmail: 'sender@example.test', replyTo: '' };
    await smtpService.verify(settings);
    assert.equal(messages.length, 0);
    await smtpService.sendTest(settings, 'recipient@example.test');
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /Affiliate Engine SMTP test/);
    assert.match(messages[0]!, /recipient@example.test/);
    assert.match(messages[0]!, /not a marketing campaign/);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});



test('email settings readiness, preview and change history connect without exposing credentials',async()=>{
 let verified=0,sent=0;
 const f=await fixture({emailService:{verify:async()=>{verified++;},sendTest:async()=>{sent++;}}});
 try{
 const anonymous=await fetch(f.base+'/api/admin/settings-readiness');assert.equal(anonymous.status,401);
 const c=client(f.base);await c.login();const defaults=(await c.request('/api/admin/settings')).data;
 const smtp={...defaults.smtp,host:'smtp.example.test',fromEmail:'sender@example.test',username:'sender',password:'fictional-smtp-secret'};delete smtp.passwordSet;
 assert.equal((await c.request('/api/admin/settings/smtp','PUT',smtp)).status,200);
 const initial=(await c.request('/api/admin/settings-readiness')).data;assert.equal(initial.configured,true);assert.equal(initial.connectionTest.current,false);
 assert.equal((await c.request('/api/admin/smtp/verify','POST',{})).status,200);
 assert.equal((await c.request('/api/admin/smtp/test','POST',{recipient:'inbox@example.test'})).status,200);
 const ready=(await c.request('/api/admin/settings-readiness')).data;assert.equal(ready.connectionTest.current,true);assert.equal(ready.sendTest.current,true);assert.equal(verified,1);assert.equal(sent,1);
 await c.request('/api/admin/settings/smtp','PUT',{...smtp,password:'changed-fictional-secret'});
 const changed=(await c.request('/api/admin/settings-readiness')).data;assert.equal(changed.connectionTest.current,false);assert.ok(changed.history[0].fields.includes('credentials'));assert.ok(!JSON.stringify(changed).includes('fictional'));assert.ok(!JSON.stringify(changed).includes('fingerprint'));
 const draft={general:{...defaults.general,siteName:'Draft sample',logoUrl:'https://example.test/media/1'},emailDefaults:{...defaults.emailDefaults,address:'Fictional address',socialLinks:[{platform:'YouTube',url:'https://youtube.com/@example',iconUrl:'https://example.test/media/2'}]},domains:{publicUrl:'https://example.test'},compliance:defaults.compliance};
 const preview=await c.request('/api/admin/settings-preview','POST',draft);assert.equal(preview.status,200);assert.match(preview.data.marketing,/Fictional address/);assert.match(preview.data.confirmation,/example.test\/confirm\/demo-preview/);assert.match(preview.data.marketing,/example.test\/media\/2/);assert.equal(sent,1);assert.equal((await c.request('/api/admin/settings')).data.general.siteName,defaults.general.siteName);
 assert.equal((await c.request('/api/admin/settings-preview','POST',{...draft,domains:{publicUrl:'javascript:bad'}})).status,400);
 assert.equal((await c.request('/api/admin/settings/emailDefaults','PUT',draft.emailDefaults)).status,200);
 const newsletter=await c.request('/api/admin/newsletter-preview','POST',{title:'Sample',subject:'Sample',html:'<p>Hello</p>',preheader:'',status:'draft'});assert.equal(newsletter.status,200);assert.match(newsletter.data.html,/Fictional address/);
 }finally{await f.close();}
});
