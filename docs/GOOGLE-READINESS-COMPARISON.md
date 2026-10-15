# Google readiness comparison — 2026-10-15

This is a source review and read-only local HTTP inspection, compared with current official Google documentation. It is not a Google certification, a Lighthouse run, an actual browser accessibility audit or a legal opinion. No site settings, DNS or campaigns were changed.

| Area | Website evidence | Assessment and next action |
| --- | --- | --- |
| Crawlable content | Browser-style homepage request returned HTTP 200, roughly 83 KB of HTML with a rendered root, title and canonical. API health was 200. | Implemented locally; verify production responses and Search Console URL Inspection after deployment. A generic fetch without Accept:text/html receives the Vite development shell, so development probes must use browser headers. |
| SEO metadata | Route-based title/description/canonical, robots directives, Organization/WebSite/WebPage/Breadcrumb JSON-LD and OG/Twitter sharing metadata in server/src/seo.ts. | Technical foundation exists. Actual homepage title is Join for practical guides / Affiliate Engine. Replace remaining default branding and review every published page's copy. General schema does not guarantee product rich results or rankings. |
| Sitemap and URLs | robots.txt and sitemap.xml returned 200; sitemap contained 10 URLs. Sitemap and homepage canonical still use http://localhost:5173. | Local configuration is expected during development, but is a launch blocker if left unchanged. Set real public HTTPS origin, then verify canonical URLs, sitemap contents and redirects. |
| Affiliate links/content | Public product, hero and funnel actions use sponsored link annotations; disclosures and editable guides/comparisons are implemented. | Good foundation. Actual content needs original useful information, accurate claims and genuine evidence. Templates and merchant copy alone do not meet Google's quality expectations. Keep substantially duplicated campaign variants noindex instead of creating indexed doorway pages. |
| Performance | Existing production artifacts: main JS 352,457 bytes and CSS 193,920 bytes uncompressed; admin app is a separate lazy-loaded chunk. SSR, image dimensions and video space reservations exist. | No LCP, INP, CLS or Lighthouse measurement was obtained. Asset size and build success do not prove fast mobile rendering. Measure the production build and deployed mobile page; optimize based on measured results. Google good-experience targets: LCP within 2.5 seconds, INP under 200 ms, CLS under 0.1; assess field experience at the 75th percentile. |
| Storage/Google tags | Notice preference saved only on request; saved item IDs optionally stored; no Google Analytics/Ads/GTM runtime integration found. Owner sessions and server/email tracking described. | Current notice is consistent with current browser integrations. It is not a Google Consent Mode implementation. If Google measurement/advertising is added, wire appropriate default/update consent signals before measurement and test with Tag Assistant. AdSense-specific requirements would need a separate review if monetization is added. |
| Email to Gmail | Previous isolated audit passed 223 checks, including confirmations, consent, one-click unsubscribe, shared limits and SMTP format. SMTP supports TLS and separate Reply-To. | Code-level evidence only. All senders need SPF or DKIM, TLS, valid sending infrastructure DNS and low complaint rates. Bulk senders need SPF AND DKIM, DMARC/alignment and one-click marketing unsubscribe. Verify actual received headers and provider PTR/TLS; current DNS queries returned ECONNREFUSED, so no fresh authentication verdict is possible. Previous missing standard DKIM/DMARC findings remain unresolved until rechecked. Automatic provider bounce/complaint ingestion remains absent. |
| Privacy/private pages | API noindex headers; private action/admin robots rules and route metadata; authentication and consent tests in previous audit. | Defense exists. robots.txt is not authentication, and disallow may prevent a crawler from seeing noindex. Validate actual deployed private responses; do not publish subscriber URLs. No guarantee of zero vulnerabilities. |

Priorities:
1. Finish original, accurate public content, business identity, policy/contact/address information and remaining default branding.
2. Deploy with persistent data, correct public URL, HTTPS and compatible email hosting. Current application SMTP must be considered before DigitalOcean deployment.
3. Verify actual SPF/DKIM/DMARC results, sending infrastructure, unsubscribe and complaints/bounces.
4. Measure mobile production performance with Lighthouse/PageSpeed Insights, and check Search Console indexing and rich-result eligibility. Field metrics may be unavailable until sufficient real traffic exists.
5. Add consent integrations only when adding services that need them; a cookie banner alone is not consent wiring or a compliance certificate.

Sources:
- https://developers.google.com/search/docs/essentials/spam-policies
- https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links
- https://developers.google.com/search/docs/appearance/core-web-vitals
- https://developers.google.com/tag-platform/security/guides/consent
- https://support.google.com/mail/answer/81126?hl=en

Related evidence: docs/FINAL-EMAIL-SYSTEM-AUDIT.md. No old full test suite was rerun for this comparison. Firecrawl CLI was unavailable; official Google documents were read with the available web tool.
