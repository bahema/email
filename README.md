# Affiliate Engine

For Railway hosting, follow [the Railway deployment guide](docs/RAILWAY.md). Live databases, uploads and secrets are intentionally excluded from this repository and must be migrated privately to persistent storage.

A private, single-owner affiliate and email marketing engine. Phases 1–10 provide secure administration, website/media controls, consenting subscribers, newsletters, segments, manual campaigns, reusable lead pages, protected downloads, confirmation-triggered email sequences, date-filtered analytics and activity/delivery logs. See [final delivery report](HANDOFF.md), [operations guide](docs/OPERATIONS.md) and [verification](docs/VERIFICATION.md).

For video promotion, repeat signup and the admin palette, see [the latest update](docs/HERO-SIGNUP-ADMIN-UPDATE.md).

For the current final audit, see [security and launch audit](docs/FINAL-SECURITY-LAUNCH-AUDIT.md), [latest email workflow](docs/FINAL-EMAIL-WORKFLOW.md) and [deployment guide](docs/DEPLOYMENT.md).

See [public/admin experience update](docs/UX-DELIVERY.md) for the lead studio, publication controls, previews, sharing, SEO and necessary-storage notice. For local review without queued email delivery, use `npm run preview`; stop it before using `npm run dev` for normal workers.

## Requirements and setup

Use Node.js 24.13 or newer in the Node 24 release line, and npm. Run from the repository root:

```powershell
npm install
Copy-Item .env.example .env
npm run security:setup
npm run db:migrate
npm run admin:setup
npm run dev
```

For an existing installation, keep your existing .env and run security:setup and db:migrate. Do not overwrite an existing encryption key. Run admin:setup only if no admin exists.

Open http://127.0.0.1:5173/admin/login. The setup command asks for your email and a password of 12–128 characters; password input is masked. No default credentials are provided. Account creation is available only through the local terminal, never through a public API. The public website is at /. Run npm run demo:seed for fictional sample content; existing records are preserved and no subscribers or emails are created.

Vite proxies /api, /media, /go, /email and /download to the backend at http://127.0.0.1:3001. If changing the API port, also update client/vite.config.ts.

## Structure

- client/src/admin/: login, guarded admin shell, settings and security screens
- server/src/auth/: admin login/logout/password routes
- server/src/security/: password hashing, secret encryption and persistent sessions
- server/src/settings/: validated settings, encrypted SMTP credentials and SMTP tests
- server/src/cli/: local encryption-key and admin setup/recovery commands
- server/src/db/: SQLite connection and versioned migrations
- server/test/: backend integration and security tests
- shared/src/: shared API response types
- data/: local SQLite database (ignored by Git)
- uploads/: validated local media storage (ignored by Git)
- server/src/content/ and client/src/public/: editable public website and affiliate redirects
- server/src/contacts/: contacts, consent history, tags and secure subscriber tokens
- server/src/mail/: durable transactional outbox and scheduled worker
- server/src/marketing/: newsletter sanitization/rendering, segments, campaigns, tracking and marketing worker
- server/src/lead-pages/ and server/src/automations/: page presets, protected resources and confirmation-triggered sequences

## Admin and settings

/admin/login requires the single admin account. /admin displays actual system status. /admin/settings provides General, Email/SMTP, Email Defaults, Tracking, Domains/URLs, Compliance, Affiliate, Uploads, Security and System sections. No customer accounts, organizations or roles exist.

Settings are validated and saved in SQLite. SMTP passwords are encrypted with AES-256-GCM using the root .env key. API responses return only passwordSet, never the password or ciphertext. A blank SMTP password keeps the saved value; the clear-password checkbox explicitly removes it. Test connection checks saved SMTP connectivity/authentication, not sender permissions. Send test email verifies submission to the SMTP server; acceptance is not proof of inbox delivery. STARTTLS and TLS validate certificates. Unencrypted SMTP is limited to loopback test servers. SMTP operations have timeouts and rate limits, and provider errors are sanitized.

Tracking, uploads and compliance settings govern the website, subscriber flows and marketing delivery. The API starts transactional and marketing workers automatically. SITE_URL in the server environment defines the trusted admin origin; editing public link URLs in settings does not change that security boundary.

