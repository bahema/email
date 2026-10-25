import { phaseThreeSql, phaseFourSql } from './phase-three-four.js';
import { phaseFiveSql, phaseSixSql } from './phase-five-six.js';
import { phaseSevenSql, phaseEightSql } from './phase-seven-eight.js';
import { finalSql } from './phase-nine-ten.js';
import type { DatabaseSync } from 'node:sqlite';

// Append migrations; never modify an already applied migration.
const migrations = [{
  version: 1,
  name: 'foundation',
  sql: `
    CREATE TABLE admin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL CHECK (json_valid(value)),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE events (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX events_type_created_at ON events(type, created_at);
    CREATE INDEX events_created_at ON events(created_at);
  `,
}, {
  version: 2,
  name: 'admin_sessions',
  sql: `
    CREATE TABLE admin_sessions (
      token_hash TEXT PRIMARY KEY,
      csrf_token TEXT NOT NULL,
      admin_id INTEGER REFERENCES admin(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
  `,
}, { version: 3, name: 'media_and_website_content', sql: phaseThreeSql }, { version: 4, name: 'subscriber_lifecycle', sql: phaseFourSql }, { version: 5, name: 'newsletters_and_segments', sql: phaseFiveSql }, {version:6,name:'manual_campaigns_and_marketing_queue',sql:phaseSixSql},{version:7,name:'lead_pages_and_downloads',sql:phaseSevenSql},{version:8,name:'confirmation_automations',sql:phaseEightSql},{version:9,name:'analytics_indexes_and_sequence_tags',sql:finalSql}];

migrations.push({version:10,name:'lead_page_publication',sql:`
 ALTER TABLE lead_pages ADD COLUMN published_snapshot TEXT CHECK(published_snapshot IS NULL OR json_valid(published_snapshot));
 UPDATE lead_pages SET published_snapshot=json_object('name',name,'slug',slug,'type',type,'status','active','data',json(data)) WHERE status='active';
`});

migrations.push({version:11,name:'page_direct_emails',sql:`
 ALTER TABLE campaigns ADD COLUMN lead_submission_id INTEGER REFERENCES lead_submissions(id);
 CREATE UNIQUE INDEX campaigns_lead_submission ON campaigns(lead_submission_id) WHERE lead_submission_id IS NOT NULL;
`});

migrations.push({version:12,name:'recurring_campaigns',sql:`
 CREATE TABLE recurring_campaigns(id INTEGER PRIMARY KEY,name TEXT NOT NULL,newsletter_id INTEGER NOT NULL REFERENCES newsletters(id),audience TEXT NOT NULL CHECK(json_valid(audience)),interval TEXT NOT NULL CHECK(interval IN ('daily','weekly')),timezone TEXT NOT NULL,local_time TEXT NOT NULL,anchor_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'paused' CHECK(status IN ('running','paused')),next_run INTEGER NOT NULL,last_error TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE recurring_occurrences(schedule_id INTEGER NOT NULL REFERENCES recurring_campaigns(id),due_at INTEGER NOT NULL,campaign_id INTEGER NOT NULL REFERENCES campaigns(id),PRIMARY KEY(schedule_id,due_at));
 CREATE INDEX recurring_due ON recurring_campaigns(status,next_run);
`});

migrations.push({version:13,name:'funnel_workspace',sql:`
 ALTER TABLE contacts ADD COLUMN consent_mode TEXT NOT NULL DEFAULT 'double' CHECK(consent_mode IN ('double','single'));
 ALTER TABLE contacts ADD COLUMN email_verified_at TEXT;
 UPDATE contacts SET email_verified_at=confirmed_at WHERE status='confirmed';
 UPDATE contacts SET consent_mode='single',email_verified_at=NULL WHERE id IN (SELECT contact_id FROM events WHERE type='lead_confirmed' AND json_extract(metadata,'$.mode')='single_opt_in');
 ALTER TABLE lead_submissions ADD COLUMN consent_mode TEXT NOT NULL DEFAULT 'double' CHECK(consent_mode IN ('double','single'));
 UPDATE lead_submissions SET consent_mode='single' WHERE id IN (SELECT json_extract(metadata,'$.submissionId') FROM events WHERE type='lead_confirmed' AND json_extract(metadata,'$.mode')='single_opt_in');
 UPDATE lead_submissions SET page_snapshot=json_set(page_snapshot,'$.pageId',(SELECT id FROM lead_pages WHERE slug=lead_submissions.source_id)) WHERE source_type='lead_page' AND page_snapshot IS NOT NULL AND EXISTS(SELECT 1 FROM lead_pages WHERE slug=lead_submissions.source_id);
 CREATE TABLE funnel_versions(id INTEGER PRIMARY KEY,page_id INTEGER NOT NULL REFERENCES lead_pages(id),snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 INSERT INTO funnel_versions(page_id,snapshot) SELECT id,published_snapshot FROM lead_pages WHERE published_snapshot IS NOT NULL;
 INSERT OR IGNORE INTO media_usage(media_id,owner_key) SELECT u.media_id,'funnel_version:'||v.id FROM media_usage u JOIN funnel_versions v ON u.owner_key='lead_page:'||v.page_id;
 CREATE TABLE funnel_domains(id INTEGER PRIMARY KEY,host TEXT NOT NULL UNIQUE,challenge TEXT NOT NULL,verified_at TEXT,page_id INTEGER REFERENCES lead_pages(id),created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
`});

