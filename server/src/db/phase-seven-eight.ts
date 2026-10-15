export const phaseSevenSql=`
 CREATE TABLE lead_pages(id INTEGER PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,type TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','active','inactive')),data TEXT NOT NULL CHECK(json_valid(data)),created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 ALTER TABLE lead_submissions ADD COLUMN page_snapshot TEXT CHECK(page_snapshot IS NULL OR json_valid(page_snapshot));
 CREATE TABLE download_tokens(token_hash TEXT PRIMARY KEY,contact_id INTEGER NOT NULL REFERENCES contacts(id),submission_id INTEGER NOT NULL REFERENCES lead_submissions(id),media_id INTEGER NOT NULL REFERENCES media(id),expires_at INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE INDEX download_tokens_contact ON download_tokens(contact_id);
`;
export const phaseEightSql=`
 CREATE TABLE automations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('running','paused')),created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE automation_steps(id INTEGER PRIMARY KEY,automation_id INTEGER NOT NULL REFERENCES automations(id),position INTEGER NOT NULL,delay_minutes INTEGER NOT NULL,newsletter_id INTEGER NOT NULL REFERENCES newsletters(id),UNIQUE(automation_id,position));
 CREATE TABLE automation_enrollments(id INTEGER PRIMARY KEY,automation_id INTEGER NOT NULL REFERENCES automations(id),contact_id INTEGER NOT NULL REFERENCES contacts(id),submission_id INTEGER NOT NULL REFERENCES lead_submissions(id),status TEXT NOT NULL CHECK(status IN ('active','completed','failed','cancelled')),created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(automation_id,contact_id));
 ALTER TABLE campaigns ADD COLUMN automation_enrollment_id INTEGER REFERENCES automation_enrollments(id);
 ALTER TABLE campaigns ADD COLUMN automation_step_position INTEGER;
 CREATE UNIQUE INDEX campaigns_automation_step ON campaigns(automation_enrollment_id,automation_step_position) WHERE automation_enrollment_id IS NOT NULL;
 CREATE INDEX automation_enrollments_contact ON automation_enrollments(contact_id,status);
`;
