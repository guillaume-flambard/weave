# Screen 4 — Agent detail + reasoning trace + governance

*(Prepend `00-system-preamble.md`, then this.)*

## Goal
Show that specialist agents **emerge from skills**, stay **under human governance**,
and **reason transparently**. This addresses PennyLane's control/compliance concerns:
nothing goes live without approval, and every action is inspectable.

## Layout (desktop 1440)
- **Breadcrumb**: Agents / `specialiste-data-finance-ops`.
- **Header**: mono agent name, status badge (actif / en attente d'approbation), team,
  domain, "dérivé de N compétences". Primary action = "Approuver" (if pending) or
  "Lancer une tâche" (if active); secondary "Suspendre".
- **Two-column body (2/3 + 1/3)**:
  - Left:
    - **Compétences sources** — the skill cluster this agent emerged from (chips /
      mini-cards linking to screen 3). Make the "≥2 skills in a domain → agent" logic
      visible.
    - **Trace de raisonnement** — a vertical, indented trace of a real run:
      `plan → déléguer à un spécialiste → vérifier`, each step with the acting agent,
      action, note, and depth indentation. Bounded (max depth 2, max agents, time
      budget) — show these guardrails as small meta chips.
    - **Réponse produite** — the final answer block, with a link to its provenance
      (screen 5).
  - Right rail:
    - **Gouvernance** — approval state, who can approve, audit note ("émergé le …,
      approuvé par …"). Emphasize human-in-the-loop.
    - **Périmètre** — team/workstream scope the agent may read.
    - **Activité** — runs count, last run, success indicator.

## Responsive
- 1024: right rail stacks below.
- 768/390: single column; the reasoning trace keeps its indentation via a left rail
  connector line, collapsible per step; sticky header shows name + status; actions
  move to a sticky bottom bar. No horizontal scroll (long lines wrap).

## Interactions / motion
- Approve (pending → active): status badge transitions with the emergence pulse once;
  a quiet toast confirms; audit note updates.
- Expand/collapse each trace step (smooth height, 200ms).

## States
- **Pending** agent: banner "En attente d'approbation" + prominent Approuver; trace
  shows a sample/dry-run.
- **Active**: full trace + run history.
- Loading skeletons; not-found card.

## Acceptance criteria
- Human-in-the-loop governance is obvious and reassuring.
- The reasoning trace reads clearly at every breakpoint (indentation preserved).
- Responsive 390→1440, AA, keyboard-navigable, restrained color.
