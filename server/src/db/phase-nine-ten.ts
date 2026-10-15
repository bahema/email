export const finalSql=`
 ALTER TABLE automation_steps ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags));
 ALTER TABLE campaigns ADD COLUMN automation_tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(automation_tags));
 CREATE INDEX email_queue_sent ON email_queue(sent_at) WHERE status='sent';
 CREATE INDEX outbox_sent ON transactional_outbox(sent_at) WHERE status='sent';
 CREATE INDEX lead_submissions_source_created ON lead_submissions(source_type,created_at,source_id);
`;