migrations.push({version:14,name:'header_campaigns',sql:`
 ALTER TABLE content_items ADD COLUMN published_header TEXT CHECK(published_header IS NULL OR json_valid(published_header));
 UPDATE content_items SET published_header=json_object('slug',slug,'title',title,'position',position,'status',status,'data',json(data)) WHERE kind='hero' AND status='active';
 ALTER TABLE lead_submissions ADD COLUMN promotion_key TEXT;
 ALTER TABLE lead_submissions ADD COLUMN promotion_snapshot TEXT CHECK(promotion_snapshot IS NULL OR json_valid(promotion_snapshot));
 CREATE TABLE admin_notifications(id INTEGER PRIMARY KEY,submission_id INTEGER NOT NULL REFERENCES lead_submissions(id),stage TEXT NOT NULL CHECK(stage IN ('submitted','activated')),read_at TEXT,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(submission_id,stage));
 CREATE INDEX admin_notifications_unread ON admin_notifications(read_at,id);
`});

migrations.push({version:15,name:'direct_broadcasts_and_download_pages',sql:`
 CREATE TABLE broadcast_requests(request_key TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,campaign_id INTEGER NOT NULL REFERENCES campaigns(id),created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE download_pages(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',instructions TEXT NOT NULL DEFAULT '',button_label TEXT NOT NULL DEFAULT 'Download resource',media_id INTEGER NOT NULL REFERENCES media(id),image_id INTEGER REFERENCES media(id),status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active')),updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 ALTER TABLE download_tokens ADD COLUMN page_snapshot TEXT CHECK(page_snapshot IS NULL OR json_valid(page_snapshot));
`});

migrations.push({version:16,name:'email_workspace_libraries',sql:`
 ALTER TABLE newsletters ADD COLUMN workspace TEXT NOT NULL DEFAULT 'newsletter' CHECK(workspace IN ('newsletter','campaign'));
 ALTER TABLE newsletters ADD COLUMN archived_at TEXT;
 ALTER TABLE campaigns ADD COLUMN archived_at TEXT;
 UPDATE newsletters SET workspace='campaign' WHERE id IN (SELECT newsletter_id FROM campaigns WHERE lead_submission_id IS NULL AND automation_enrollment_id IS NULL);
 CREATE INDEX newsletters_library ON newsletters(workspace,archived_at,updated_at);
`});

migrations.push({version:17,name:'editorial_discovery',sql:`
 CREATE TABLE editorial_pages(id INTEGER PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('collection','guide')),slug TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','active','inactive')),position INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL CHECK(json_valid(data)),created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(kind,slug));
 CREATE INDEX editorial_public ON editorial_pages(kind,status,position,id);
`});

migrations.push({version:18,name:'shared_email_sending_limits',sql:`
 CREATE TABLE email_send_leases(id INTEGER PRIMARY KEY,sender_key TEXT NOT NULL,claimed_at INTEGER NOT NULL);
 CREATE INDEX email_send_leases_sender_time ON email_send_leases(sender_key,claimed_at);
`});

migrations.push({version:19,name:'private_website_visitor_aggregates',sql:`
 UPDATE content_items SET data=json_set(data,'$.answer',replace(json_extract(data,'$.answer'),'Browser advertising cookies, browser analytics and embedded social trackers are not enabled.','Advertising cookies and embedded social trackers are not enabled. Cookieless page counts and daily network visitor estimates may be enabled by the owner. DNT and Global Privacy Control are respected; opt out on the privacy page.')) WHERE kind='faq' AND instr(coalesce(json_extract(data,'$.answer'),''),'Browser advertising cookies, browser analytics and embedded social trackers are not enabled.')>0;
 CREATE TABLE website_visit_days(day TEXT PRIMARY KEY,page_views INTEGER NOT NULL DEFAULT 0,visitors INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE website_visit_paths(day TEXT NOT NULL,path TEXT NOT NULL,page_views INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,path));
 CREATE TABLE website_visit_keys(day TEXT NOT NULL,visitor_key TEXT NOT NULL,path TEXT NOT NULL,last_seen INTEGER NOT NULL,PRIMARY KEY(day,visitor_key,path));
`});

migrations.push({version:20,name:'email_delivery_feedback_and_controls',sql:`
 CREATE TABLE email_delivery_config(id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL CHECK(json_valid(config)),api_key TEXT,webhook_key TEXT);
 CREATE TABLE email_delivery_messages(id INTEGER PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('transactional','marketing')),job_id INTEGER NOT NULL,contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,recipient TEXT NOT NULL,message_id TEXT NOT NULL UNIQUE,transport TEXT NOT NULL,provider_message_id TEXT,accepted_at TEXT,delivery_status TEXT NOT NULL DEFAULT 'unknown',status_at INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(kind,job_id));
 CREATE INDEX email_delivery_provider_message ON email_delivery_messages(provider_message_id);
 CREATE TABLE email_delivery_events(id INTEGER PRIMARY KEY,provider_event_id TEXT NOT NULL UNIQUE,token_hash TEXT NOT NULL UNIQUE,message_id INTEGER REFERENCES email_delivery_messages(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('delivered','temporary_failure','bounced','complained','unsubscribed')),occurred_at INTEGER NOT NULL,received_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
`});

export function migrate(db: DatabaseSync): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  db.exec('BEGIN IMMEDIATE');
  try {
    const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(row => Number(row.version)));
    if ([...applied].some(version => !migrations.some(m => m.version === version))) throw new Error('Database schema is newer than this application');
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return migrations.at(-1)?.version ?? 0;
}

