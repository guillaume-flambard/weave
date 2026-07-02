# Field 2 — "Any other notes?"

Paste this into the **Any other notes?** box at the bottom of the Claude Design setup screen.

---

AESTHETIC — Notion. White surfaces (#ffffff), near-black ink (#37352f), thin gray
hairline borders (#e9e9e7, 1px), generous whitespace, flat cards (no drop shadows),
Inter typeface. A SINGLE restrained blue accent (#2383e2) for actions/links only —
no gradients, no neon, minimal emoji. Icons are line-style (lucide), strokeWidth 2.
The full token set is in the attached `design-tokens.md`; please extend it, don't
replace it.

COLOR SYSTEM — Neutrals do the work; accent is used sparingly and always semantically:
blue = action. There is a secondary semantic scale of four DESATURATED "provenance"
pills that must be preserved and expandable — personal (blue #5b8fb9 / #eef4f9),
team (green #6a8f6a / #eef3ee), project (purple #8a6db0 / #f2eef8), organization
(gold #b08a3a / #f7f1e4). These encode the memory scope levels and appear as small
capsule badges.

TYPE — Inter. Body 14px, captions 11–12px, section titles 14px semibold, page title
18px semibold with tight tracking. Monospace for machine identifiers (skill/agent
names). Small uppercase tracked micro-labels for sub-headings.

SHAPE — cards rounded-lg (~8px), buttons/inputs rounded-md (~6px), chips rounded-full.
Flat by default; elevation reserved for popovers/overlays only.

MOTION — one signature moment: "emergence" (a skill or agent being born) = a subtle
scale-in with a fading blue ring pulse, ~800ms, easeOutExpo-ish. Everything else is
quiet.

VOICE — calm, precise, product-grade, trustworthy. French UI copy for the current
demo, but design tokens/components should be locale-agnostic. Nothing shouts.

COMPONENTS I NEED — please generate: buttons (primary/secondary/ghost), inputs &
textareas, select, capsule/pill badges (incl. the 4 provenance levels + status:
active/pending), bordered content cards & panels with header + count, tabs / segmented
scope selector, toast/flash banner, tooltip & guided-tour popover, empty states,
avatars/initials, live "connected/offline" status indicator, progress bar (pattern →
threshold), a two-column "answer + provenance layers" result block, and a top app bar.

CONTEXT — this is a B2B SaaS console (data-dense but airy), desktop-first. Design
partners are PennyLane and Notion, so leaning into the Notion look is intentional.
See the attached screenshots for the current live product.
