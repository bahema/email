# Final security, compatibility and launch audit

Audit date: 8 October 2026. Subsequent video, duplicate-signup and palette work is documented in [HERO-SIGNUP-ADMIN-UPDATE.md](HERO-SIGNUP-ADMIN-UPDATE.md), with 126 passing backend tests. This report supersedes outdated workflow descriptions in earlier phase reports. This is a single-owner affiliate and email marketing application, not a multi-tenant service with billing or customer accounts.

## Outcome

The core marketing journeys are implemented and tested locally. Confirmed security/configuration gaps were repaired. Public launch still depends on accurate business content, a public HTTPS origin, outbound delivery from the chosen host, sender authentication and a real consenting inbox test. No claim of 100% security, legal compliance, Google approval or inbox placement is justified by these checks.

## Repairs in this audit

- Public website-setting URLs reject embedded usernames/passwords. Logo URLs reject private download and admin endpoints.
- Production configuration refuses plain-HTTP SITE_URL and a missing encryption key, rather than accepting an insecure login deployment.
- Every API response receives Cache-Control: no-store, covering owner lists as well as settings/session routes. Admin authorization remains enforced by the backend.
- Git excludes generated SSR output, local audit artifacts, databases, backup directories and common private-key formats, in addition to environment files and uploads.
- Added `npm run repository:check`, which checks Git's included-file inventory for private/generated files and known key/token patterns without printing matching secret values. This is a bounded scan, not proof that arbitrary secrets cannot exist.
- Added a read-only GitHub CI workflow for source checking, type checking, backend/client tests, build and production dependency auditing. It has no production secrets, deployment step or live mail sender.
- Added a dedicated-user systemd service, loopback/TLS proxy example, private production environment example and deployment instructions. The service starts in delivery-paused review mode until explicitly configured otherwise.
- Updated stale instructions concerning fixed confirmation branding, marketing headers, direct continent sending, page presets, page journey overrides and protected download landing pages.

## Compatibility and duplicates

There is one owner account, one normalized contact database, one reusable newsletter store and one shared marketing delivery engine. Newsletters and Campaigns reuse the continent-send control and saved-email overlay; they do not have separate recipient databases. Lead-related emails and sequences go through the same eligibility, queue, throttle, tracking and unsubscribe checks as manual campaigns.

Repeated direct-send requests with the same request key are idempotent. Campaign/contact jobs and automation enrollments have uniqueness constraints. Repeated confirmation actions do not launch duplicate connected campaigns. Pending older confirmation jobs are cancelled when tokens rotate; queued system confirmations render the current fixed template. Existing captured promises and already-launched campaign snapshots intentionally remain stable after edits. Previously sent messages cannot be recalled.

Protected download newsletters are rejected for ordinary broadcasts. Download pages require double opt-in and a ready connected email containing the protected placeholder. Download grants require a confirmed contact and submission, expire, and stop working after unsubscribe/suppression. A bearer link can be used by anyone holding it while valid; this is controlled access, not DRM or recipient login.

The main API process starts both workers. Optional standalone workers share atomic claims and a common throttle, but are unnecessary in the supplied deployment. SMTP acceptance is recorded; an ambiguous transport result is not silently resent. SMTP cannot provide a universal exactly-once or inbox-delivery guarantee.

## Security and information boundaries

Admin passwords use salted scrypt hashes. SMTP passwords and transactional message payloads are encrypted at rest using the installation's private key. Session and subscriber bearer tokens are hashed in the database. Authentication is independently required on owner APIs; state-changing owner requests additionally need CSRF protection. Production cookies are HttpOnly, Secure and SameSite=Strict. Login is rate-limited. Public setup/signup cannot create an administrator.

Public bootstrap/settings routes exclude owner login email, password hash, SMTP username/password and encrypted credentials in the regression fixture. Subscriber lists and delivery/activity logs are private. Logs omit message payloads and bearer credentials. Public subscriber-activity summaries suppress small groups; they do not display names or email addresses. Uploads validate allowed types/signatures and private assets are not available through public media routes. File validation is not malware scanning.

A separate built production instance with an empty fixture database and paused workers verifies that `.env`, Git configuration, database files, server source and invalid private-download routes are unavailable. It does not inspect or alter the live owner's database or send mail.

The server, encryption key, database and backups still need restricted host permissions. Keep bearer URLs out of proxy access logs. There is no admin MFA or automated provider bounce/complaint webhook ingestion; provider events require manual suppression unless an integration is added. Local rate-limit counters reset with the process. No automated retention/erasure schedule is configured. These are boundaries of the current system, not features falsely claimed to exist.

## Google, cookies and shared item cards

Item detail and lead-page HTML includes title, description, canonical URL, Open Graph title/description/URL/image, Twitter card metadata and applicable site/page/breadcrumb JSON-LD before JavaScript runs. Robots and sitemap routes exist. Admin, API and subscriber/token routes are excluded from indexing. These are metadata tags, not hashtags. Share the public `/resources/offer/...` or `/resources/upcoming/...` detail URL, not `/go/...` or a private subscriber link.

A card preview needs a publicly reachable page and image; localhost cannot produce an external platform preview. Preview services cache results and control their rendering. Google can select different titles/snippets and does not guarantee rich results or ranking because tags exist. There is no claim of Amazon-style Google product rich results or fabricated product ratings.

Only necessary owner-session storage and an optional remembered storage-notice preference are implemented. The preference is saved only after choosing to remember it and can be removed; ordinary browsing does not require owner login. No optional browser analytics, advertising cookies or embedded social widgets are active. Email open/click and server event tracking are separate settings and must be accurately described in the policy. Adding advertising or third-party trackers later needs a fresh consent/privacy review.

