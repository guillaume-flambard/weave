# Screen 3 — Skill detail (anatomy of an emergent skill)

*(Prepend `00-system-preamble.md`, then this.)*

## Goal
Prove the skill is real, trustworthy, and improving — not a black box. Show WHERE it
came from, WHAT it does, and HOW it got promoted from a project to the whole org.
This answers PennyLane's "can we trust auto-generated skills?" question.

## Layout (desktop 1440)
- **Breadcrumb**: Compétences / `bancaire/relancer-synchro`.
- **Header**: mono skill name, provenance pill (project or organization), a one-line
  human title ("Relancer la synchronisation bancaire d'un client"), and meta row
  (créée le · dernière évolution · niveau · équipe/projet). Primary action
  "Utiliser dans une réponse", secondary "Voir la provenance".
- **Two-column body (2/3 + 1/3)**:
  - Left:
    - **Déclencheur** — the trigger phrase(s) that route to this skill.
    - **Contenu de la compétence** — the generated runbook/body in a clean mono/prose
      block with copy button.
    - **Sources** — the facts/messages this emerged from (author, workstream,
      snippet, timestamp), each linking back into memory.
  - Right rail:
    - **Provenance & promotion** — a small vertical stepper: né dans *projet
      Synchro bancaire* → observé aussi dans *Checkout* → **promu au niveau
      organisation** (org pill, the promotion node highlighted).
    - **Référents** — people chips who anchor this skill.
    - **Utilisation** — sparkline + "used 34× · 12 this week", top consumers.
    - **Gouvernance** — status, "Épingler", "Signaler / corriger".

## Responsive
- 1024: right rail drops below the left content as stacked cards.
- 768/390: single column; the promotion stepper becomes horizontal-scrollable chips
  or a compact vertical list; long mono body wraps and gets a max-height + expand;
  sticky header collapses to name + pill on scroll. No horizontal overflow.

## Interactions / motion
- Copy body → quiet confirm.
- Promotion node uses the emergence pulse once when the page opens (reduced-motion off).
- Hover a source → highlight its contribution.

## States
- Skill still project-level (no promotion): stepper shows "pas encore promue" with a
  subtle progress hint ("observé dans 1/2 équipes").
- Loading: skeleton header + blocks. Not found: friendly 404 card with back link.

## Acceptance criteria
- Makes an auto-generated skill feel auditable and safe.
- Provenance/promotion story is unmistakable.
- Responsive 390→1440, AA contrast, keyboard-navigable, single accent + pills only.
