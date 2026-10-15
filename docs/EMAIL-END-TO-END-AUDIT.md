# Email marketing end-to-end audit - 2026-10-08

Verdict: locally verified single-owner email marketing engine. Not a 100% legal compliance certificate, real-inbox delivery guarantee, penetration-test certificate, or multi-tenant SaaS launch approval.

## Final evidence

- 109 backend tests passed, zero failed/skipped. This includes real Nodemailer submission to isolated loopback SMTP capture servers.
- Four client startup tests passed.
- Client and backend production builds passed.
- Anonymous access to the running contacts API returned 401.
- No real subscribers were modified or emailed. Tests use temporary/in-memory databases and local capture mail servers. Normal preview workers remain paused.
- Browser click-through and visual testing were unavailable. React static-render tests and HTTP integrations do not replace browser testing.

Evidence logs: .agent-churn-control/e2e-verified-tests.log, e2e-client-tests.log and e2e-verified-build.log.

## Journey coverage

| Area | Verified controls |
| --- | --- |
| Public capture | Explicit consent, normalized email, validated source/country, source/UTM records, encrypted confirmation outbox |
| Lead pages | 35 template types; published/draft separation; ready related email required for capture publication; immutable acquisition snapshots; browser/campaign-only modes reject signup |
| Confirmation | GET does not activate; explicit POST activates; expiry and token rotation; idempotence; suppression and fresh resubscription consent |
| Connected email | Frozen at acquisition, sent to that contact, gated by double opt-in; configurable single opt-in does not falsely verify ownership |
| Sequences | One enrollment, frozen steps/content, delays, pause/resume/stop, durable state and independent scheduler |
| Admin | Login/CSRF, session rotation/expiry, salted password hashes, encrypted SMTP secrets and masked responses, delivery histories |
| Segmentation | Reusable countries/continents, confirmed-only eligibility including OR rules, frozen campaigns and due-time recipient resolution |
| Delivery | HTML/plaintext, branded footer, public images, durable claims and shared pacing; safe connection retries; uncertain deliveries not silently resent |
| Unsubscribe | Website opt-out and one-click provider POST; invalid token/body rejection; GET cannot opt out; repeated POST idempotent; remaining sequence cancelled |
| Media/privacy/SEO | Private download authorization and expiry, sanitized HTML/URLs, asset deletion protections, no-store sensitive data and noindex token pages |

The new full SMTP test creates a funnel through admin HTTP, rejects missing consent, captures a pending public signup, proves no marketing before confirmation, captures HTML confirmation, confirms over HTTP, verifies the admin consent/source record, delivers the related email and due sequence steps, then cancels the remaining step through one-click unsubscribe. The test originally expected a cancelled future delivery-history job; corrected to check the cancelled campaign because it is cancelled before queue resolution. The final entire suite passes.

## Fixes in this audit

Marketing messages now advertise List-Unsubscribe-Post: List-Unsubscribe=One-Click with a List-Unsubscribe URL to the token-authorized public API. It accepts application/x-www-form-urlencoded requests without an admin login. GET returns 405 without changing a contact. Human opt-out remains in HTML and plaintext. Production HTTPS access and provider DKIM signing/coverage of these headers still need verification.

Settings now explains Gmail setup, app passwords, standard SMTP provider changes, local/public link behavior, and domain migration. These instructions stage no credentials and send no mail.

## Gmail first

In Admin Settings > Email / SMTP:

- Host smtp.gmail.com, port 587 with STARTTLS; alternatively 465 with TLS.
- Username and sender: your full Gmail address or a Google-authorized sender.
- Password: Google app password entered only in the admin password field. Enable 2-Step Verification first; some accounts do not permit app passwords. OAuth authentication is not implemented.
- Use your real sender name and a monitored reply-to.

Save, Test connection, then Send test email to your own authorized test inbox. Check inbox/spam and reply handling. SMTP acceptance is not proof of inbox placement. Real Gmail delivery remains untested because no configured credentials and authorized recipient were provided in this session.

Localhost confirmation/download/unsubscribe links only open on this computer. Gmail may receive a test message before you have a domain, but external subscribers cannot complete that local journey. The preview pauses automatic delivery. Use a controlled isolated queue for the full Gmail test; do not enable the existing queue simply to test.

## Switching to business email, DNS and HTTPS

SMTP settings persist in SQLite and passwords are encrypted. Replace provider host, port, encryption, username/password and verified sender; save and rerun both SMTP tests. Existing contacts, newsletters and automation definitions remain saved. Replace Gmail credentials with business-provider credentials. Changing SMTP configuration makes previous test evidence stale.

Domains / URLs publicUrl controls newly generated default public links and email media. Review General site URL, explicit policy/image/social URLs and funnel mappings. Trusted admin origin comes from the server SITE_URL configuration and requires restart; editable General site URL alone does not change it.

DNS ownership, hosting routing, TLS/SSL, SPF, DKIM, DMARC and provider return-path settings require provider configuration. Buying them does not configure the app automatically. Previously sent emails cannot be rewritten. Captured funnel origins remain frozen for acquired journeys; keep old public domains serving the app during migration and test existing and new contacts separately.

## Open launch gaps

1. Public domain/HTTPS deployment and real-provider authentication, delivery, inbox placement, quotas and reputation are unverified. Application pacing is not an adaptive Gmail quota manager.
2. Current public response has 30 published content items, one public lead page and 11 demo-titled entries. Website footer address/contact email are blank. Policy lengths: privacy 120, terms 55, disclosure 114 characters. Supply accurate business identity/address/contact details and appropriate policies; replace demo offers, reviews and partners. Website footer and email footer are separate editable settings; complete both.
3. No automatic provider bounce/complaint webhook ingestion exists. Blocked statuses are enforced, but feedback must be processed manually or integrated before scaled sending. Sent means SMTP accepted, not delivered or inbox. Open counts can be blocked/preloaded.
4. A complete automated retention/erasure/access workflow is absent. Establish owner procedures for rights requests, retention, suppression, processor contracts, international transfers and breach response; review relevant regulatory obligations.
5. Technical consent/unsubscribe controls do not certify wording, offer-specific purpose, tracking legal basis or worldwide marketing practices. Single opt-in does not prove mailbox ownership. Review actual content and privacy/tracking disclosures for your audiences.
6. This is the original single-owner application. Multi-tenant accounts, tenant isolation, billing and customer provisioning are not implemented. Commercial multi-business SaaS needs separate implementation and audit.
7. Real browser/mobile checks, deployment load/resilience tests, backup restore drills, production penetration testing and Google/public-domain reviews remain unverified. See OPERATIONS.md for existing backup and restore precautions.

## Official sources reviewed

- Gmail sender requirements: https://support.google.com/mail/answer/81126
- Google app passwords: https://support.google.com/accounts/answer/185833
- Gmail SMTP: https://support.google.com/mail/answer/7104828
- FTC CAN-SPAM business guidance: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- ICO electronic mail marketing consent: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/
- Rwanda DPO direct-marketing rights: https://dpo.gov.rw/dpp-law/rights-of-the-data-subject

These sources establish requirements, not certification of this application.
