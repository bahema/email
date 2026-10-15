# Final email and download workflow

## Send without changing screens

Open Newsletters, compose or select Old email, and Save email. Open Audience options, select one or more continents or Select all, then Send now. Eligible counts represent confirmed subscribers. Unsaved content cannot be sent. Saved drafts can be promoted to Ready by an explicit send. Protected download templates cannot be broadcast because their links require a funnel recipient grant.

Campaigns also has the shared continent sender on the broadcast editor screen. Save the campaign name and email first, then choose continents and Send now. The saved draft becomes the launched campaign, rather than creating a duplicate campaign. Existing advanced segment and scheduling workflows remain available.

Old email uses one centred searchable overlay. Preview, edit HTML/subject/preheader, insert an uploaded public image, save as ready, delete an unused email, or select it. Selecting closes the overlay. Referenced newsletters cannot be deleted. Confirmation remains the fixed system email; marketing emails have no automatic header/logo and retain the protected unsubscribe footer.

## Deliver a free resource after confirmation

1. Open Downloads in the admin sidebar. Create a download page with title, description, instructions, button label and a private uploaded file. PDF and other enabled extensions use existing content validation and Settings upload limits. Optional cover images must be public. Publish the download page.
2. In Newsletters, create the related offer/resource email. Insert protected download-page button to add `{downloadUrl}`, then save it as Ready.
3. In Lead pages → After signup, Select email through the shared library, choose the protected download page, and publish the funnel. Download-page connections require the double confirmation journey and a connected ready email containing the protected link.
4. The visitor signs up, sees Inbox/Promotions/Spam instructions, receives the fixed confirmation email, explicitly confirms, then receives the connected resource email. Its personalized link opens a complete server-rendered branded download page. The file is served as an attachment by the existing protected endpoint.

Download links are opaque, expire after 24 hours, and require a confirmed contact and confirmed submission. Files stay private. Invalid, expired and blocked access return useful complete HTML pages without SPA loading. These pages are noindex, no-store and no-referrer. Unsubscribe blocks subsequent marketing and protected resource access under the existing policy. A link is a bearer credential and should remain private; this is not DRM.

Download-page content and files are snapshotted at signup, preserving promises for earlier subscribers after later edits. Media references protect files and cover images from deletion. In-use download pages cannot be deleted/unpublished. A connected resource email cannot lose its download placeholder. Existing direct resource downloads remain compatible.

## Squeeze pages

The new Squeeze page preset uses the existing funnel editor, focused layout, compact branding and editable benefits/form content. Colours, copy, layout, existing images, questions, sections, email connections and previews remain editable. It uses the same consent and confirmation lifecycle.

## Verification

- Full backend suite: 117 passed, 0 failed.
- Client document-startup suite: 4 passed, 0 failed. Download pages bypass SPA initial-document loading.
- Client, SSR and backend production builds passed.
- Real local SMTP capture covers confirmation, related email with personalized download-page link, sequence, file download and one-click cancellation.
- Dedicated tests cover continent filtering, repeated request idempotency, saved campaign reuse, stale content revision, missing sender, empty audience, protected-template broadcast rejection, pre-confirmation denial, expired/unknown grants, download snapshots and unsubscribe denial.
- Running API responds with schema version 15; private Downloads API rejects unauthenticated requests. Browser-facing invalid download link returns complete branded 404 HTML; homepage with HTML Accept header includes server-rendered main content.

Initial full check exposed two outdated fixtures (35 template count and real-time enrollment date in a fixed analytics window); both were corrected, and the final full suite passed.

No live subscriber emails were sent, real Gmail inbox was not inspected, and interactive browser automation was unavailable in this session. SMTP acceptance is not proof of inbox placement. This completes the requested local workflow, not a public deployment or a guarantee of legal compliance or deliverability.
