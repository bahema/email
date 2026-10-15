# Operations guide

## Existing local installation

Keep the existing `.env`, database and uploads. Do not copy `.env.example` over `.env`. Do not regenerate the encryption key. From the repository root run `npm run db:migrate`, then `npm run dev`. The current migration version is 15. Migrations append changes and preserve existing contacts, campaigns and content. Create the admin only if absent with `npm run admin:setup`; use `npm run admin:reset` for terminal-controlled password recovery.

Development web: http://127.0.0.1:5173 ; admin: http://127.0.0.1:5173/admin/login ; API health: http://127.0.0.1:3001/api/health . The API starts both workers automatically. Keep this process running for scheduled campaigns and sequences. Optional standalone workers share the same database/key/configuration; they are not required alongside the API.

## Review without email delivery

Use `npm run preview` for the existing local website and admin with both email workers disabled. Normal form/admin actions still persist data. Stop preview before running `npm run dev` or production `npm start` for normal delivery. Do not run standalone workers while reviewing if delivery must remain paused. See [UX-DELIVERY.md](UX-DELIVERY.md) for publication, SEO and storage behavior.

## Prepare a public launch

1. Back up the existing installation as described below. Install Node 24.13 or later in Node 24, and use `npm ci` on a fresh deployment from the lockfile.
2. Use persistent paths for DATABASE_PATH and UPLOAD_DIR. Keep `.env` private. Run migrations before starting the deployed app. Build with `npm run build`.
3. Set SITE_URL to the HTTPS root origin, for example `https://your-domain.example`, NODE_ENV to production, and bind the API to loopback behind a TLS reverse proxy. Production login cookies require HTTPS. Set TRUST_PROXY=true only for exactly one trusted proxy hop and restrict direct access to the API port.
4. Set General timezone and Domains public URL in Settings to the intended public origin. This public link setting does not replace SITE_URL's trusted login origin. Configure SMTP host, port, encryption, sender/reply-to and credentials; use connection verification and an explicit test recipient. Set up the sender domain with your email provider before live campaigns. Add sender identity/footer, consent and legal text.
5. Replace fictional demo offers, partners, reviews and resource content. Review active content and private/public asset visibility. Demo sequences are paused; activate only the intended sequence. Preview newsletters at all three widths and test links/confirmation/download/unsubscribe using a consenting test inbox.
6. Run `npm start` with NODE_ENV=production under a service/process supervisor that restarts it on failure. Avoid duplicate unmanaged processes. Check `/api/health`, System worker heartbeats and pending/failed queues. Preserve subscriber tokens from logs: reverse-proxy access logs should redact `/confirm`, `/unsubscribe`, `/download` and email tracking token paths. The application sets no-referrer to avoid exposing token URLs to linked sites.

## Backup and restore

Back up the SQLite database, uploads and original encryption key together. The key decrypts SMTP credentials and queued transactional messages. Losing or replacing it makes those encrypted values unusable. Keep backups private and access-controlled because contacts and consent records are personal data.

For a simple consistent backup, stop the API and every standalone worker first. Verify those processes exited. Copy the configured database file, its `-wal` and `-shm` files if present, the complete configured upload directory and `.env` into a new dated backup directory. Do not copy a live SQLite database alone while writers are running. Defaults are `data/affiliate.sqlite` and `uploads/`, but check your configured paths privately before copying. Restart only after the copy finishes. Do not use demo seed or admin reset as a restore mechanism.

To restore, first stop all processes and preserve a separate copy of the current installation. Restore the matching database files, uploads and original `.env` key into the configured paths, with the same private permissions. Run `npm run db:migrate`, then start the application and check health, content, uploads, login and worker status. Restoring an older backup can reintroduce pending jobs whose messages were already accepted after that backup; keep workers stopped until those jobs are reconciled against retained provider/delivery records. Perform restore drills on an isolated copy with SMTP delivery disabled or a loopback capture server, not a production provider.

## Delivery and troubleshooting

- SMTP acceptance means the server accepted the submission, not that the recipient received it. Inspect the provider and test inbox for placement.
- A pending queue with SMTP not configured is expected. Set SMTP, then refresh System and logs. Scheduled jobs also wait until due. Sequence pause holds overdue sends and tag actions; page inactive prevents new signups only.
- An uncertain outcome after timeout/interruption is not automatically retried. Check the provider before creating a replacement campaign. This avoids silent duplicates.
- Unsubscribed/suppressed/bounced/complained contacts are excluded by backend eligibility checks. Manage suppression in Leads & tags; no automatic provider webhook ingestion exists in V1.
- Private resources must be uploaded as private and attached to the lead page. Only confirmation creates access. Grants expire after 24 hours and unsubscribe/suppression blocks access. Automated download placeholders create fresh grants for eligible sends.
- Referenced uploads and newsletters used in campaigns/sequences cannot be deleted. Remove editable references where allowed; retain campaign history.
- If login fails locally, use the exact configured origin or allowed loopback dev origin. In production check HTTPS, reverse proxy and SITE_URL. Password reset is a local terminal operation.
- Check request ID and sanitized API error codes. Never paste `.env`, encrypted payloads, tokens or SMTP passwords into support logs.

## Owner review before publishing

Check desktop and narrow mobile layouts, keyboard focus, form labels/errors, rich-editor selection, newsletter previews, menu/sidebar stacking, long content and reduced motion. Browser visual inspection could not be performed in the implementation environment. Run a real-provider confirmation → private download → scheduled email → click → unsubscribe test using an explicitly consenting test mailbox. Review starter legal text for your operation. Publication and real-provider delivery are not completed by the local build.


## GitHub and DigitalOcean deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the single-origin Linux service and TLS proxy configuration. GitHub stores source, not accounts, contacts, uploads or keys. DigitalOcean blocks SMTP ports 25, 465 and 587: Gmail SMTP cannot simply be moved from this local installation to a Droplet. Resolve provider-supported outbound delivery before enabling production workers.
