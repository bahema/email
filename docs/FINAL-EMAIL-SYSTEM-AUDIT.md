# Final email-system audit — phase 1

## Scope and result

The complete isolated backend/client suite passed 223 automated checks. Tests used in-memory or temporary databases, fake recipients and loopback SMTP capture. They did not submit real subscriber signups, send to the production mailbox, change live consent records or launch real campaigns. Source changes include a non-destructive schema migration (18) adding a sending-limit lease table; a running development watcher can apply that migration when reloading.

This is engineering verification, not a guarantee of 100% security, legal compliance, inbox placement, provider acceptance or browser accessibility. Production deployment and real authenticated inbox verification remain outstanding.

## Repairs

1. Independent consent journeys: a person may request several offers using one normalized email address. Each submission now retains its own confirmation token. Resending rotates only that submission’s token; confirming one offer does not cancel another offer’s queued confirmation. A separate single-opt-in request no longer erases pending double-opt-in requests.
2. Confirmation pacing: distinct offers requested close together queue separate confirmation emails at least one minute apart using the saved scheduled time. Repeating the same pending or completed journey remains deduplicated. Per-contact cooldown and global send limits are separate controls.
3. Shared provider allowance: transactional confirmations, automatic lead emails, sequence messages and campaigns reserve allowance in the same durable SQLite table and atomic job-claim transactions. Defaults are 450 automatic attempts/hour and 8/minute. Excess work remains pending with no attempt consumed. Failed/uncertain reserved attempts conservatively retain allowance. These defaults must match the actual provider plan; other apps, webmail and manual test buttons also use the provider’s mailbox allowance but are not counted by this automatic-worker lease. Allow headroom and use the provider’s actual limits. Historical sends before the upgrade are not retroactively entered into the lease table.
4. Hero-source validation now matches the public renderer: a forged signup cannot use an affiliate-only hero as a Subscribe promotion merely because stale inline settings remain stored.
5. Settings now provide a DKIM-selector preference and owner-only read-only DNS checks. SPF, DKIM and DMARC records are still published at the DNS provider. Detection means records are present at the queried names, not that real email signatures or alignment pass. Missing, duplicate, invalid and lookup-unavailable results are distinguished. Queries are bounded and rate limited.
6. Admin queued-confirmation feedback now says that queue acceptance is not a delivery receipt. Obsolete settings-preview guidance about editable system confirmations was corrected.

## Verified journey matrix

| Area | Automated evidence |
|---|---|
| Homepage newsletter and footer | Consent, normalized contact identity, confirmation, repeated request deduplication |
| Hero/header signup and popup source | Active published source, stable promotion identity, linked journey, tags and notifications |
| Product and upcoming-item signup | Validated active source and consent; shared confirmation path |
| All 36 lead-page purposes | Compatible publication/schema and shared rendered form flow; specialized questions and source handling |
| Double opt-in | No related offer campaign before confirmation; explicit POST; expiry; replaced-token rejection; repeat confirmation idempotency |
| Single opt-in | Explicit consent, no false ownership-verification claim; opted-out contacts require confirmation again |
| Several offers, same address | One contact, independent requests/tokens, no cross-offer cancellation; one immediate campaign per activated submission |
| Connected offer email | Ready-template connection required, frozen acquisition content, correct recipient, no retry-created duplicate campaign |
| Sequences | Delays, pause/resume, frozen enrolled steps, persistent state and cancellation; one enrollment per contact/sequence |
| Saved newsletters and campaigns | Scoped libraries, frozen sent content, direct continent audiences, confirmed-only selection, safe archive/delete restrictions |
| Free download | Confirmation required, frozen private resource, opaque expiring grants and rejection after opt-out/expiry/forgery |
| Opt-out and suppression | Visible unsubscribe, RFC 8058 POST, scanner-safe GET, queued-message cancellation and blocked reactivation |
| Workers | Durable claims, restarts, shared send limits, safe connection retry and no automatic retry after ambiguous SMTP acceptance |
| Sender and Reply-To | Actual loopback SMTP capture asserts separate From and Reply-To headers for confirmation and marketing, plus multipart text/HTML and one-click unsubscribe headers |
| Security and data exposure | Admin authentication/CSRF; no public SMTP credentials, account hashes or subscriber data in audited public responses; encrypted SMTP/outbox secrets; escaped HTML and metadata; private-file access checks |

The same template can intentionally appear in an immediate email and later sequence steps; those are explicitly configured sends, not worker duplicates. Review the selected immediate email and sequence curriculum when configuring a funnel. A sequence is enrolled once per contact, even if multiple requested offers connect to the same sequence.

## Settings you can use

- Email / SMTP: host, port, TLS/STARTTLS, username, password, sender name/address, Reply-To, automatic hourly limit and automatic per-minute limit.
- Domains / URLs: public HTTPS link origin and DKIM selector. Choose the exact selector supplied by the email provider (newer Namecheap plans commonly use privateemail; older plans may use default).
- SMTP or Domains panel: Check saved sender DNS. Save changed sender/domain fields before checking.
- Email branding/footer: identity, address, public contact details, social profiles and confirmation branding.
- Compliance: consent mode and text, unsubscribe footer and public policy links.
- Email status panel/logs: distinguish queued, processing, SMTP-accepted, failed and cancelled delivery. Sent is not an inbox-placement receipt.

## Before public launch

1. Publish and verify the provider-generated DKIM record and an appropriate DMARC policy; retain one consolidated SPF record. Verify actual received headers, not only TXT presence. Monitor bounce/complaint notices and use contact suppression; automatic provider bounce/complaint ingestion is not implemented.
2. Deploy the app and configure public DNS, HTTPS, trusted SITE_URL, persistent database/uploads, the original encryption key, backups, proxy trust and continuously running workers.
3. Resolve hosting compatibility: the app currently sends through SMTP. DigitalOcean Droplets block standard SMTP submission ports, so choose compatible hosting or implement/test an HTTPS delivery-provider integration before relying on email there.
4. Replace localhost URLs with the deployed origin for new acquisitions. Already sent emails and captured funnel origins are intentionally preserved; old local test acquisitions are not proof of a valid production journey.
5. Use an owner-authorized real inbox to verify SPF/DKIM/DMARC alignment, branding/images, Reply-To, confirmation, correct offer/sequence, protected download and unsubscribe from the deployed domain.
6. Replace demo content and supply accurate business identity, address, privacy, terms and affiliate disclosures. Confirm the provider allows the intended consent-based marketing and volumes.

Limitations: no actual browser interaction/screenshot audit was performed in this phase. SMTP acceptance may precede an opt-out occurring during an already in-flight send; the system cannot recall a message handed to the provider. External mailbox reputation, spam filtering, provider policy and real production DNS/SSL are not certified by isolated tests.

## Verification records

Automated output: .agent-churn-control/final-email-tests.log. Build output: .agent-churn-control/final-email-build.log. Repository hygiene output: .agent-churn-control/final-email-repository.log. Local diagnostic evidence is intentionally ignored by Git and does not belong in a public repository.

Production browser, SSR and backend builds passed. The repository hygiene scan flagged no prohibited private files or recognized secret patterns in its scanned candidate. A post-build read-only smoke check confirmed the running API is healthy on schema version 18 and unauthenticated DNS diagnostics return HTTP 401. Normal development mode was left running; no paused review server was started.
