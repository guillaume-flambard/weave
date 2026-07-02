# Weave — Claude Design system preamble (read once, applies to every screen)

Paste this block at the top of EACH screen prompt (or keep it pinned in the
Claude Design conversation). It sets the rules every screen must obey.

---

## Product
Weave — a **Cognitive Runtime**: a shared organizational memory layer. It turns
teams' everyday AI activity (questions, answers, decisions across Slack / Notion /
GitHub / docs) into structured memory, and makes reusable **skills** and specialist
**agents** *emerge automatically* from recurring patterns — nobody writes them by
hand. Memory is scoped: **personal → team → project → organization**, and every
answer is traceable to its sources.

Audience for this demo: **PennyLane** (French fintech / accounting SaaS). The demo
must feel production-grade and trustworthy enough that PennyLane wants to invest
time and money. Calm confidence, not flashy AI theatrics.

## Use the Weave Design System — to the letter
Apply the loaded **Weave Design System** for all tokens and components. Do not
invent new colors, fonts, or shadow styles. Key guardrails:
- **Surfaces** white `#ffffff`; secondary fill `#f7f7f5`. **Ink** `#37352f`;
  secondary text `#787066`; muted `#9b9a97`. **Hairline** border `#e9e9e7`, 1px.
- **One accent**: blue `#2383e2` (hover `#0b6bcb`, tint `#e7f1fb`) — actions/links only.
- **Provenance pills** (keep this 4-level semantic scale everywhere memory scope
  appears): personal `#5b8fb9`/`#eef4f9`, team `#6a8f6a`/`#eef3ee`,
  project `#8a6db0`/`#f2eef8`, organization `#b08a3a`/`#f7f1e4`.
- **Type**: Inter. Body 14px, captions 11–12px, section title 14px semibold,
  page title 18–26px semibold, tracking-tight. Mono for machine ids (skill/agent names).
- **Shape**: cards `rounded-lg` (~8px), inputs/buttons `rounded-md` (~6px), pills `rounded-full`. **Flat** — no drop shadows except overlays.
- **Icons**: lucide, line style, strokeWidth 2.
- **Logo**: the "Thread W" mark (white stroke + blue emergent bead on ink `#37352f`
  rounded tile) + "Weave" wordmark (Inter 600, −1.5 tracking).
- **Signature motion**: exactly one — "emergence" (a skill/agent being born): a
  subtle scale-in (0.98→1) with a fading blue ring pulse, ~800ms easeOutExpo.
  Everything else is quiet (150–200ms fades). No parallax, no bounce, no confetti.

## Non-negotiable requirements (every screen)
- **Responsive, all resolutions.** Mobile-first. Verified breakpoints: 390 (mobile),
  768 (tablet), 1024 (small laptop), 1440 (desktop). Multi-column layouts must
  gracefully **stack or become tabs** on narrow screens. No horizontal scroll ever.
  Touch targets ≥ 44px. Fluid, readable type at every size.
- **Accessibility**: WCAG AA contrast, visible focus rings (accent), full keyboard
  nav, semantic HTML/roles, `prefers-reduced-motion` disables the emergence pulse.
- **States**: design empty, loading (skeletons, never spinners-only), error, and
  success states — not just the happy path.
- **Copy**: French UI copy, realistic PennyLane domain data (bank sync via Bridge,
  Stripe, FEC export, onboarding funnel, clients comptables). Never lorem ipsum.
- **Output**: responsive React + Tailwind matching the design system, componentized.
- **Feel**: data-dense but airy; hierarchy first; nothing shouts.

## Sample org data (reuse across screens for consistency)
- Org: **PennyLane**. Teams: **Data**, **Produit**, **Growth**, **Support**.
- People: sophie, marc, alex, nicolas, arthur, camille, léa, sarah.
- Projects/workstreams: *Synchro bancaire*, *Onboarding*, *Checkout*, *Export FEC*.
- Example emergent skills: `bancaire/relancer-synchro`, `onboarding/funnel-optimiser`,
  `org/branches-nommage-kebab-case` (promoted org-level).
- Example agents: `specialiste-data-finance-ops`, `specialiste-growth-growth`,
  plus a predefined generalist `assistant`.
- LLM badge: "Ollama (local)" or "heuristic-offline". Live status: "en direct".
