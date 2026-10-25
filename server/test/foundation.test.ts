import { transaction } from '../src/db/helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrations.js';
import { createApp, errorHandler } from '../src/app.js';

test('migrations are repeatable and enforce foundation constraints', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(migrate(db), 20);
    assert.equal(migrate(db), 20);
    assert.equal(db.prepare('SELECT count(*) AS count FROM schema_migrations').get()?.count, 20);
    assert.throws(() => db.prepare('INSERT INTO admin (id,email,password_hash) VALUES (2,?,?)').run('admin@example.test', 'hash'));
    assert.throws(() => db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('bad', 'not-json'));
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
  } finally { db.close(); }
});

test('API health, missing routes and invalid JSON use expected responses', async () => {
  const db = openDatabase(':memory:');
  const app = createApp(db, migrate(db));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).database, 'connected');
    assert.ok(health.headers.get('x-request-id'));
    assert.equal((await fetch(`${base}/api/missing`)).status, 404);
    const invalid = await fetch(`${base}/api/missing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_JSON');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); db.close(); }
});





test('nested writes isolate inner failures and outer rollback keeps activation atomic',()=>{
 const db=openDatabase(':memory:');try{
  db.exec('CREATE TABLE writes(id INTEGER PRIMARY KEY)');transaction(db,()=>{db.prepare('INSERT INTO writes VALUES(1)').run();assert.throws(()=>transaction(db,()=>{db.prepare('INSERT INTO writes VALUES(2)').run();throw new Error('Inner failure');}));db.prepare('INSERT INTO writes VALUES(3)').run();});assert.deepEqual(db.prepare('SELECT id FROM writes ORDER BY id').all().map(r=>r.id),[1,3]);
  assert.throws(()=>transaction(db,()=>{transaction(db,()=>db.prepare('INSERT INTO writes VALUES(4)').run());throw new Error('Activation failure');}));assert.deepEqual(db.prepare('SELECT id FROM writes ORDER BY id').all().map(r=>r.id),[1,3]);assert.equal(db.isTransaction,false);
 }finally{db.close();}
});
