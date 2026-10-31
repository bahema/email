# FAQ resource previews

Manage previews at **Admin → Iframe & embeds** (`/admin/embeds`). Add a title, HTTPS source, optional cover image and an existing offer. Website previews require the owner to review the provider’s embedding permission; publishing requires an active connected offer. YouTube and Vimeo are supported in video mode. Save, publish and choose **Use beside FAQ**, then save again. Publishing alone does not enable a panel.

The selected preview occupies 40% of the desktop FAQ section; questions occupy 60%. The section height is editable from 360–900px (600px by default). Both panels have internal scrolling; the embedded document controls its own scrolling. On small screens the panels stack and keep their configured heights. The external site must itself support mobile viewing and scrolling.

Visitors explicitly enable the provider before its iframe loads. **Open full preview** opens the configured URL in a new tab with `noopener noreferrer`; the affiliate action uses the connected offer’s existing tracked destination. Sharing uses that offer’s existing product share system. No duplicate offer or email flow is created.

Failed loads and timeouts hide the panel, expanding FAQ to full width while preserving section height. Cross-origin browser restrictions prevent reliable automatic detection of all `X-Frame-Options` or CSP `frame-ancestors` failures; an iframe load event does not prove successful rendering. The visible **Preview not working? Hide it** control covers this case. Previewing a saved draft in admin connects to the provider without publishing it.

Only the selected, published preview with an active offer is exposed publicly. Draft preview routes require owner authentication and return `no-store` responses. Public frame CSP allows the selected provider origin rather than all HTTPS sites. URLs must use public-shaped HTTPS hostnames; no server fetch or third-party proxy is performed. Website frames are sandboxed without popup/top-navigation permissions. Provider origin storage is off by default and should only be enabled for trusted providers. Own-site embeds are rejected. Existing public-media validation and media reference protection cover preview images.

No external example, preview or production configuration is enabled automatically. These changes require no database migration.
