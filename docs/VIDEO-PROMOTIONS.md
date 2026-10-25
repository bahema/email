# Video promotion pages

Local owner editor: `/admin/video-promotions`. Published pages use `/promotions/{slug}` with the existing public navigation and footer. No new environment variable, database migration or email provider is required. The collection is stored in the existing website-sections table; preserve the production database and original encryption key during deployment.

## Publish a promotion

1. Create a promotion and set its headline and unique URL slug. Drafts are private.
2. Choose an uploaded public video or a supported HTTPS video link, plus a poster image. Existing media validation and reference protection apply. YouTube and Vimeo load only after visitor permission; autoplay is muted and subject to browser preferences. Provide accurate captions through the video/provider and a useful written description.
3. Set the hero layout/colours and supporting text. Text is rendered as text, not injected HTML. Hero text must meet a 4.5:1 contrast ratio; button ink adjusts automatically.
4. Optionally connect a main offer button, up to three related offers, and an active subscription lead page. An offer button can open saved details or its existing affiliate redirect. Signup uses the lead page's existing consent, confirmation, email and download journey, without a second acquisition system.
5. Review the desktop/mobile draft preview. Publish explicitly, with optional start/end dates. Times entered in the editor use the owner's local timezone and are stored as ISO timestamps. Changing a published slug breaks previously shared URLs; no automatic redirect is created.
6. Enable the notification separately if desired. Blank notification title/message/image reuse the page headline/introduction/poster. Adding a video alone does not activate advertising.

## Side notification behaviour

- Fixed card above the page, with no backdrop, scrolling lock, automatic navigation or layout displacement.
- Choose left/right, destination-page scope, 3–120 second delay, 6–30 second visible duration and 1–168 hour cooldown within the same browser tab.
- One eligible promotion per page visit; collection order determines priority. No rotating queue of interruptions.
- Waits while the privacy notice or a dialog is open and while the document is hidden. Its visible timeout pauses on hover/focus. A dismiss button is always available. No automatic focus capture, sound, video or animation.
- Limited to configured public browsing paths. Excluded from admin, lead pages, confirmation, unsubscribe, downloads and promotion pages.
- A small bounded session-storage record remembers promotion identifiers/display times in that tab. No contact details, tracking cookie, browser-push subscription or notification permission is involved. An in-memory fallback works if storage is unavailable. Clearing browser storage or opening another tab/device can allow a notice again.
- Inactive, draft, not-yet-started and expired promotions are omitted from public content. Search engines, public metadata and sitemaps follow the same publication filter. Indexing can be disabled separately.

## SEO and sharing

Published pages have server-rendered content, canonical URLs, editable title/description, Open Graph and Twitter preview metadata and sitemap entries. VideoObject data is emitted only with a supplied poster, description and actual video publication date. Search engines/platforms control indexing, cached previews and rich results; no ranking or inbox/delivery claim is implied.

## Limits and release checks

The first version supports twenty promotions and three related products per page within the existing request-size limit. Existing offers/media remain independent records. Remove promotion references before deleting a connected offer; removing a promotion leaves offers, media, contacts and email journeys intact.

Tests cover authentication/CSRF, draft privacy, schedules, unsafe video links, private/wrong-type media, broken/duplicate references, contrast, escaped content, shared navigation/footer, SEO/sitemap, notification timing and private-path exclusions. No live email is sent by these tests. Visual browser verification remains a separate release check if the browser tool is unavailable.
