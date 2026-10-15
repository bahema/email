# 33 items discovery, saved items, comparisons and editorial content

## Owner controls

Open Admin > Website content > Discovery options to enable or disable saved items and comparisons and edit public section headings. Offers and Upcoming items now have Material type and Allow comparison controls in Product information. Price, status, delivery, condition and affiliate destinations continue to use their existing fields. Optional ingredients, usage instructions, cautions and labeled source URLs are available; enter documented information, not unsupported health promises.

Open Website content > Collections or Guides. Create the page, choose existing products and an existing/uploaded public cover, write the introduction and content, and save as Draft while preparing it. Body formatting supports paragraphs, ## headings and - lists; arbitrary HTML is displayed as text. Select related guides and optionally an existing active lead page. Save as Active to publish. Featured pages appear on the homepage in admin order. Product selection order controls collection order. Empty collections disappear when their products are unpublished.

Guide and collection pages have editable SEO title/description and use their cover for social previews. Published pages enter the sitemap; drafts and inactive pages are unavailable publicly. Existing resources cannot be deleted while a guide or collection references them. Remove the reference first. Images retain media usage protection.

## Visitor tools

Filters & sort opens a centered panel with material, Free/Paid, availability, currency, price range and sort. Filters are reflected in the current URL and can be removed individually. Price ranges and sorting require a currency; hidden prices are not treated as zero. Coming-soon filtering can include upcoming listings.

Save buttons create a shortlist without an account or email subscription. Lists stay in memory unless the visitor chooses Remember on this device. The optional 33items_saved_preferences local-storage entry contains a preference flag and at most 100 unique numeric item IDs. It contains no email address or contact profile. Visitors can remove items, clear the list, forget the device or clear remembered items in Cookies & privacy. Removed/unpublished saved products are shown as unavailable.

Compare supports up to three published items opted into comparisons, with price, availability, material, audience, included items, limitations, delivery and specifications. Different material types and currencies show caveats; there are no fabricated winners, ratings, exchange rates or effectiveness rankings. Comparisons stay in page memory.

## Compatibility

Migration 17 adds an editorial table; existing product JSON, accounts, SMTP settings, subscribers, consent and queues are preserved. No newsletter or sequence is created by publishing an editorial page. Signup buttons link to the existing lead-page journey, which remains responsible for confirmation, consent and delivery. Public pages keep 33 items styling and affiliate disclosures. No new images were generated or external project code imported.

Validation passed: 134 backend tests, 12 client tests, production frontend/server-rendered builds and backend build. The final frontend pass also verifies explicit material type controls physical-condition badges. The live API reports schema 17, publishes the discovery flags, and returns guide listing metadata. Results are recorded in .agent-churn-control/discovery-*.log. Visual browser automation is unavailable in the current session; do not treat passing automated checks as a visual audit.

## Country-list recovery

Public bootstrap now includes the backend country list so SSR signup forms show countries before a separate browser request. Legacy/client-only pages share a validated, cached request with an eight-second timeout and an explicit Retry country list control. Failed requests are not cached; retry does not submit a signup. Preview-only example countries remain restricted to admin previews. Country-to-continent mapping, consent validation and campaign audience rules are unchanged. The focused checks passed: 49 signup/marketing backend tests and four loader tests.
