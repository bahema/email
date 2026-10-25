# Email delivery controls and GitHub → Railway release

Status: implemented and checked locally; not committed, pushed or deployed. No live emails or provider accounts were created. SMTP remains the default. The optional API transport requires separate provider setup and explicit approval for affiliate-marketing use.

## What changed

Settings → Delivery controls & feedback provides a persisted sending pause, SMTP/Mailgun transport selection, encrypted API and webhook signing-key placeholders, a callback URL, delivery-state totals and recent-message history. Sender name/email, Reply-To and shared sending limits remain in Sender / SMTP. Campaigns, newsletters, confirmations, lead-page delivery and sequences continue through the existing queues and renderers.

The shared Email engine panel on campaigns, newsletters, settings and logs can pause/resume all queued sending. Pending jobs are retained. An already in-flight submission can finish. Explicit manual test messages remain separate. `PREVIEW_ONLY=true` is an independent environment-level hold and cannot be overridden by the admin button. Resuming may release eligible pending jobs, so inspect the displayed queue counts and campaign schedules first.

The new delivery ledger separates provider acceptance from feedback. Provider-reported delivery means the recipient mail server accepted the email, not that it landed in Inbox or was read. Earlier messages without a ledger/feedback record remain unverified. Main delivery logs and CSV exports include recorded feedback and transport when available.

## Optional HTTPS adapter and provider restriction

Mailgun was implemented as an optional, inactive HTTPS/MIME adapter. It is not a recommendation to use an unapproved account. Mailgun's acceptable-use policy restricts affiliate marketing unless it grants specific approval: https://www.mailgun.com/legal/aup/. The adapter cannot send until the owner explicitly records provider approval. Domain/API verification can be attempted without claiming approval; production sending and manual API test emails require it.

Private Email SMTP does not generate Mailgun webhooks. To obtain automatic delivery/bounce/complaint reporting, an approved compatible provider must be configured. If another provider is chosen, add and test its specific transport/signature adapter; do not paste another provider's key into Mailgun fields. Keeping Private Email SMTP preserves the current workflow and owner suppression tools, but does not create automated Private Email feedback.

Required Mailgun inputs, if specifically approved:

- Verified sending domain and correct US/EU region.
- API key. The connection check performs a domain lookup and may need broader permissions than a sending-only key. This check is separate from message submission.
- HTTP webhook signing key, separate from the API key.
- JSON event callbacks for delivered, temporary/permanent failure, complaints and unsubscribes, directed to the exact saved HTTPS callback URL displayed in admin.
- Existing sender/Reply-To and provider-appropriate rate limits.

Provider DNS records must be supplied by the chosen provider and reviewed alongside the existing Private Email MX/SPF/DKIM/DMARC records. Do not replace MX records merely to enable an outbound API, and do not create multiple SPF records. Provider approval, domain verification, real inbox placement and account quotas require external validation.

## Security and duplicate handling

- Keys are encrypted separately with AES-256-GCM using the original installation key and distinct contexts. Admin responses expose only saved-key flags. Blank input preserves keys; explicit removal clears them.
- Admin configuration/pause endpoints require the existing owner session, CSRF and origin protections.
- API credentials go only to fixed HTTPS Mailgun US/EU endpoints. Redirects are rejected. MIME generation disables filesystem and remote URL access. Inline system-logo bytes are preserved.
- Callback verification follows Mailgun HMAC-SHA256 over timestamp + token with timing-safe comparison, a bounded timestamp window and persisted token/event deduplication. The provider's documented signature authenticates timestamp/token, not a raw-body signature; TLS, key secrecy and message binding remain essential.
- Events must match a recorded Mailgun message/provider ID and the recipient fingerprint. Unknown messages/recipients cannot change contacts. Raw callback payloads, email bodies and signing keys are not stored in event history.
- Permanent bounces and complaints suppress further sending and cancel pending jobs. Temporary failures do not suppress contacts or trigger a duplicate submission. Late delivered events cannot reactivate suppressed contacts.
- Uncertain API outcomes are not automatically retried. A later verified callback can reconcile the submission without sending it again. In-flight callback/API-response races are covered by tests.
- Switching back to SMTP does not discard enabled feedback for previously sent Mailgun messages. Disable feedback explicitly or remove the signing key to stop that endpoint.

