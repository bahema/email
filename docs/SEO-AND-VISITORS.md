# Search metadata and website visitor reporting

These changes are local until deployed. They support search discovery and valid markup; they do not certify Google rankings, rich-result eligibility, WCAG conformance or legal compliance.

## Owner controls

- Settings → General: optional stable homepage search title, description and Google Search Console HTML verification token. Empty title/description keep the existing hero-based fallback. Paste only the verification token, never a password.
- Website content → Offers / Upcoming → Product information → Search & social metadata: optional individual search title and description. The same editor is available for Health products. Existing item names and descriptions remain the fallback.
- Health: its existing dedicated SEO title and description remain in use.
- Lead pages and editorial guides/collections: existing SEO editors remain in use.
- Settings → Tracking: enable/pause cookieless website visit counting.
- Overview and Analytics: Website visitors panel shows page views, daily network visitor estimates, today's estimate and most viewed pages. Existing period/date filters apply to the selected-period totals; today remains today.

## Discovery and product data

Category pages at `/categories/<encoded category name>` are generated only from published offers. Homepage category cards link to them. They have server-rendered content, canonical URLs, CollectionPage/ItemList data and sitemap entries. Empty categories return 404/noindex. Categorize actual products (for example pets, e-books, courses, cosmetics or software) in their item editor; no empty keyword pages are created.

Published products have Product data and, for real fixed/free prices, Offer price/currency data. Starting and subscription prices are not misrepresented as fixed offers. No review scores, credentials, medical claims or seller identity are invented. Social images reuse the saved public product image, item facts and site name. Product edits version the image URL, although platforms can keep their own cached link previews.

## Visitor counting and privacy

The client sends only a public path. No query strings, confirmation tokens, email addresses, raw IP addresses, full referrers or browser IDs are saved in visitor tables. The backend uses a secret-keyed daily network hash for deduplication. Old keys are cleaned up on subsequent eligible visits after two calendar days; aggregate page/date counts persist. Private/action pages, known bots, signed-in owner requests, DNT and Global Privacy Control are excluded. The privacy page offers an optional device opt-out; cookie/privacy copy explains the counting.

These are estimates: shared networks may count as one; one person on different networks may count more than once. Daily visitor totals across a period include return visits on different days. Reloads of the same page from the same network inside 30 seconds are deduplicated. Counts begin when the new version receives eligible visits, not when the site was first launched. This is not a count of currently online people, sales or verified humans.

## Checks and repeatable audit

Run the development services, then `npm run audit:seo`. Set `AUDIT_URL` to audit another public deployment. The script audits every sitemap page, metadata uniqueness, status, robots visibility, language, viewport, alt attributes and JSON-LD parsing. Reports are private local artifacts under `.agent-churn-control/seo-audit/`.

For Nu HTML validation, install Java 17+ and supply `VNU_JAR` pointing to the official Nu checker jar (https://validator.github.io/validator/). This developer tool is not a production dependency. The audit reports an unavailable checker explicitly.

2026-10-25 local result: 16 public pages checked, zero metadata findings and zero Nu HTML errors. Nine non-blocking Nu advisories concern top-level h1 headings nested in section elements. JSX void-element trailing slashes also produce informational messages. These are not claimed as validation errors. A rendered-page audit does not replace keyboard/screen-reader testing or browser performance measurements.

## After publication

1. Set the real public HTTPS origin and stable homepage metadata in Settings. Confirm the site name, product claims and provider prices are accurate.
2. Verify ownership in Google Search Console (DNS verification or the new HTML token field) and submit `/sitemap.xml`.
3. Use Google's Rich Results Test for published product URLs, URL Inspection for indexing, and PageSpeed Insights for measured performance.
4. Recheck changed social URLs with the platform's preview/debug tool. The website cannot force a platform to show a price or refresh its cache.
5. Keep original, useful descriptions and documented sources, particularly for health, supplements and animal care. Do not publish sample prices or fictional testimonials as factual endorsements.

References: Google Search Essentials and supported meta tags (https://developers.google.com/search/docs/crawling-indexing/special-tags), product snippets (https://developers.google.com/search/docs/appearance/structured-data/product-snippet), canonical URLs (https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), Nu checker (https://validator.github.io/validator/).
## Social sharing studio

On a published product card or detail page, select **Share** to open the centered sharing studio. The three-dot menu retains quick links and also opens **Images & more platforms**.

The studio provides public product link/caption copying, platform composer shortcuts, image previews and downloadable JPEGs:

| Layout | Dimensions | Intended use |
| --- | --- | --- |
| Link card | 1200 × 630 | Open Graph/X link previews |
| Square | 1080 × 1080 | Image posts and compact sharing |
| Portrait Pin | 1000 × 1500 | Ordinary Pinterest image Pins |
| Story | 1080 × 1920 | Stories, with extra top/bottom space |

All layouts reuse existing public product photos, the site's saved name/logo, price, status and custom badge. No new product photography is generated. Native image sharing is available where browser and target-app support permit; otherwise download the image and paste its caption. Native share pickers and platform composer links do not automatically publish anything. Story images are static pictures: add a platform link sticker or destination separately.

Pinterest composer links use the portrait image and canonical product page. This remains an ordinary Pin, not merchant Product Rich Pin eligibility. Captions preserve affiliate disclosure; short X/Bluesky composer text retains an affiliate label and the complete destination. Generic guides/pages keep link sharing even when no product image exports exist. Social trackers and platform SDK scripts are not embedded.

The public asset endpoint excludes drafts and private files. Export downloads are public product images only. Repeated requests share pending rendering work, with bounded cache/concurrency and rate limits. Changes to image layouts also version their URLs. Platform-specific preview cache and cropping still require checking against deployed HTTPS URLs.
