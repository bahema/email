export const phaseThreeSql = `
  CREATE TABLE media (
    id INTEGER PRIMARY KEY, filename TEXT NOT NULL, storage_name TEXT NOT NULL UNIQUE,
    mime TEXT NOT NULL, size INTEGER NOT NULL, extension TEXT NOT NULL, category TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),
    uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE content_items (
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('navigation','hero','offer','upcoming','faq','review','partner')),
    slug TEXT NOT NULL, title TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
    data TEXT NOT NULL CHECK(json_valid(data)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(kind,slug)
  );
  CREATE INDEX content_visibility_order ON content_items(kind,status,position);
  CREATE TABLE website_sections(key TEXT PRIMARY KEY,value TEXT NOT NULL CHECK(json_valid(value)));
  CREATE TABLE media_usage(media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE RESTRICT,owner_key TEXT NOT NULL,PRIMARY KEY(media_id,owner_key));
`;
export const phaseFourSql = `
  CREATE TABLE contacts (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    country TEXT NOT NULL, continent TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','confirmed','unsubscribed','bounced','complained','suppressed')),
    source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    confirmed_at TEXT,unsubscribed_at TEXT,last_open_at TEXT,last_click_at TEXT,last_confirmation_at INTEGER
  );
  CREATE INDEX contacts_status ON contacts(status);
  CREATE INDEX contacts_source ON contacts(source_type,source_id);
  CREATE INDEX contacts_created ON contacts(created_at);
  CREATE TABLE tags(id INTEGER PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE);
  CREATE TABLE contact_tags(contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,PRIMARY KEY(contact_id,tag_id));
  CREATE TABLE lead_submissions (
    id INTEGER PRIMARY KEY,contact_id INTEGER NOT NULL REFERENCES contacts(id),name TEXT NOT NULL,country TEXT NOT NULL,
    source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_label TEXT NOT NULL,
    consent_text TEXT NOT NULL,utm TEXT NOT NULL CHECK(json_valid(utm)),tags TEXT NOT NULL CHECK(json_valid(tags)),
    confirmed_at TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX lead_submissions_contact ON lead_submissions(contact_id,created_at);
  CREATE TABLE contact_tokens (
    token_hash TEXT PRIMARY KEY,contact_id INTEGER NOT NULL REFERENCES contacts(id),submission_id INTEGER REFERENCES lead_submissions(id),
    purpose TEXT NOT NULL CHECK(purpose IN ('confirm','unsubscribe')),resubscribe INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,consumed_at TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX contact_tokens_contact ON contact_tokens(contact_id,purpose);
  CREATE TABLE transactional_outbox (
    id INTEGER PRIMARY KEY,contact_id INTEGER NOT NULL REFERENCES contacts(id),token_hash TEXT NOT NULL REFERENCES contact_tokens(token_hash),
    purpose TEXT NOT NULL CHECK(purpose IN ('confirmation','unsubscribe_link')),payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed','cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,scheduled_at INTEGER NOT NULL,claimed_at INTEGER,sent_at TEXT,last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX transactional_outbox_due ON transactional_outbox(status,scheduled_at);
  CREATE TABLE worker_heartbeats(name TEXT PRIMARY KEY,seen_at INTEGER NOT NULL);
  ALTER TABLE events ADD COLUMN contact_id INTEGER REFERENCES contacts(id);
  CREATE INDEX events_contact ON events(contact_id,created_at);
`;
