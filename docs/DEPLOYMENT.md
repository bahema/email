# GitHub and DigitalOcean deployment

This is a single-owner application, with one SQLite database and local uploads. Deploy the built frontend and API together on one Linux server behind HTTPS. GitHub is the source repository; GitHub Pages alone is not a deployment for this application. Horizontal replicas and ephemeral filesystems are not supported by this deployment.

## Mail delivery is a launch blocker on DigitalOcean

DigitalOcean documents blocked outbound SMTP ports **25, 465 and 587** on Droplets. Local Gmail SMTP success does not validate a Droplet deployment. This app currently uses SMTP, not an HTTPS provider API. Use a provider-supported alternative submission port with TLS, and test it from the actual server; otherwise an HTTPS mail-provider transport must be implemented after choosing that provider. Do not disable encryption, use an unofficial Gmail proxy, or assume firewall settings can lift the provider restriction.

Official guidance: https://docs.digitalocean.com/support/why-is-smtp-blocked/ .

## Source and server setup

1. Commit only source, lockfile, documentation and example configuration. Never add `.env`, the real environment file, databases, uploads, keys or backups. `.gitignore` excludes them. GitHub should not receive subscriber information. Before a first push, inspect `git diff --cached --name-only`.
2. On a Linux Droplet, install supported Node 24 (24.13 or later within 24), npm and Caddy. Create a dedicated `affiliate` service user. Place the checkout at `/opt/affiliate-engine`, with persistent private storage at `/var/lib/affiliate-engine/data` and `/var/lib/affiliate-engine/uploads`, writable by that user. Verify the Node executable path with `command -v node` and update `ExecStart` if necessary.
3. In the checkout run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Do not run the development server in production. The build must include both `client/dist` and `client/dist-ssr` and the backend output.
4. Copy `deploy/environment.example` to `/etc/affiliate-engine/environment`, owned by root and mode 0600. Replace the hostname and original encryption key privately. For a completely fresh installation, generate a new private key using security:setup in development mode before configuring production. For a restored installation, retain the original key. Do not commit this file. Keep `PREVIEW_ONLY=true` during migration. The service manager reads this file before changing to the service user.
5. Restore the existing database and uploads using the backup procedure in OPERATIONS.md. Preserve the original encryption key. If starting with an empty database, run migrations and `npm run admin:setup` once through SSH as the service user, with the same environment loaded privately. CLI commands do not automatically read `/etc/affiliate-engine/environment`; supply the variables in the shell or a private root `.env` readable by the service user. Do not paste keys into shell history. Never regenerate a key for restored encrypted data.
6. Install `deploy/affiliate-engine.service` in `/etc/systemd/system/`. Install Caddy's configuration using `deploy/Caddyfile.example` with the real hostname. Point DNS to the server. Allow public ports 80/443 and restrict SSH; the API binds only to loopback. Restrict access to the server and the backup storage.
7. Run `systemctl daemon-reload` and `systemctl enable --now affiliate-engine`. Caddy must obtain a valid TLS certificate before admin login. Set Settings → Domains → public URL to the same HTTPS origin and update actual sender/contact/legal information. `SITE_URL` is the trusted admin origin; changing only the admin public URL field does not change login-origin security.
8. Review stored pending jobs before releasing them. Do not release local test campaigns or confirmations containing localhost URLs; after setting the public origin, request fresh confirmation links where appropriate and cancel unwanted campaigns. Verify the deployed confirmation, product sharing, private download and unsubscribe with your own consenting test mailbox. After outbound delivery is proven, set `PREVIEW_ONLY=false` and restart the service. The main service starts both workers; no standalone worker is needed. This switch resumes eligible pending jobs, so reconcile any restored jobs first.

## Account persistence

The admin account and password hash are stored in SQLite, not in GitHub or the frontend. Restoring the current database preserves the current sole-admin login. A source-only fresh installation needs `npm run admin:setup` once. There is no public signup route. Sessions expire; the account remains across restarts and code updates while its database is retained. Terminal recovery is `npm run admin:reset`, which revokes all login sessions. Storage loss without a valid backup loses the account and business data.

## Updates and recovery

Before updates, back up database, uploads and key consistently; stop every writer for the documented file-copy backup. Install and build the new code, then restart the managed service. Startup applies missing migrations. Never overwrite the database, run demo seeding in production, or replace the encryption key. Retain earlier domain routes used in previously sent emails until their promises expire. Keep access logs disabled or redact complete subscriber/token URLs, including `/downloads`, `/confirm`, `/unsubscribe`, `/download`, and `/email`.

## Verification limits

Local passing tests do not certify a public deployment. Verify HTTPS, DNS, proxy behavior, backups/restore, sender-domain authentication, provider restrictions and actual inbox delivery. Review privacy/affiliate/marketing requirements for your audience. No billing or tenant accounts are included. Optional authenticated Mailgun API/feedback support is described in EMAIL-DELIVERY-RELEASE.md; it is inactive by default and requires provider approval. Private Email SMTP alone does not supply automatic provider feedback.
