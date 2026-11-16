# Product sharing for TikTok

Each published offer or upcoming item uses its existing Share window. The TikTok button selects the vertical poster and exposes caption copying, poster download and an on-demand animated MP4. Health product URLs resolve to the same saved offer, without another product record.

Videos are ten seconds, 1080 × 1920, 30 fps, silent H.264 MP4 with independently animated branding, image, title, description, price and availability. Elements slide/fade into a stable final layout; the website and relevant disclosure remain readable. Missing product fields are omitted. Visitors upload/publish in TikTok themselves or choose a compatible app through their device's file-sharing menu. There is no TikTok login, automatic posting, third-party embed or new subscription/email flow. The receiving app controls caption handling, publishing, link support and availability in the device share menu.

FFmpeg must be installed on the server. The Dockerfile includes it; local development uses `ffmpeg` on PATH, or an operator can set `FFMPEG_PATH` to an installed executable. No user-supplied command, source URL or filesystem path is passed to the renderer. Existing public product images, poster formatting, branding and affiliate disclosure are reused. Drafts and private/missing product images cannot request or retrieve videos.

Resource limits: one encoder at a time, up to two waiting jobs, ten creation requests per IP per minute, thirty new renders per process per rolling hour, eight in-memory jobs, six MB maximum per output, a ninety-second encoder timeout and one-hour cache expiry. Repeated requests for the same asset reuse its job. New product data or changed media access changes eligibility/cache identity. Access is rechecked when preparing and downloading, and video responses use no-store. Restarting the server clears temporary job/cache state; the visitor can retry. Downloading posters remains the fallback when video capacity or FFmpeg is unavailable.

The encoder uses isolated temporary files and removes its own directory after success/failure. Exports are not added to the media library or subscriber database. No contacts, SMTP settings or email queues are modified.

## Text fitting and visitor background choices

Share exports measure text using the same font engine that draws it. Titles, badges, prices and website text fit reserved pixel boxes, using smaller fonts and a final ellipsis only when needed. Existing content fields and export dimensions are preserved. Long video summaries use the same bounded fitting approach.

The Share window offers background presets and a custom color, applied explicitly to image and TikTok video exports. Foreground text automatically reaches at least 4.5:1 contrast; existing brand and price badge text keep their readable colors. The choice is per export, with no product, contact or website-setting writes. Applied backgrounds also travel in versioned product links used by Facebook, X and other link-sharing buttons. Server-rendered Open Graph and Twitter images use that color; the canonical SEO URL remains the clean product URL. Platforms control cached previews and cropping. Six-digit colors are validated, included in image/video cache identities and retained through download/retry URLs. Applying another color clears the old preview/video selection. Website-default and explicitly identical video colors share one rendering job.

## High-resolution image exports

The Share window defaults to native 4K image downloads, with 3840 pixels on the longest edge: landscape 3840 × 2016, square 3840 × 3840, portrait 2560 × 3840 and story 2160 × 3840. Text and layout are rendered at export resolution; original photo detail depends on the uploaded source. Standard previews remain lightweight and videos remain 1080 × 1920. A Standard download option is available. Compatible device sharing prepares a 4K file first, then requests a second click to open the native share menu with a fresh user gesture.

4K rendering accepts only these fixed sizes, allows one distinct render at a time, caches at most four high-resolution images and limits export requests to twenty per IP per hour. Identical pending requests reuse their render. Busy exporters return Retry-After; no visitor-selected URLs or executable commands are used.