## Website content and uploads (Phase 3)

Use Website content in the admin navigation to edit navigation, saved hero configurations and the active hero, offers, upcoming items, FAQs, reviews, partners, footer, theme, signup text and legal pages. Only active content and approved reviews appear publicly. Hero image/video/slider/signup modes are supported. Affiliate actions use tracked /go redirects; tracking can be disabled. The homepage uses an offers/sidebar layout on desktop and stacked sections on mobile.

Uploads validate configured limits, extension and file signatures. Executables, HTML and SVG are rejected. Public image/video assets can be selected in the CMS; private assets require admin authentication or a valid subscriber download grant. Documents are served as attachments. Referenced assets cannot be deleted. Signature validation is not antivirus scanning.

Before public launch, replace fictional offers/reviews/partners and starter legal text, set your public URL, review consent wording and configure SMTP. Video extensions such as mp4/webm must be enabled in upload settings before uploading them.

## Contacts and consent (Phase 4)

Signup forms collect name, email, country and explicit consent. The server records source, consent wording/time and optional UTM data; disabling tracking omits UTM data. Email addresses are normalized and deduplicated. Tags come from the source configuration and are assigned on confirmation. Leads & tags provides search, filters, consent/event history, tag editing, unsubscribe/suppression and safe delivery logs.

