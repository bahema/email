# Railway deployment

For the current existing installation, use [the reviewed email release sequence](EMAIL-DELIVERY-RELEASE.md). Preserve the live database; initial migration instructions below are not an instruction to overwrite it with local data.

Deploy the repository root as one always-running service. The Dockerfile builds the public frontend, server renderer and backend with Node 24. The backend serves them together and runs both mail workers. Keep one replica while using SQLite and local uploads; do not enable service sleeping/serverless for scheduled delivery.

## Configure before starting

Attach a persistent volume at `/app/persistent`. Set these Railway variables:

```text
NODE_ENV=production
HOST=0.0.0.0
SITE_URL=https://berliaon.com
TIMEZONE=Africa/Kigali
DATABASE_PATH=/app/persistent/data/affiliate.sqlite
UPLOAD_DIR=/app/persistent/uploads
SESSION_HOURS=8
TRUST_PROXY=true
```

Railway supplies PORT. Set TRUST_PROXY=true only when Railway is the single trusted proxy to the application; review this if introducing another proxy. Set SETTINGS_ENCRYPTION_KEY privately to the existing original key. Never commit it or paste it into a ticket or chat. For a controlled upgrade, keep PREVIEW_ONLY=true until existing pending jobs and the selected transport have been reviewed. Set it false only when you intend to release those jobs. The admin sending pause is an additional independent control.

## Preserve the current account and content

GitHub deliberately contains no live database, uploads or secrets. Do not run admin setup against an empty production database if you intend to preserve the current account.

1. Make a verified consistent SQLite backup using the SQLite backup API, or stop all local writers and checkpoint/close the database before copying. Do not copy only the main file while writers are active in WAL mode.
2. Transfer that database and the current uploads privately to the mounted volume at the paths above. Preserve a separate backup before any migration. Preserve the original encryption key separately.
3. Review pending email jobs and previously captured localhost origins before enabling workers. Old emailed links and captured acquisition origins do not rewrite automatically.
4. Start the service; schema migrations run automatically. Confirm the existing administrator can log in. A fresh installation instead requires one terminal admin setup, never public signup.

## Domain, email and verification

Add the custom domain in Railway and publish the exact verification/routing records Railway supplies. Retain Namecheap Private Email MX/SPF/DKIM/DMARC records. Railway provisions HTTPS after domain verification. If validating first on a generated Railway domain, use that HTTPS origin as SITE_URL instead until the final domain is ready.

In admin Settings, update General site URL, Domains public link URL, policy URLs, public image URLs and remaining default branding to the deployed origin. These saved values in an existing database do not automatically change when SITE_URL changes.

Railway SMTP requires Pro or above. Retain Namecheap SMTP only after testing outbound connectivity and actual delivery; Hobby/Free/Trial require an HTTPS email-provider integration instead. The optional Mailgun adapter is available locally, but sending is held until specific approval for affiliate marketing is recorded; do not assume the provider permits this business model. See https://docs.railway.com/networking/outbound-networking.

Verify health, login, uploaded media, confirmation, linked lead email, protected downloads, unsubscribe and backups. Confirm authentication using an actual received email's SPF/DKIM/DMARC results. Configure volume backups and retain the encryption key separately. This repository does not provision a volume, migrate data, publish DNS or create a Railway project automatically.
