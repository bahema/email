# Client and admin consistency audit

Scope: discovery and editorial features inspired by the supplied beauty/wellness frontend, plus existing offer presentation. No email-system code was changed, no email tests were run, and no real contacts were created or messages sent.

| Client feature | Admin source | Match |
|---|---|---|
| Material filters | Offers / Upcoming > Product information > Material type | Shared backend field with legacy delivery-type fallback |
| Price filters and badges | Price, badges & delivery conditions | Hidden prices stay unknown; currency required for ranges and sorting |
| Availability / condition | Availability and physical condition fields | Shared ProductFacts/StatusBadge rules |
| Saved items | Discovery options > Enable saved items / heading | Admin controls availability; visitor owns item choices |
| Comparisons | Discovery options > Enable comparisons; per-item Allow comparison; specifications | Three published items; no fabricated ranking |
| Hero and lead-page product actions | Same item records and discovery flags | Save/compare added to these card surfaces |
| Collections | Collections editor | Published product selection, introduction, cover, order, homepage flag |
| Guides | Guides editor | Body, cover, category, related products/guides, homepage flag |
| Signup section on a guide | Connected existing lead page | Now included in admin preview, with navigation disabled in preview |
| Editorial navigation | Navigation editor or automatic published-page links | Automatic links no longer duplicate configured links |
| Beauty/usage information | Product information > optional documented details and sources | Client details render saved ingredients, instructions, cautions and links |
| SEO/social previews | Editorial SEO fields and cover | Server metadata and canonical/sitemap use published records |
| New client palette | Theme > navigation/catalog/action controls | Current 33 items colors are defaults; owner can replace them |

There are no hard-coded product or article demo lists in these features. Collections and guides remain empty until the owner publishes them. System controls and safety wording remain code-controlled; this audit does not claim every interface word is editable.

Public pages and admin previews now share one theme-style mapper, including the new navigation and catalog controls. Validation: 20 client tests passed, frontend/server-rendered builds passed, and the backend production build passed after the schema additions. No email-system test suite was run.

Automated checks are recorded in .agent-churn-control/ui-consistency-* and theme-matching-* files. Native browser automation remains unavailable, so visual layout/interaction checks are not claimed.