W3C/WAI guidance is applied to labels, fieldsets/legends, focus, responsive layout and status/error announcements. This is not a universal security or WCAG certification. Backend controls additionally follow authentication, secret-handling and replay-protection principles. SMTP/API email HTML and unsubscribe headers remain on the existing renderer path.

## Local validation

Run `npm run build`, `npm test`, `node --import tsx --test client/test/*.test.ts`, `npm run repository:check`, and `node scripts/production-smoke.mjs`. The smoke check uses isolated temporary data with delivery paused. Existing SMTP capture tests do not send to public inboxes. New HTTPS tests use mocked provider requests.

Tests cover schema 18 → 20 preservation, original SMTP secret/admin hash preservation, confirmation and campaign pause/resume, authenticated configuration APIs, secret redaction, forged/stale/repeated callbacks, recipient binding, out-of-order events, bounce/complaint suppression, CID-logo/Reply-To/unsubscribe MIME, unknown API outcomes and late feedback reconciliation. New SMTP/API admin-form snapshots were checked with Nu HTML Checker: zero errors and warnings. This checks markup, not every browser/screen-reader interaction.

## Prepared release sequence — perform only after review

1. Choose the production sending approach: existing Private Email SMTP on a Railway plan with SMTP access, or a provider that explicitly approves this business model. Mailgun activation requires its specific approval; alternatively select another approved provider and implement its adapter first.
2. Resolve Railway management access. At the last attempted inspection, the connector returned `missing link_id` and CLI authentication was unavailable. Public production health responded successfully with schema 18. This is not verification of current Railway variables, plan, logs or worker state.
3. Back up the **current Railway** database and uploads consistently; preserve the original encryption key separately and verify restoration. Confirm the existing volume paths and one-replica configuration. Do not replace the online database with the local database or run demo seeding/admin setup over the current installation.
4. Hold production sending with `PREVIEW_ONLY=true` before an upgrade when queue review is required. Review pending confirmations/campaigns, scheduled jobs and stored public origins. This file does not set that variable automatically.
5. Review the source diff on a release branch. Databases, uploads, `.env`, backups and `.agent-churn-control` must remain excluded. The accidental nested `email/` copy is now excluded by Git and Docker. Commit the intended application files and tests only.
6. Open a PR and let the existing GitHub CI run its Linux install, typecheck, server/client tests, build, production smoke and dependency audit. Keep production secrets out of CI. A push to Railway's connected production branch may deploy automatically; confirm its branch before merging.
7. With explicit deployment authorization, deploy that reviewed commit from the repository root using the existing Dockerfile. Keep the volume, original key, domains, SMTP settings and owner account. Startup applies additive migrations 19 and 20. A schema 18 upgrade is covered by a preservation test. Schema 19 counts visitor aggregates; schema 20 adds delivery-control/feedback tables.
8. Check Railway build/startup logs, `/api/health` (schema 20), existing admin login, public pages/media, health products, share exports and provider controls while sending is held. Do not restore a pre-migration database while a writer is running. For rollback, use a reviewed matching code/database backup; old code intentionally refuses a newer schema.
9. Configure an approved provider only if chosen. Save secrets privately in the admin password fields. Verify DNS and sender setup with the provider. Run explicit tests only to an inbox you own and authorize; do not paste keys into chat or GitHub.
10. Test one real public subscription, confirmation, connected lead-page email/download, sequence and unsubscribe. Verify a provider event on the actual production callback if feedback is enabled. Check suppression and inspect the recorded statuses.
11. Once external tests and queued jobs are reviewed, release the environment-level hold and admin pause deliberately. Monitor provider feedback, failure logs, queue counts and backups. Neither SMTP acceptance nor a successful build proves inbox placement.

Reference documentation: W3C form notifications (https://www.w3.org/WAI/tutorials/forms/notifications/), Mailgun HTTP/MIME sending (https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-http), webhook signatures (https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks), Railway outbound networking (https://docs.railway.com/networking/outbound-networking).
