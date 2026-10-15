# Video promotion, repeat signup and admin color update

## Existing features verified

The homepage and admin preview use the same HeroHeader component. Saved headers replace the homepage header only when activated. Video layouts support a headline, subheading/supporting text, a public uploaded video, optional cover, primary/secondary buttons, colors and placement. Subscribe opens the centered signup overlay; Affiliate opens the selected published offer through its tracked /go redirect. Inline signup can also be configured. There is no separate duplicate hero engine.

Contacts already had trimmed/lowercased emails and a database uniqueness constraint. Marketing jobs and sequence enrollment already have uniqueness rules. The public signup response was intentionally generic, while repeated page submissions could still generate redundant acquisition records and later related emails.

## Completed to-do list

- [x] Require a public video before activating a visible video advertisement. Empty video drafts remain editable and have an informative admin preview placeholder.
- [x] Clarify the video picker, subheading field and CTA setup in the header editor. Use existing uploads; no images were generated.
- [x] Prevent repeated pending submissions from creating more acquisitions or rotating a still-valid confirmation token for the same journey.
- [x] Prevent already completed journeys from creating duplicate immediate campaigns or hero notifications.
- [x] Treat footer and general newsletter forms as the same subscription journey, retaining the first recorded source.
- [x] Preserve separate requests for genuinely different offers/promotions. Selecting a different connected email ID, automation, resource, download page or delivery mode creates a new journey configuration. Editing copy in the same completed promotion alone does not restart its delivery; create a new header/advertisement or connect the new offer when starting a different promotion.
- [x] Add an in-memory same-form repeat notice and immediate submit guard. There is no new browser cookie, localStorage or subscriber-status lookup.
- [x] Provide a source-scoped fresh confirmation-link request with a 60-second UI/backend cooldown.
- [x] Allow confirmed subscribers to recover a fresh link to their original promised resource without another acquisition, sequence enrollment, related campaign or activation notification.
- [x] Keep opted-out contacts inactive unless a new explicit consenting submission exists; suppressions remain blocked.
- [x] Apply a navy sidebar/topbar, blue-tinted canvas/cards/tabs, green actions/success states and red errors/destructive text. Add mild shadows and clear card boundaries. Public theme colors and layouts retain their controls.
- [x] Numerically check twelve important foreground/background pairs. The minimum measured ratio is 6.08:1, above the 4.5:1 ordinary-text threshold. This is a scoped palette check, not a complete WCAG certification.

## How to use the video hero

1. Go to Website content → Hero/Header at `/admin/content#hero`.
2. Create or edit a saved header and choose Video, or choose Video for an advertisement within a slider.
3. Under Content, set the headline, Subheading / supporting text and primary button label.
4. Under Layout & media, select an existing public video and optional cover. If uploading mp4/webm is disabled, first allow the format in Settings → Uploads.
5. Select Subscribe to this promotion to open its centered form. Connect an active signup funnel under Subscription when this promotion needs its related offer email/resource/sequence.
6. Alternatively select Open an affiliate offer and choose the published affiliate product. The button follows the tracked offer redirect, with sponsored-link markup.
7. Preview, save and Review & activate. A video-less visible promotion cannot be activated. A saved draft does not replace the live homepage until activation.

## Duplicate behavior and privacy

One normalized email address has one contact record. Pending repeats keep the existing confirmation request; completed repeats keep the existing journey. Distinct offers remain legitimate new acquisitions for the same contact. Existing historical submissions are preserved rather than deleted.

The form can say that an email was submitted earlier in that same mounted form because this information came from the visitor's own actions. Across browsers or sessions, the public response remains identical regardless of whether that address exists; it says that an existing subscription is kept and confirmation may be required. Returning exact database membership for arbitrary email input would reveal other people's subscriptions. A verified link proves access to the mailbox before completing/recovering a private journey.

Repeated attempts still reach backend consent/status validation: a same-browser notice cannot accidentally block fresh consent after an unsubscribe. Explicit fresh-link requests replace pending confirmation jobs. Recovery for a completed submission marks the new token used and verifies email ownership, without repeating its original marketing activation. A fresh valid resource grant may be issued on the confirmed landing page. The previously promised resource remains frozen.

Email normalization trims whitespace and ignores case. Provider-specific aliases, plus addressing and Gmail dot variations are not automatically merged, because guessing mailbox equivalence can merge different intended contacts. The guarantee concerns a normalized address, not every possible alias of a mailbox.

## Verification boundaries

Tests use isolated databases and fictional recipients; no live subscriber send was requested for this work. Browser inventory returned no available surfaces, so actual desktop/mobile video playback, overlay interactions and visual appearance could not be reviewed in a browser. The build and server-rendered markup tests verify the shared components and action markup; a universal 100% UI, privacy or delivery guarantee is not claimed.

Relevant primary references:
- Contrast minimum: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- Consistent public account-recovery responses: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html


## Final results

- Full backend suite: **126 passed, 0 failed**.
- Client startup: **4 passed, 0 failed**.
- Workspace type checking and client/SSR production build: passed.
- Backend build after the final general-subscription change: passed.
- Twelve checked text/background pairs: passed; minimum **6.08:1**.
- Regressions cover normalized pending/completed repeats, newsletter/footer compatibility, source-scoped recovery, opted-out fresh consent, different-offer delivery, single-opt-in delivery deduplication, video publishing, both video CTA types and duplicate hero notifications.

Older token-rotation and empty-video test fixtures were updated to exercise explicit recovery and valid publication; assertions still verify replaced-token rejection and homepage feature preservation. Evidence is retained privately in `.agent-churn-control/hero-duplicate-*`. Browser visual/interaction testing remains unavailable.
