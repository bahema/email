export const phaseFiveSql = `
 CREATE TABLE newsletters (
   id INTEGER PRIMARY KEY,title TEXT NOT NULL,subject TEXT NOT NULL,preheader TEXT NOT NULL DEFAULT '',html TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready')),
   created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
   updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 );
 CREATE TABLE segments (
   id INTEGER PRIMARY KEY,name TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('and','or')),
   rules TEXT NOT NULL CHECK(json_valid(rules)),
   created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
   updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 );
`;
export const phaseSixSql = `
 CREATE TABLE campaigns (
   id INTEGER PRIMARY KEY,name TEXT NOT NULL,newsletter_id INTEGER NOT NULL REFERENCES newsletters(id),
   audience TEXT NOT NULL CHECK(json_valid(audience)),snapshot TEXT CHECK(snapshot IS NULL OR json_valid(snapshot)),
   status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','sent','paused','failed','cancelled')),
   scheduled_at INTEGER,resolved_at TEXT,completed_at TEXT,
   created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
   updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 );
 CREATE INDEX campaigns_due ON campaigns(status,scheduled_at);
 CREATE TABLE email_queue (
   id INTEGER PRIMARY KEY,campaign_id INTEGER NOT NULL REFERENCES campaigns(id),contact_id INTEGER NOT NULL REFERENCES contacts(id),
   newsletter_id INTEGER NOT NULL REFERENCES newsletters(id),recipient TEXT NOT NULL,subject TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed','cancelled')),
   attempts INTEGER NOT NULL DEFAULT 0,scheduled_at INTEGER NOT NULL,claimed_at INTEGER,sent_at TEXT,last_error TEXT,
   tracking_token_hash TEXT UNIQUE,track_opens INTEGER NOT NULL DEFAULT 0,track_clicks INTEGER NOT NULL DEFAULT 0,
   opened_at TEXT,clicked_at TEXT,
   created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(campaign_id,contact_id)
 );
 CREATE INDEX email_queue_due ON email_queue(status,scheduled_at);
 CREATE INDEX email_queue_contact ON email_queue(contact_id,campaign_id);
 CREATE TABLE email_links (
   queue_id INTEGER NOT NULL REFERENCES email_queue(id),ordinal INTEGER NOT NULL,destination TEXT NOT NULL,
   PRIMARY KEY(queue_id,ordinal)
 );
`;
