# Lead experience improvement plan

Prepared 2026-10-07. Scope: lead generation, its public experience, connected subscriber and sequence workflows, and shared preview/layout conventions. This is a source-based plan, not a completed implementation or browser-verified visual audit.

## Product purpose

Help one owner create useful affiliate lead pages, collect consented subscribers, confirm email ownership, deliver a protected resource, recommend a relevant offer, and follow up through reliable email sequences. Success means less effort and clearer decisions, not more controls.

Educator is a reference for workflow and visual density. Its code should not be transplanted. Our server-backed CMS, consent records, suppression handling, protected downloads, campaign snapshots and durable workers remain the foundation.

## Findings in our current source

- `client/src/admin/LeadPages.tsx` mixes the page library and editing form. Eleven copy fields, media, sequence, offer, tags and questions occupy one long panel. There is no unsaved draft preview, search or readiness review.
- `client/src/public/LeadPageView.tsx` uses one two-column layout regardless of the selected type. Sixteen type names do not currently mean sixteen distinct public experiences.
- `client/src/styles.css` allows the workspace to reach 1440px while field controls fill their parent width. The problem is the missing layout hierarchy and appropriate field grouping, not full-width inputs by themselves.
- `client/src/admin/Leads.tsx` has a large filter panel, then places contact details and logs below the results. Acquisition details include raw JSON rather than readable labels.
- `client/src/admin/Automations.tsx` exposes delays in minutes and requires the owner to interpret execution behavior from a paragraph.
- Newsletter previews already exist, but appear below the editor. Website previews are saved public pages, with selected-image thumbnails inside forms.
- Lead routes support list/create/update and public lookup. Duplication, dedicated publish/readiness actions and page-specific reporting require backend work; they are not existing capabilities.
- Existing analytics record submissions, confirmations, downloads and affiliate clicks. Page visits are not currently a measured conversion denominator.

## A. Workspace composition

1. Establish shared page headers with title, short purpose, primary action and contextual secondary actions.
2. Give ordinary forms a readable width, approximately 680-800px; reserve wide layouts for tables and split editors.
3. Create reusable toolbar, compact tabs, status badge, empty state, notification and drawer components.
4. Use horizontal tabs only for related tasks; saved records become a searchable library, not a growing row of tab-like buttons.
5. Standardize spacing, typography, border contrast, active states and semantic colors. Avoid nesting decorative boxes around every field.
6. Use paired fields only when related, with short controls for status, slug and tags; long copy gets deliberate reading width.
7. Keep essential touch targets at least 44px in mobile layouts. Compact desktop density must remain legible.
8. On narrow screens, show edit/preview modes rather than squeezing two columns together.

## B. Lead-page library

9. Open on a real library, not an empty editing form.
10. Add search and status/purpose filters, a result count and reset action.
11. Offer compact cards and a table view. Each record shows name, purpose, state, URL, resource/sequence connections and measured lead counts.
12. Use small page thumbnails with lazy rendering rather than mounting a live iframe for every record.
13. Offer edit, preview, copy link, duplicate and pause/publish actions. Keep less common actions in an accessible menu.
14. Add per-page reporting links and last-updated metadata.
15. Preserve list search and scroll position when returning from editing.
16. Provide helpful first-use and no-match states, with a clear create/reset action.

## C. Creation and editor

17. Start with five purpose families: resource/download, newsletter/deal alerts, waitlist/product interest, event/course signup, and questions/qualification. Keep existing types compatible without promoting unsupported specialist engines.
18. Offer a small curated set of visibly different layouts: focused opt-in, resource showcase, and event/interest signup. Purpose and visual layout are separate choices.
19. Generate a suggested slug from the title, allow edits, and show the resulting URL. Existing published slugs require an explicit warning before changing.
20. Use a split editor: approximately 360-420px controls and a flexible preview on sufficiently wide screens.
21. Organize controls into Content, Form, After signup, and Appearance. Group advanced email text and URL settings behind disclosures.
22. Keep a persistent action bar with draft/saved state, preview, save and publish controls.
23. Show unsaved-change indicators and protect navigation away from dirty drafts. Start with explicit saves rather than unclear silent publication.
24. Separate saving edits from publishing. Saving an active page's unpublished changes needs persisted draft/published versions and a migration; an unsaved preview alone does not supply that behavior.
25. Show inline errors next to their fields, focus the first invalid field and preserve edits after failed requests.
26. Display text counters only when approaching useful limits.
27. Add a searchable thumbnail media picker with public image/video checks and a clear remove action.
28. Show protected resources as file cards with name, type and size. Never expose a private file directly through public preview URLs.
29. Replace comma-separated tags with chips. Suggest existing tags and normalize new entries.
30. Build questions through readable rows: label, text/choice answer type, required switch and reorder actions. Generate stable internal keys without making owners type identifiers.
31. Keep dependent fields contextual: resource options for downloads, questions for qualification and an optional offer after confirmation.

## D. Preview system

