# Screen 5 — Ask the org (answer + cited memory layers)

*(Prepend `00-system-preamble.md`, then this.)*

## Goal
The traceability payoff: ask a question, get an answer that **cites the memory layers
and sources** behind it (personal → team → project → organization). This is what makes
Weave trustworthy vs. a generic chatbot — the exact thing PennyLane must believe.

## Layout (desktop 1440)
- **Header**: "Interroger la mémoire partagée" + scope selector (whole org or a team).
- **Ask bar**: large input with placeholder ("Comment relancer la synchro bancaire
  d'un client ?"), primary "Demander"; below it, 3–4 suggested questions as chips.
- **Answer area — two columns (7/5)**:
  - Left, **Réponse**: if a skill was used, a small "compétence utilisée : `…`" badge
    (links to screen 3). Then the answer in clean readable prose, with inline
    superscript citation markers [1][2] that map to the sources on the right.
  - Right, **Provenance · couches mémoire**: four stacked, collapsible groups in
    provenance-pill order — Personal, Team, Project, Organization — each listing the
    contributing facts (author · snippet). Hovering a citation marker highlights the
    matching source; clicking a source scrolls/opens it.
- **Follow-up**: a compact thread — previous Q&A collapse into slim cards above the
  ask bar so it reads as a conversation with memory.

## Responsive
- 1024: 7/5 split holds; provenance groups tighten.
- 768: answer full width; provenance moves **below** as an accordion (collapsed by
  default, "Voir la provenance (4 couches)"). Citation tap scrolls to source.
- 390: single column; ask bar sticky at bottom; suggested chips horizontal snap-scroll;
  provenance accordion; comfortable line length. No horizontal scroll.

## Interactions / motion
- Submitting: answer streams in / skeleton lines then fill (quiet). Provenance groups
  fade in staggered (respect reduced-motion).
- Citation ↔ source highlight is instant and obvious (accent tint).

## States
- **Empty** (no question yet): the suggested-questions chips + a one-line explainer.
- **No memory to answer**: honest empty answer ("Aucune mémoire pertinente — essayez
  de simuler l'activité ou de reformuler"), never a hallucinated reply.
- Loading skeleton; error with retry.

## Acceptance criteria
- Citations ↔ sources linkage is the star and works on mobile.
- Provenance pills reused exactly; four levels always in the same order.
- Responsive 390→1440, AA contrast, keyboard + screen-reader friendly.
