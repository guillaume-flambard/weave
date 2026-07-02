# Screen 1 — Org dashboard (home)

*(Prepend `00-system-preamble.md`, then this.)*

## Goal
The screen a PennyLane exec lands on. In one glance it must say: "our teams' AI work
is compounding into org intelligence — and here's the proof and the ROI." This is the
trust + value screen; it frames everything else.

## Layout (desktop 1440)
- **Top app bar**: Weave logo (mark + wordmark) left; global search center; org
  switcher ("PennyLane"), live status "en direct", LLM badge, user avatar right.
- **Page header**: "Vue d'ensemble" + a scope segmented control (Organisation ·
  Data · Produit · Growth · Support) + date range.
- **KPI row** (4 stat cards): *Mémoire* (66 faits, +12 cette semaine), *Compétences
  vivantes* (10, dont 1 promue org), *Agents actifs* (3), *Questions résolues par la
  mémoire* (128, ↑ tendance). Each card: label, big number, small delta with a tiny
  sparkline. Use the accent only for the positive trend.
- **Main split (2/3 + 1/3)**:
  - Left, large card **"Croissance de la mémoire"**: an area/line chart of facts &
    skills over 30 days, with markers where skills emerged. Clean, single accent line.
  - Right, **"Émergences récentes"** timeline: a vertical feed of "compétence née /
    promue org / agent émergé" events, each with the provenance pill, actor, time,
    and a link to detail. The newest item uses the emergence pulse once on load.
- **Bottom row (3 cards)**: *Compétences en vedette* (top 3 skills by usage),
  *Agents* (mini list with status), *Sources connectées* (Slack/Notion/GitHub with
  health dots + "Connecter une source" CTA linking to screen 6).

## Responsive
- 1024: KPI row 2×2; main split becomes stacked (chart full width, then timeline).
- 768: single column; KPI cards 2-up; charts keep aspect, legends wrap.
- 390: single column; KPIs stack 1-up (or a horizontal snap-scroll of stat cards);
  scope control becomes a dropdown; timeline compact. No horizontal scroll.

## Interactions / motion
- Scope control filters KPIs, chart, timeline (animate number changes, 200ms).
- Hover a chart emergence marker → tooltip with the skill name.
- Newest timeline item: one emergence pulse on first paint (respect reduced-motion).

## States
- **Empty** (new org, no activity): friendly zero-state with the logo mark, one line
  ("Connectez une source ou simulez l'activité") and two CTAs (Connecter / Simuler).
- **Loading**: skeleton KPI cards + shimmer chart.
- **Error** (data fetch): inline card with retry, never a blank page.

## Acceptance criteria
- Reads as an executive dashboard, not a toy. KPIs frame ROI.
- Perfectly responsive 390→1440, no overflow, AA contrast, keyboard-navigable.
- Only the accent blue + provenance pills carry color; everything else neutral.
