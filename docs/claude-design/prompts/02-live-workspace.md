# Screen 2 — Live workspace (the hero console)

*(Prepend `00-system-preamble.md`, then this.)*

## Goal
The centerpiece. PennyLane watches org intelligence build **in real time**: activity
streams in, facts are extracted, a pattern crosses a threshold, and a reusable skill
is *born* on screen. This is the "wow, it's alive" moment — must feel effortless and
credible.

## Layout (desktop 1440)
- **Top app bar** (as screen 1) + a right-side action group: "Simuler l'activité"
  (primary), "Réinitialiser" (ghost), "Visite guidée" (ghost).
- **Scope bar**: Organisation / team chips / project chips (chips reveal projects
  when a team is active). Right-aligned current-scope label.
- **3-column grid** (equal), each a bordered panel with a header (lucide icon, title,
  count badge) and a scrollable body:
  1. **Flux d'activité IA** (Activity icon): live rows — "actor · message", then thin
     "fait extrait" rows, then a **pattern-progress row** with a slim progress bar
     (occurrences / threshold). Newest on top; subtle fade-in per row.
  2. **Mémoire partagée** (Brain icon): fact cards — type tag, provenance pill,
     workstream chip, author, content. Scoped by the scope bar.
  3. **Compétences vivantes** (Sparkles icon): skill cards — mono name, provenance
     pill, trigger line, collapsible body, referents, source count. Org-level skills
     visually distinct (Building2 icon, org pill).
- **Below the grid**, full width, two stacked sections:
  - **Agents** (Bot icon): a row of agent cards (name, derived-from, skills chips,
    status active/pending, "Approuver" for pending) + a manual "Injecter un message"
    composer (you role-play a teammate).
  - **Interroger la mémoire** (MessageSquare icon): compact ask input + inline answer
    with provenance layers (links to screen 5 for full view).

## The emergence moment (critical)
When a pattern crosses its threshold: the matching skill card enters with the
**emergence pulse** (scale-in + fading blue ring, 800ms), a slim toast banner slides
in ("Compétence née du travail de l'équipe : …" / "Compétence d'organisation
promue : …"), and the Compétences count ticks up. If it's an org promotion, use the
organization provenance pill + Building2. One moment at a time — never a cascade of
pulses.

## Responsive
- 1024: 3 columns → 2 columns (skills panel wraps under), agents/ask full width.
- 768: columns become a **segmented tab set** (Flux · Mémoire · Compétences) with one
  panel visible at a time; agents & ask stack below; the "Simuler" action stays
  reachable in a sticky action bar.
- 390: single column, tabbed panels, sticky bottom action bar (Simuler / Ask).
  Toasts become full-width top banners. Progress bars and pills remain legible.

## States
- **Empty**: each panel has a purposeful empty state ("Cliquez Simuler …").
- **Loading**: skeleton rows/cards.
- **Disconnected** ("hors ligne"): status pill turns neutral, a non-blocking notice
  offers retry; UI stays usable with last data.

## Acceptance criteria
- The emergence moment is the emotional peak and looks intentional, not gimmicky.
- Dense but airy; a newcomer understands each panel in 3 seconds.
- Fully responsive incl. the tabbed collapse on tablet/mobile; no overflow.