Country mapping uses the countries-list dataset with six continents. Its convention classifies Russia and Turkey as Asia; Antarctica is excluded from signup choices. See the [dataset source](https://github.com/annexare/Countries).

Double opt-in is enabled by default. Confirmation links expire after 24 hours; token hashes are stored separately from encrypted queued email payloads. GET previews a link; an explicit POST confirms or unsubscribes, preventing email scanners from changing subscription state. Confirmation resends rotate the token and have a 60-second cooldown. Unsubscribe links remain usable without expiry. Public forms cannot reactivate suppressed, bounced or complained contacts. A fresh subscription after unsubscribe always requires fresh consent and confirmation, even if double opt-in is disabled. Only confirmed contacts are eligible for future marketing sends.

The durable SQLite outbox progresses without an admin browser session. With no SMTP configured, jobs remain pending. Safe connection failures retry up to three attempts; interrupted or ambiguous delivery is marked failed rather than automatically resent. Request a fresh confirmation link to recover. SMTP acceptance does not prove inbox delivery. System diagnostics show worker heartbeat and pending/failed counts. An optional separate process is available through npm run worker:transactional; atomic job claims prevent two workers from processing the same job simultaneously.

## Newsletter editor and segments (Phase 5)

/admin/newsletters stores reusable email content with an internal title, subject, preheader, HTML and draft/ready status. Use the basic rich-text toolbar for headings, paragraphs, formatting, links, buttons, uploaded public images and affiliate links, or edit HTML directly. Paste into rich text inserts plain text. Save, duplicate, delete, preview at desktop/tablet/mobile widths, or send the saved version to an explicit test address. Tests use demo personalization and no tracking. The editor intentionally has no drag-and-drop builder.

Supported placeholders are {name}, {siteName} and {unsubscribeUrl}. The server escapes personal values and removes scripts, event handlers, embedded forms/frames, unsafe URL schemes and unsupported CSS. Only a defined set of email-friendly tags and inline style properties is preserved. A 600-pixel table layout adds the configured footer, identity, affiliate disclosure and an unsubscribe link even if the newsletter omits one. Marketing newsletters and campaigns have no forced logo/header. Only the fixed system confirmation email has the logo and personalized header greeting; its background color is configurable. Outgoing messages contain both HTML and plain text, with link URLs included in the text version. Relative image and affiliate links resolve against the public URL in settings. Preview runs in a sandboxed frame and approximates widths rather than emulating email clients. Sanitization follows the [sanitize-html allowlist APIs](https://github.com/apostrophecms/sanitize-html).

/admin/segments stores simple AND/OR rules for subscriber status, country, continent, source type/ID, tag, subscription/confirmation date, recent opens/clicks and interaction with a campaign ID. Dates use before/after conditions; recent engagement uses a positive number of days. Preview shows total matches, confirmed eligible recipients and the first 25 matches. Segments calculate membership from current contact data. Any campaign audience is additionally restricted to confirmed contacts, including OR rules or explicitly selected contacts.

## Manual campaigns and marketing queue (Phase 6)

1. Configure and verify SMTP in Settings. Set the public URL to the reachable HTTPS origin before sending externally.
2. Write and save the email in Newsletters or select a ready saved email using Old email. Review its preview and send yourself an explicit test if needed.
3. Open Audience options, select all or any combination of the six continents, save changes, then use Send to subscribers on the same page. Only confirmed eligible contacts can receive it.
4. Campaigns offers the same direct-send workflow, plus optional advanced segmentation and scheduling. Review status and delivery logs; pause/resume or cancel pending sends there.
5. Lead-page related emails and sequences use the same protected queue. Connect the appropriate ready email in Lead pages before activation. Protected {downloadUrl} emails cannot be ordinary broadcasts.

Launch freezes newsletter content and segment rules. The worker resolves current eligible contacts when the campaign becomes due, then creates one queue job per campaign/contact. A recipient who confirms before scheduled resolution can join; someone who unsubscribes before resolution is excluded. After resolution, later new contacts are not added. Edits to reusable newsletters or segment rules do not change an already launched campaign. Media used by the frozen content remains protected from deletion.

The API's scheduled worker ticks every second and uses a shared SQLite throttle to claim at most one marketing email every two seconds across worker processes. It checks contact status before delivery, cancels pending jobs for blocked contacts, observes campaign pause/cancel state and uses stable message IDs and unique campaign/contact jobs. The API process must remain running, or use npm run worker:marketing as a separate process with the same database and settings. Jobs survive restarts; the browser is never the scheduler.

Queue statuses are pending, processing, sent, failed and cancelled. Campaign statuses are draft, scheduled, sending, sent, paused, failed and cancelled. Pending jobs wait if SMTP is absent. Proven pre-send DNS/connect failures retry up to three attempts with backoff; connection closes, timeouts or a stale processing claim can have an uncertain delivery result and are not silently retried. Errors are redacted. SMTP cannot guarantee exactly-once delivery across network failures. A failed campaign can contain some successful deliveries. An empty audience completes with zero sends. Pausing/cancelling cannot retract a message already handed to SMTP; its actual result is retained in logs. There is no automatic failed-campaign replay in V1.

Every marketing email contains a secure unsubscribe link and a [List-Unsubscribe header](https://nodemailer.com/message/list-headers). Unsubscribe/suppression immediately cancels pending marketing jobs. Optional open pixels and click redirects use hashed random tokens; admin logs never expose bearer tokens. Opens and clicks count once per delivered email for campaign metrics, while contacts retain their most recent interaction time. Disabling tracking stops recording, and existing click URLs still reach their stored destinations. Unsubscribe links are never wrapped in click tracking. Images/proxies/scanners can make open and click data imperfect.

The dashboard shows all-time subscriber counts, marketing queue/sent/failed totals, affiliate outbound clicks, unique open/click rates among tracked sends and recent campaigns. Date-filtered analytics, lead-page rankings and automation reporting are available on the overview and logs screens.

Run npm run demo:seed to add two fictional newsletters, example segments and an unscheduled draft campaign. Existing records are preserved; no recipient, credential or scheduled send is seeded.

## Lead pages and protected downloads (Phase 7)

Create pages at /admin/lead-pages and publish them at /p/:slug. Thirty-six presets, including squeeze pages, share one editable page/form engine. Presets classify the page; they do not introduce separate contest, quiz-scoring or webinar platforms.

Configure headline, supporting text, body, public hero image/video, CTA, source tags, system confirmation journey, success instructions, return link, optional affiliate recommendation, private downloadable resource and linked email sequence. Forms always collect name, email, country and consent; optional text/choice questions support surveys and applications. Answers are validated server-side and retained in the contact's acquisition history. Public pages never expose resource storage paths or confirmation email templates. Homepage cards/navigation can link to /p/:slug through their existing internal URL controls, and the same LeadForm component supports pages and existing homepage forms.

Lead pages default to double opt-in. Explicit page settings can select a consent-based direct signup journey, a browse-only page, or a campaign-audience page. Protected download pages require double opt-in and a ready connected email containing {downloadUrl}; before confirmation there is no protected resource grant. The saved submission retains its page configuration, tags, answers and resource reference. Editing or disabling a page cannot change an existing confirmation's promised resource or success instructions. Inactive/draft pages reject new signup requests; existing confirmation links can still complete.

After confirmation, protected downloads can use a branded /downloads/:token landing page and /download/:token attachment. The Downloads admin tab controls the page and private file; legacy direct resource links remain supported. A grant uses a random bearer token with only its hash stored, expires after 24 hours, and requires a currently confirmed contact, confirmed associated submission and private resource. Files are attachments with restrictive headers; successful transfers record resource_downloaded. Unsubscribe/suppression blocks existing grants. A still-valid confirmation link can issue a fresh grant. Resource references are retained for existing subscribers and prevent deletion. There are no subscriber accounts or public directory of private files.

## Confirmation-triggered sequences (Phase 8)

Create sequences at /admin/automations using ready newsletters and ordered delays measured in minutes from confirmation. For example, 0, 1440 and 4320 mean immediately, one day and three days after confirmation. Link the sequence to a lead page. Confirmation assigns page tags and atomically enrolls the contact; a unique automation/contact key prevents duplicate enrollments when a confirmation is clicked twice or a contact signs up again. Each contact enters a given sequence once, including after resubscription.

Enrollment freezes each step's newsletter content, due time and optional tag actions. Tags are assigned once when a due eligible step starts, before SMTP delivery. Later sequence/newsletter edits affect future enrollments. Existing enrollments retain their original content and timing. A newsletter referenced by a sequence must remain ready and cannot be deleted until removed from the sequence.

The existing marketing worker handles sequence steps through internal single-recipient campaigns and the same durable queue, SMTP sender, throttle, retry rules, unsubscribe checks and tracking. No separate worker command is required. Manual Campaigns excludes internal sequence sends; Email sequences shows the latest 100 enrollments and delivery logs. The same worker:marketing command can run both manual and automatic sending in a separate server process.

Page visibility and sequence delivery are independent. Deactivating a page stops new signups while existing sequences continue. Saving a sequence as paused holds scheduled/pending steps; saving it as running resumes them. Overdue steps send at the normal queue pace rather than shifting their original due times. A send already handed to SMTP may finish. Unsubscribe or suppression cancels remaining steps and permanently cancels that enrollment. Steps with delivery failure do not automatically block later scheduled steps; after all steps finish, the enrollment is completed or failed. There is no automatic replay of uncertain deliveries or completed/cancelled enrollments.

Use {downloadUrl} in a sequence newsletter to include a fresh 24-hour resource link associated with that enrollment's original page submission. The link is generated at delivery time and is never wrapped in click tracking. Ordinary newsletters without an associated resource do not receive a download link. Confirmation and download URLs are bearer credentials: do not share them publicly.

Demo seeding adds /p/demo-free-guide, a private fictional text guide and a three-step Demo Free Guide Sequence that starts paused. It creates no contacts or actual email jobs. Replace the demo content, configure SMTP and explicitly run the sequence when ready.

## Authentication

Passwords use salted scrypt hashes. Browser sessions use random opaque cookies, while only SHA-256 hashes of those cookies are stored in SQLite. Cookies are HttpOnly, SameSite=Strict and Secure in production. Sessions survive process restarts, expire after SESSION_HOURS without sliding renewal, and are deleted on logout. Login rotates the anonymous session. Password changes verify the current password, revoke all sessions and create a replacement session for the current browser.

Every state-changing admin request requires the session CSRF token in X-CSRF-Token. Origin checks additionally reject untrusted browser origins. GET /api/auth/session obtains an anonymous session/CSRF token for login. Admin APIs enforce authentication independently of frontend route guards. Login limits apply per client IP and globally for the sole account; these counters are in memory and reset when the process restarts. There is no CORS allowance for cross-origin admin access.

For local recovery if you lose access:

```powershell
npm run admin:reset
```

This asks for explicit RESET confirmation in your own terminal, then replaces the sole admin login and revokes sessions. Protect server filesystem access, since the local recovery command is trusted.

## Environment

Root .env is read in development and production. Process environment variables override it. Paths resolve relative to the repository root.

| Variable | Default | Purpose |
| --- | --- | --- |
| NODE_ENV | development | development, test or production |
| HOST | 127.0.0.1 | API bind address |
| PORT | 3001 | API port |
| SITE_URL | http://localhost:5173 | Trusted admin origin and initial public URL |
| TIMEZONE | Africa/Kigali | Initial valid IANA timezone |
| DATABASE_PATH | ./data/affiliate.sqlite | SQLite file |
| UPLOAD_DIR | ./uploads | Local media directory |
| SETTINGS_ENCRYPTION_KEY | generated by security:setup | Required 32-byte key encoded as 64 hex characters |
| SESSION_HOURS | 8 | Fixed authenticated-session lifetime, 1–24 hours |
| TRUST_PROXY | false | Set true only behind exactly one trusted reverse proxy |

Never commit .env, credentials, databases or uploaded files. Back up the encryption key separately from the database; replacing it makes encrypted SMTP passwords and queued transactional messages unreadable. SMTP credentials are entered through admin settings, not frontend environment variables.

## Database

npm run db:migrate applies missing migrations transactionally; startup also applies them. Re-running is safe. Append new numbered migrations in server/src/db/migrations.ts; never edit an applied migration.

Schema versions 7–8 add lead_pages, download_tokens, automations, automation_steps and automation_enrollments, submission snapshots and sequence-linked campaign fields to the Phase 1–6 tables. The admin table enforces one account. JSON data is validated and foreign keys, WAL mode and a busy timeout are enabled. Queries use parameterized values.

## Validation

```powershell
npm run typecheck
npm test
npm run build
npm audit
```

Tests use fictional credentials, mocked delivery and a local SMTP capture server. No messages are delivered externally. They cover administration/security, website/subscriber behavior and newsletter sanitization, segmentation, campaign snapshots/scheduling, shared worker claims/throttling, unsubscribe/suppression, retries, uncertain sends, pause/cancel and safe tracking. End-to-end tests exercise scheduled SMTP delivery independently of browser requests and unsubscribing before future campaign selection. Node 24 may emit an experimental SQLite warning. Browser visual inspection was unavailable in the implementation environment.

## Production

```powershell
npm run build
$env:NODE_ENV = 'production'
npm start
```

Express serves client/dist and the API from one origin. Set SITE_URL to your HTTPS site origin and use a reverse proxy with TLS before logging in. Production cookies require HTTPS; plain HTTP is only suitable for a non-authenticated health check. TRUST_PROXY=true trusts exactly one proxy hop; use only when direct access to the app port is restricted to that proxy. Keep data and uploads on persistent storage. See deploy/ and docs/DEPLOYMENT.md for the managed Linux service and HTTPS proxy. DigitalOcean Droplets block common SMTP ports; resolve outbound delivery before activating workers.

The npm cache is local via .npmrc. Vite uses Node 24's native configuration loader. Development dependency optimization may require normal host filesystem access when running inside a restricted automation sandbox.

## Important routes

| Route | Purpose |
| --- | --- |
| GET /api/health | Database connectivity/schema version |
| GET /api/auth/session | Login state and CSRF token |
| POST /api/auth/login | CSRF-protected login |
| POST /api/auth/logout | Revoke current authenticated session |
| POST /api/auth/password | Verify/change password and revoke sessions |
| GET /api/admin/settings | Protected settings without secrets |
| PUT /api/admin/settings/:section | Validate and save one settings section |
| POST /api/admin/smtp/verify | Test saved SMTP connection |
| POST /api/admin/smtp/test | Send a configuration test to an explicit recipient |
| GET /api/admin/system | Safe environment/system diagnostics |
| GET /api/public/site | Active website configuration |
| /api/admin/content | Protected CMS items and sections |
| /api/admin/media | Protected upload library and deletion |
| GET /media/:id | Public asset delivery |
| GET /go/:slug | Active offer affiliate redirect |
| GET /go/upcoming/:slug | Active upcoming affiliate redirect |
| GET /api/public/countries | Supported countries and continents |
| POST /api/public/subscribe | Validated consenting signup |
| POST /api/public/resend | Request another confirmation email |
| GET/POST /api/public/confirm/:token | Preview/complete confirmation |
| GET/POST /api/public/unsubscribe/:token | Preview/complete unsubscribe |
| POST /api/public/unsubscribe-request | Request an unsubscribe link |
| /api/admin/contacts | Protected contacts, tags, history and delivery logs |
| /api/admin/newsletters | Protected reusable newsletter CRUD |
| POST /api/admin/newsletters/:id/duplicate | Copy saved content into a draft |
| POST /api/admin/newsletters/:id/test | Test the saved newsletter to an explicit recipient |
| POST /api/admin/newsletter-preview | Render sanitized content with demo personalization |
| /api/admin/segments | Protected segment CRUD |
| POST /api/admin/segment-preview | Current matching and eligible contacts |
| /api/admin/campaigns | Protected manual campaign CRUD/details |
| POST /api/admin/campaigns/:id/launch | Queue a launch now or at a future UTC timestamp |
| POST /api/admin/campaigns/:id/:action | Pause, resume or cancel |
| GET /api/admin/campaigns/:id/deliveries | Paginated safe delivery logs |
| GET /api/admin/marketing-summary | All-time subscriber and campaign metrics |
| GET /email/open/:token.gif | Optional open pixel |
| GET /email/click/:token/:ordinal | Safe stored-destination email redirect |
| /api/admin/lead-pages | Protected lead-page listing/create/update |
| /api/admin/automations | Protected sequence listing/create/update |
| GET /api/admin/automations/:id/details | Safe enrollment and sequence delivery logs |
| GET /api/public/lead-pages/:slug | Active page configuration without private resource IDs |
| /p/:slug | Public lead page |
| GET /download/:token | Controlled private resource delivery |

Responses include X-Request-ID. Errors contain code, message and requestId. Helmet supplies security headers; JSON request bodies are limited to 100 KB. Unexpected errors do not reveal stack traces or secrets. SIGINT/SIGTERM stop the worker and close the server/database.


## Analytics and final handoff (Phases 9–10)

Dashboard provides Today, Last 7 days, Last 30 days and All time using the saved General timezone, including daylight-saving boundaries. Lead cards count contacts created in the selected period with their current status; new leads today and current queue totals are independent of that filter. Accepted sends use SMTP acceptance time and include marketing plus transactional messages. Failed-job counts use creation dates. Open/click rates use only tracked marketing messages accepted in the period. Affiliate clicks and downloads use event timestamps. Daily new leads, top lead pages, recent manual campaigns and recent automated sends provide detail; the all-time daily chart shows the latest 30 days.

Open Activity & delivery logs from Dashboard at `/admin/logs`. Delivery logs combine manual, automation and transactional jobs, with status/kind/date filters and 50-row pages. Activity logs support exact event-type/date filters. Message payloads, credentials and tokens are excluded. These routes require admin login and are not cached.

Migration 9 adds sequence tag-action snapshots and analytics indexes. Production startup and shutdown coordinate HTTP, workers and SQLite. Public HTML and API responses use no-referrer for subscriber-link privacy; generated public links require a root HTTP(S) origin. Build/test results and remaining browser/provider launch checks are recorded in docs/VERIFICATION.md.

| Additional API | Purpose |
| --- | --- |
| GET /api/admin/analytics?range=today | Timezone-aware dashboard; range also accepts 7d, 30d, all |
| GET /api/admin/activity-log | Safe paginated events; range, page, type |
| GET /api/admin/delivery-log | Safe combined deliveries; range, page, kind, status |

## Visual design and customization

The public website has an editorial layout, local artwork fallbacks, category filter buttons and an Admin link in the top navigation. The admin uses a responsive sidebar and redesigned login/dashboard. Customize Website Content → Theme (three presets or individual colors), Section headings, Hero/Header, Offers/Upcoming, Navigation, Footer and Signup. Upload public product/cover images in Media library and select them in the relevant content editor; assigned images take priority over generic illustrative covers. See [design update](docs/DESIGN-UPDATE.md).

For a fresh demo, `npm run design:assets` imports the three local editorial images into Media library and assigns them only to demo records with empty image fields. It preserves existing image selections. The public layout also supplies illustrative covers for new resources until a custom image is selected.

See [Discovery, guides and collections](docs/DISCOVERY-GUIDES-COLLECTIONS.md) for owner controls and visitor storage behavior.
