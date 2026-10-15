# Item social-sharing audit

Checked 2026-10-15T05:35:44.886Z. Read-only local HTTP audit; no posts, private account access or emails.

Five published items, 20 HTML requests with Facebook, LinkedIn, X and WhatsApp crawler user agents: 20 passed basic local checks. Every page returned 200 with initial HTML and a single nonempty item-specific OG title, description, image and URL, plus X large-image-card tags. Share buttons target item detail pages.

| Item | Local checks |
|---|---|
| Demo Software Toolkit | 4/4 |
| Demo Business Workshop | 4/4 |
| Demo Business Guide | 4/4 |
| Demo Toolkit Launch | 4/4 |
| Demo Reading Resources | 4/4 |

Three unique image URLs returned JPEG data without authentication or download attachment headers. All are 1536 × 1024 pixels, approximately 148–184 KiB. Images were fetched once per unique URL using the first crawler user agent, not independently with every agent. This verifies local accessibility and JPEG structure, not a visual crop.

Warnings: all five items still contain demo content; configured website name is Affiliate Engine; metadata does not declare uploaded image dimensions. Canonical and image URLs use HTTP localhost.

Actual social preview rendering: NOT VERIFIED. A crawler user-agent string does not reproduce the real platform service. Localhost cannot be reached by those external services. Deploy with public HTTPS, set the public origin, then use real platform inspection and shared-link checks. No claim of universal platform rendering, image crop or cache refresh is supported by this audit.