Gmail sender guidelines also depend on DNS authentication, accurate identity, recipient consent, complaint rates and unsubscribe behavior. The code supplies unsubscribe links and one-click headers; it cannot configure sender DNS or certify inbox placement from localhost.

## What is editable in admin

| Visitor-facing area | Owner controls |
| --- | --- |
| Branding and palette | Website identity, public logo, theme colors |
| Navigation and headers | Links, active header, ads/slides, layouts, colors, media, signup connection and CTAs |
| Product/resource pages | Titles, descriptions, images, categories, prices/badges, conditions, delivery information, highlights/specifications, FAQs and affiliate destinations |
| Trust and support content | FAQs, testimonial cards/avatars, partner logos/links, section copy, footer contact/address/social/helpful links and legal copy |
| Lead pages | Preset, sections, text, media, products, forms/questions, journey, consent connection, ready related email, automation, protected resource and publishing |
| Download pages | Page title, description, instructions, cover, button text, private file and active/draft state |
| Marketing emails | Saved editable HTML/subject/preheader and connected emails; the required unsubscribe footer remains enforced |
| System confirmation | Fixed system body and personalized logo/greeting header; shared identity/footer and confirmation header background are configurable |

The entire client is **not 100% editable**: layout implementations, validation/error labels, security messages, privacy-storage explanations, required subscription controls and fixed system confirmation structure remain code-controlled. This is intentional for reliable operation. The marketing/content areas above are editable; there is no arbitrary page-code editor.

## Current public content blockers

Read-only checks of the running local public API found schema version 15, 30 public items, 11 obvious published demo/fictional entries and one active funnel. Footer address and contact details are empty, and no social profile URLs are configured. Privacy/terms/disclosure text lengths are 120/55/114 characters; starter policy wording remains. The canonical origin is still local HTTP. These values were reported without reading subscriber records or secrets, and no invented business identity was substituted.

Replace sample claims with verified content. Enter only your actual public address/contact and social profiles. Write policies describing your real processing and audience, including consent, tracking, retention/contact rights and affiliate arrangements. Set the real HTTPS public URL and reachable public image URLs before external promotion. Review pending local messages: older captured localhost links do not become public simply because the setting changes; use fresh confirmations and cancel unwanted test campaigns before releasing delivery. Local tests cannot provide legal approval.

## GitHub, DigitalOcean and account persistence

See [DEPLOYMENT.md](DEPLOYMENT.md) and `deploy/` for installation and update steps. Deploy frontend and backend on one origin; source-only GitHub Pages cannot run the database, owner APIs or workers. Keep SQLite/uploads on persistent storage and back up them together with the original encryption key. This single-server deployment is not configured for horizontal replicas.

DigitalOcean currently blocks Droplet SMTP ports **25, 465 and 587**. Gmail SMTP on 465/587 therefore cannot be assumed to work there. The current transport supports another provider's TLS submission port, but the provider and actual host must be verified. An HTTPS provider transport is not yet implemented. Resolve this before releasing queued production email; the example service is initially paused for this reason.

Your account is stored in SQLite and persists across restarts and application updates while that database is retained. Moving the current database preserves the existing sole-admin login. Move the matching uploads and original encryption key too. If deploying only GitHub source to an empty database, create the sole admin once through SSH/terminal using `npm run admin:setup`; there is no public registration page. Session expiry logs you out but does not delete the account. `npm run admin:reset` provides terminal recovery and revokes sessions. Losing all database backups loses the account and business data. Change any password previously shared in chat using the Security page.

No GitHub push, DigitalOcean deployment, live inbox send or browser visual inspection was performed during this audit. GitHub CI and Linux service templates are prepared, but were not run on an actual GitHub runner or Droplet.

## Authoritative launch references

- DigitalOcean SMTP restrictions: https://docs.digitalocean.com/support/why-is-smtp-blocked/
- Gmail sender guidelines: https://support.google.com/mail/answer/81126
- Google Search appearance: https://developers.google.com/search/docs/appearance
- Open Graph protocol: https://ogp.me/
- GitHub Node CI: https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs


## Completed verification

| Check | Result |
| --- | --- |
| Full backend integration/security suite after repairs | 121 passed, 0 failed |
| Client startup tests | 4 passed, 0 failed |
| Isolated built production smoke | 10 checks passed; workers paused |
| Workspace type checking | Passed |
| Client, SSR and backend production builds | Passed |
| npm dependency audit | 0 reported vulnerabilities, including development dependencies |
| Included-file repository scan | 163 files checked at scan time, no known secret/private-file findings |

The first audit run found a malformed new SMTP fixture (a read-only field was sent to the strict save schema); it was corrected. A later full run encountered a local HTTP connection reset around product SSR validation; test fixture connections were changed to close explicitly, without adding retries or weakening assertions. The final full suite passed. Existing local SMTP tests exercise confirmation, related/sequence delivery, protected downloads and unsubscribe without delivering messages externally. Provider inbox placement, mobile/browser visual inspection, GitHub CI execution and live Linux hosting remain unverified.

Evidence is retained locally in the ignored `.agent-churn-control` directory: final-security-stable-tests.log, final-security-client-tests.log, final-security-typecheck.log, final-security-build.log, final-security-repository.log, final-security-production-smoke.log and final-security-npm-audit.json. Do not publish this directory. Future code/content/configuration changes need checks appropriate to those changes.