32. Render lead previews through the same presentation component as public pages, using current draft data.
33. Provide phone, tablet and desktop viewport presets, fit-to-panel behavior and full-screen preview.
34. Preview the page, validation errors, submission acknowledgement, confirmation email, confirmation success and resource/offer state.
35. Clearly label simulations. Preview submissions must not create contacts, count analytics, enroll sequences or send emails.
36. Keep private-file previews authenticated and bounded; show resource metadata or a protected sample rather than issuing production download tokens.
37. Show selected content consistently, with honest missing-image placeholders and stable image dimensions.
38. Mark stale newsletter/recipient previews when relevant edits change their inputs.
39. Apply the shared preview shell to newsletter and website-content previews, while retaining their own renderers. Preview width never promises exact email-client rendering.

## E. Public lead experience

40. Give each supported layout a strong benefit headline, appropriate cover/video, short supporting copy and one primary action.
41. Use bounded form widths, balanced spacing and readable mobile typography rather than stretching every section.
42. Provide useful purpose-specific acknowledgement and success copy: check your email, receive alerts, confirm attendance interest, or unlock a resource.
43. Preserve consent and email confirmation. Name and country remain supported; making either optional requires changes to validation, segmentation assumptions and tests before exposing the option.
44. Improve question controls, autocomplete, field error summaries and submission progress. Retain entered answers after an error.
45. Explain confirmation and resend steps clearly. Show loading, expired-link and unavailable-resource states with a practical next action.
46. Keep the recommended affiliate offer secondary to successful resource delivery and disclose the relationship appropriately.
47. Use owner-provided images and accurate benefits. No invented testimonials, ratings, deadlines, scarcity or conversion claims.

## F. Readiness and reporting

48. Add a short readiness checklist: required copy, unique slug, valid media/resource, usable CTA, confirmation content and connected sequence state.
49. Distinguish blockers from optional suggestions. Missing optional artwork must not automatically block publication.
50. Show actual SMTP/worker configuration status; a configured sending domain is not evidence that public DNS routing works.
51. Explain that a paused sequence will not currently deliver follow-up, with a link to fix it.
52. Add page-specific submissions, confirmed submissions, downloads and attributed affiliate clicks with a date range and metric definitions.
53. Label confirmation rates with their actual denominator. Do not claim visit-to-signup conversion unless real visit measurement is added with clear privacy and deduplication rules.
54. Keep sample content visibly separate from production reporting; do not manufacture lead timelines or scores.

## G. Leads and follow-up

55. Replace the oversized filter form with search, a few essential filters and a collapsible advanced section; show active filters as removable chips.
56. Open contact details in a desktop drawer or mobile detail view, preserving table position and filters.
57. Present consent, source page, UTM labels and answers as readable sections instead of raw JSON.
58. Group pending, confirmed and stopped-contact states with clear meanings. Separate unsubscribe/suppress actions from everyday edits.
59. Show a focused acquisition and delivery timeline, distinguishing queued, attempted, SMTP-accepted and failed messages.
60. Present sequence steps vertically with human-readable timing (Immediately, After 1 day) and compatible day/hour/minute inputs. Preserve the existing timing-from-confirmation model.
61. Add concise links between a page, its subscribers, selected resource and sequence so the owner can troubleshoot without searching unrelated screens.

## H. Quality and performance

62. Use accessible keyboard tabs, visible focus, labelled icon buttons, focus-trapped dialogs/drawers and correct focus restoration.
63. Standardize loading skeletons, retry states, empty states, button progress and success feedback.
64. Prevent duplicate saves and stale request results overwriting another selected record.
65. Lazy-load preview/editor code and asset thumbnails, debounce preview updates and avoid chart/animation dependencies for decoration.
66. Respect reduced motion; keep animations short and functional.
67. Verify narrow screens, long titles, large libraries, keyboard-only use and missing assets. Target no horizontal page overflow at 360px and usable split editing around 1280px.
68. Run meaningful API tests for new persistence/publishing/duplication behavior, preview isolation, authorization and resource protection, plus production builds and existing lead/worker regression tests.

## Deliberately excluded

- AI scoring, fictional performance grades and invented activity feeds.
- Referral reward engines, contest ticketing, appointment scheduling, payments, summit passes and ROI calculators.
- A/B traffic splitting before reliable measurement and enough traffic justify it.
- Arbitrary drag-and-drop website builders and dozens of niche presets.
- Auto-generated urgency, stock claims, ratings or partner verification badges.
- DNS controls inside the lead editor, team roles, separate audience-list concepts and complex branching automation.

Existing page records remain readable. Older types are grouped honestly; a quiz currently captures answers rather than calculating a score, and a giveaway signup does not operate a contest engine.

## Delivery order and acceptance

1. Shared compact layout and lead library: usable list/search/selection without opening the giant form.
2. Split editor and unified previews: draft changes visible immediately, simulations isolated, mobile edit/preview switching.
3. Public layouts and confirmation/resource experience: distinct focused layouts and clear next steps, with all protections retained.
4. Publish readiness and measured reporting: explicit save/publication semantics, no invented metrics.
5. Subscriber drawer and sequence usability, then shared website/newsletter preview polish.
6. Regression, accessibility, responsive and performance verification. Browser visual verification must be reported as unverified if browser access remains unavailable.

Completion means an owner can create, preview, save, publish and share a lead page without navigating a long wall of unrelated fields; a visitor can understand the benefit and complete confirmation; the owner can identify captured leads and troubleshoot delivery using actual records.
