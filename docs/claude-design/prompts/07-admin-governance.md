# Screen 7 — Admin & governance (teams, scopes, agent approvals)

*(Prepend `00-system-preamble.md`, then this.)*

## Goal
Close the trust loop: show multi-tenant structure, who-sees-what memory scoping, and
a governance queue where humans approve emergent agents/skills. PennyLane's buyers
care about control, permissions, and auditability — this screen answers that.

## Layout (desktop 1440)
- **Left settings nav** (vertical): Organisation, Équipes & projets, Membres,
  Gouvernance, Périmètres & accès, Sources, Facturation. "Gouvernance" active.
- **Main content — Gouvernance**:
  - **File d'approbation**: a table/list of pending emergences (agents & org-skill
    promotions): name, type, provenance pill, "dérivé de", requested date, and
    row actions "Approuver" / "Rejeter" / "Voir". Bulk-select supported.
  - **Journal d'audit**: a timeline — who approved/rejected what, when. Read-only,
    filterable by type/actor.
- **Secondary tab "Équipes & projets"** (design too): a tree of Teams → Projects →
  members, with an "add" affordance, editable inline; each project shows its
  workstream slug and domain.
- **Secondary tab "Périmètres & accès"**: a matrix/grid mapping teams to the memory
  levels they can read (personal/team/project/org), reusing the provenance pills as
  column headers. Make scope isolation visually obvious.

## Responsive
- 1024: left nav collapses to icons + labels; tables keep priority columns, others
  behind a "⋯"/expand.
- 768: left nav becomes a top dropdown or horizontal scroll of section chips; tables
  become **stacked cards** (each row → a card with label:value pairs + actions).
- 390: full single column; approval items are cards with primary Approuver + overflow
  menu; audit log compact; the access matrix becomes a per-team accordion listing
  readable levels as pills. No horizontal scroll anywhere.

## Interactions / motion
- Approve/reject: row resolves out of the queue (quiet slide/fade), audit log prepends
  the entry, a count badge on "Gouvernance" decrements. Approved agent gets the
  emergence pulse if navigated to.
- Access matrix toggles animate softly; changes show a "modifié, non enregistré" hint
  + sticky Save.

## States
- **Empty queue**: reassuring "Rien à approuver — tout est à jour."
- Loading skeleton rows; error with retry; permission-denied state for non-admins.

## Acceptance criteria
- Governance, auditability, and scope isolation are unmistakable and enterprise-grade.
- Tables degrade to cards on mobile with zero horizontal scroll.
- Responsive 390→1440, AA contrast, keyboard-navigable, single accent + provenance pills only.
