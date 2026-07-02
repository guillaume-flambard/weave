# Screen 6 — Connect sources (onboarding / integrations)

*(Prepend `00-system-preamble.md`, then this.)*

## Goal
Show how real work flows into Weave — Slack, Notion, GitHub, docs — and how scope &
privacy are controlled. PennyLane needs to see it plugs into their real stack and
respects data boundaries. This is the "it's not a toy, it fits our world" screen.

## Layout (desktop 1440)
- **Header**: "Connecter vos sources" + subtitle ("Weave lit l'activité IA de vos
  outils pour construire la mémoire — en lecture seule, scopée par équipe.").
- **Connector grid** (cards): Slack, Notion, GitHub, Google Docs, Linear, "+ Autre".
  Each card: logo, name, one-line role, status (Connecté ✓ / Non connecté), and a
  primary "Connecter" or a "Gérer" secondary. Connected cards show last sync + a
  health dot + item count ("1 240 messages lus").
- **Configuration panel** (revealed when a connector is selected, right drawer on
  desktop): choose **workspaces/channels/repos**, map them to **teams & workstreams**,
  set **read-only** scope, and a **privacy note** ("Aucune donnée n'est réécrite ;
  parsing local possible"). Include a small preview of what will be ingested.
- **Footer strip**: "Ou importez un export" (fichier) + "Simuler des données de démo"
  for evaluators without live creds.

## Responsive
- 1024: connector grid 2-up; config becomes a modal instead of a side drawer.
- 768: grid 2-up; config full-screen sheet with a sticky "Enregistrer".
- 390: grid 1-up; connect flow is a full-screen step sheet (source → scope → confirm);
  large touch targets; no horizontal scroll.

## Interactions / motion
- Connecting: button → loading → success with a quiet check (no confetti). New health
  dot appears. If a first connection triggers immediate memory, a subtle link toast
  ("La mémoire commence à se construire — voir le workspace").
- Toggling a channel updates the "will ingest" preview live.

## States
- **None connected** (first run): a prominent, encouraging zero-state + the demo-data
  fallback CTA.
- **Partial / error**: a connector in error shows an amber (use organization pill
  tone, not a new red) inline message + reconnect.
- Loading skeletons for cards.

## Acceptance criteria
- Reads as a real integrations screen (à la Notion/Linear settings), trustworthy.
- Privacy / read-only / scoping is explicit.
- Responsive 390→1440, AA, keyboard-navigable, restrained color (amber via org pill tone only for warnings).
