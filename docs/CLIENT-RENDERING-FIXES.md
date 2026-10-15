# Client rendering stability

The bootstrap fallback now retains the complete public bootstrap (including page, countries, activity and action data) and shares pending requests with a bounded timeout. Failed connections expose a retry. Initial fallback markup uses a branded page surface instead of a logo-only block; no spinner or blocking overlay was added.

Filtered links carry the query through both development and production initial documents. Catalog state is seeded from that query, preventing the unfiltered catalog from appearing first. Invalid filter values are bounded and discarded.

Hero expiry state, countdowns and footer year use the server bootstrap timestamp for their first render. Displayed event dates use an explicit UTC format, avoiding server/browser locale and timezone differences. Images have reserved intrinsic dimensions, editorial covers/video frames reserve an aspect ratio, and the retired appearance-cleanup script is deferred.

Validation: 25 client checks passed, including shared requests, timeout recovery, first-response query filtering, country options, and identical event markup under different browser clocks. Client, SSR and backend production builds passed. Live HTML checks cover home, product details, collections, unsubscribe and filtered home. One initial Guides request timed out; separate corrected checks returned complete Guides markup through the API and Vite in 200/156/46 ms. Its cause was not established and no blanket latency guarantee is claimed. Native browser automation is unavailable; these are HTML/render checks, not a visual or Web Vitals audit.

The local review preview was started because the API and frontend were stopped. It runs with PREVIEW_ONLY=true; queued email delivery is paused in that preview process. No email-system tests or real sends were performed. Email settings and stored jobs were not modified.
