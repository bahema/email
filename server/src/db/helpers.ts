import type { DatabaseSync } from 'node:sqlite';
let savepointId=0;

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  if(db.isTransaction){const savepoint='nested_'+(++savepointId);db.exec('SAVEPOINT '+savepoint);try{const value=work();db.exec('RELEASE SAVEPOINT '+savepoint);return value;}catch(error){db.exec('ROLLBACK TO SAVEPOINT '+savepoint);db.exec('RELEASE SAVEPOINT '+savepoint);throw error;}}
  db.exec('BEGIN IMMEDIATE');
  try { const value = work(); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function event(db: DatabaseSync, type: string, metadata: Record<string, unknown> = {}, contactId: number | null = null) {
  db.prepare('INSERT INTO events(type,metadata,contact_id) VALUES(?,?,?)').run(type, JSON.stringify(metadata), contactId);
}
