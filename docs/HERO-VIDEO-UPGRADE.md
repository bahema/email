# Hero conversion and video upgrade

## Editing

Open Website content → Hero / Header, choose a saved header, then Layout & media. Video feature accepts either an existing public upload or a supported URL. Selecting an upload clears the URL; entering a URL clears the upload. Choose the poster using the content/cover image. Request muted autoplay is enabled by default and can be disabled. The same VideoField and VideoPlayer are connected to lead-page cover videos and reusable video sections.

Supported links: YouTube watch, short, Shorts, live and embed URLs; Vimeo numeric video links, including private-link hashes; direct HTTPS MP4, WebM, Ogg/OGV files. Arbitrary pages, iframe HTML, non-HTTPS remote links and unsupported services are rejected. No server-side fetching of supplied video URLs is introduced. No migration or new dependency is needed; optional JSON fields have compatible defaults.

## Playback and privacy

Uploaded/direct videos use native controls, begin muted and provide an explicit Unmute button. Once hydrated, eligible videos request playback when at least 30% visible; they pause when leaving view or when the document is hidden. Reduced-motion preferences and admin previews do not request autoplay. A blocked play promise shows a manual Play button; source errors show an explanatory message. Codec, delivery-host and browser restrictions still apply.

YouTube and Vimeo do not create an iframe until the visitor enables the provider. This permission is local to that player instance and is not persisted in a cookie. The loaded player requests muted autoplay when configured, keeps controls and offers a provider link. YouTube uses its privacy-enhanced hostname; Vimeo requests dnt=1. These settings do not guarantee providers process no data. Embeds may be blocked by video-owner restrictions or browser policy. Raw provider HTML is never rendered. CSP permits only the specified providers plus self for frames.

Playing a hero video or enabling an embed stops campaign rotation. Slider keyboard handlers avoid intercepting video/player controls.

## Promotion actions

Inline signup only displays for the Subscribe action, so stale subscription settings cannot hide an affiliate CTA. Changing the primary action resets form presentation to automatic. Expiry closes the primary action, featured-resource actions and signup forms. Generic secondary navigation remains available. Hero-attributed affiliate URLs validate the active published header, slide and linked product and reject expired promotions server-side. The product's ordinary affiliate link may remain available outside the expired header.

Purpose guidance flags missing benefits, destinations, funnel connections, dates or video and explains competing actions. Existing per-slide colors, mobile assets, contrast checks, drafts and activation remain intact.

Saved header results show recorded signup requests, distinct contacts within each advertisement, activated requests and validated affiliate click events for a selected period. Activation means completing the configured consent journey, not necessarily new email-ownership verification. Clicks honor the existing affiliate-tracking switch; attribution begins with this update. No new impression tracking, visitor cookies, CTR, purchase reporting or conversion guarantees were added. Results are owner-authenticated aggregate data.

## Validation

77 checks passed: all 74 client checks and three new isolated backend checks. Coverage includes source normalization/rejection, Vimeo hash retention, mute parameters, initial external-player privacy gating, preview controls, linked video blocks, legacy defaults, publication validation, hero action conflicts, expiry, HTTP affiliate attribution, tracking opt-out and owner-only report access. Browser bundle, SSR bundle and backend builds passed. No live contacts were changed and no email tests or sends ran.

Actual browser decoding, provider playback, autoplay permission, mobile layout and captions were not verified through a browser session. No test video was uploaded or existing header published automatically. Review your chosen real assets and connected journey before activation.

References: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay ; https://developers.google.com/youtube/player_parameters ; https://help.vimeo.com/hc/en-us/articles/12426260232977-About-Player-Parameters
