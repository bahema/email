# Website design update

The public website now uses a warm editorial layout with a deep navy/teal palette, larger display typography, image-led resource cards, category filter pills, an upcoming section, FAQ/review treatment and a newsletter footer. The public top navigation includes an Admin button linking to `/admin/login`, including on narrow screens. A mobile menu shows the database-configured navigation links.

The owner workspace has a navy sidebar, icon navigation, breadcrumbs, account controls, responsive menu, consistent form/panel styling and a redesigned login screen. The dashboard includes quick actions, clearer metrics and a compact daily bar chart with an accessible text summary and expandable counts.

## Customize without editing code

- Website Content → Theme: choose Warm editorial, Ocean blue or Soft plum, customize colors, then save.
- Website Content → Section headings: change hero eyebrow/link, resource/upcoming introductions, FAQ/review headings and newsletter eyebrow, then save.
- Website Content → Hero/Header: change slides, headline, description, action and image/video; select an active hero.
- Website Content → Offers/Upcoming: change title, description, category, CTA, cover image and action. Image selectors show a preview.
- Media library: upload public images, then select them in Website Content. Uploaded covers take priority over illustrative fallback artwork.
- Website Content → Navigation/Footer/Signup: edit links, contact details and subscription content. General Settings controls the site name/logo.

The layout template supplies structure and system controls; marketing content, image selections, palette and main section headings are database-driven. Existing customized content and accounts were preserved. No additional schema migration was needed for the new presentation section; it is validated data in `website_sections`.

Three original images were generated with the imagegen skill for the workspace, reading and tools themes. They are generic illustrations, not photos of the fictional demo products. Cards without an assigned cover are labelled Illustration. Optimized JPEG delivery assets total about 509 KB, compared with 6.1 MB of PNG originals. Originals remain in `assets/design-source/`; the web serves `client/public/design/` locally without external image hosts.

Verification: production builds, backend CMS/public-site integration tests and local asset/API delivery. Browser connectors exposed no enabled surface, so desktop/mobile screenshot and interaction review could not be completed in this environment. The recorded final verification is in VERIFICATION.md.

The artwork has also been imported into the current installation's public Media library and assigned to eight demo records that had no image/video. Existing cover selections were preserved. Public offer image IDs and media delivery were checked successfully. On a fresh installation, run `npm run demo:seed` followed by `npm run design:assets` to make the same artwork available in the editor; the import preserves existing artwork selections.
