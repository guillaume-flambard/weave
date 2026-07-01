# Weave Demo — Notion Reskin + Guided Tour + Evaluator Guide

**Date:** 2026-07-02
**Scope:** `apps/web` frontend (reskin + tour) + `docs/` (evaluator guide) + repo setup & verification. No backend/API changes.

## Problem

The demo is meant to convince PennyLane or Notion to adopt/partner. Three blockers:

1. **Visual mismatch.** Current skin uses a PennyLane palette (green/teal/cream, emoji icons, heavy rounded panels). It does not read as belonging in Notion.
2. **Not self-testable.** A cold evaluator lands on a dense multi-panel dashboard with no idea what to click or what proves the "emergent skills" value. They cannot test it à fond without a walkthrough.
3. **No repo / no verification.** Code is not under version control and has no clean, tested baseline an evaluator or partner could clone and trust.

## Decisions (locked with user)

- **Design identity:** Notion look (white, near-black ink, Inter/system, thin gray hairlines, whitespace, restrained accent). Not PennyLane, not a dual-brand toggle.
- **Testability:** In-app guided tour (self-serve, no external doc required).
- **Tour library:** `driver.js` — small, framework-agnostic, restyled to match the Notion look.
- **Tour timing:** advances on **real** emergence events (`skill_emerged` fires) — demonstrates the actual product, not a scripted mock.
- **Copy language:** French (audience is FR).

## Part A — Notion reskin

Reskin only. Layout and component structure (feed / memory / skills / agents / ask) stay unchanged — low risk.

### Tokens (`apps/web/app/globals.css`)

Replace the PennyLane `@theme` block with Notion tokens:

| Token | Value | Use |
|-------|-------|-----|
| `--color-bg` | `#ffffff` | page background |
| `--color-surface` | `#ffffff` | cards |
| `--color-subtle` | `#f7f7f5` | secondary fill / hover |
| `--color-ink` | `#37352f` | primary text |
| `--color-ink-soft` | `#787066` | secondary text |
| `--color-muted` | `#9b9a97` | captions |
| `--color-line` | `#e9e9e7` | hairline border |
| `--color-accent` | `#2383e2` | active / link / primary button |
| `--color-accent-soft` | `#e7f1fb` | accent tint fill |

Memory-level tags (`personal/team/project/organization`) keep semantic differentiation but restyled as muted Notion pills (soft gray/blue/neutral fills, small caps, no neon). Retain a light color coding so provenance layers stay distinguishable — just desaturated.

### Component changes (`apps/web/app/page.tsx`)

- Font stack → `Inter`, system fallback. Tighter type scale, larger padding, more whitespace.
- Emoji icons (📡🧠✦🤖💬🏛◆◇) → thin line glyphs. Use `lucide-react` (already React-friendly, tree-shakeable) — Activity, Brain/Sparkles, Wand, Bot, MessageSquare, Building. One dep, consistent with Notion's line-icon style.
- Cards: `rounded-md`, `border-line`, remove heavy shadows (`shadow-sm` → none or `shadow-[0_1px_2px_rgba(0,0,0,0.04)]`), `rounded-2xl` → `rounded-lg`.
- Primary buttons (`Simuler`, `Demander`) → accent blue bg, white text. Secondary → subtle-fill ghost.
- `emerge` keyframe: recolor the pulse from neon green `rgba(0,248,114,…)` to a subtle accent-blue/gray pulse; keep the scale motion.
- `::selection` → accent-soft.

## Part B — Guided tour

New client component driving `driver.js`, mounted in `page.tsx`.

### Files

- `apps/web/app/tour.ts` (or `.tsx`) — tour definition + a small React hook `useGuidedTour()` that wires driver.js to page state.
- Add `driver.js` to `apps/web/package.json`.
- Add `data-tour="…"` attributes to target elements in `page.tsx` (simulate button, feed panel, skills panel, ask box).

### Steps

1. **Welcome** (centered, no anchor) — "Regardez la mémoire d'une organisation se construire toute seule. 4 étapes."
2. Anchor **Simuler l'activité** button — "Cliquez. Chaque membre de chaque équipe se met à travailler avec l'IA." (advances when user clicks Simulate)
3. Anchor **feed panel** — "Les faits sont extraits en direct. Un schéma se répète et approche du seuil."
4. Anchor **skills panel** — "Une compétence réutilisable vient d'émerger du travail répété." — **this step waits for a real `skill_emerged` event before it becomes available/advances.**
5. Anchor **Ask box** (prefilled question) — "Interrogez l'organisation. La réponse cite ses couches de mémoire."
6. **Done** (centered) — "Explorez librement. « Réinitialiser » à tout moment."

### Wiring to real events

- The tour hook receives a signal when `skill_emerged` arrives (the SSE handler in `page.tsx` already sets `flash`/`newest`; expose a callback or a ref the tour can observe).
- Step 4 shows a "en attente d'émergence…" hint and only enables the "next" affordance once at least one `skill_emerged` has fired since the tour started. This makes the tour demonstrate genuine emergence.
- Steps that depend on user action (click Simulate) advance on the real DOM interaction, not a timer.

### Trigger & replay

- Auto-start on first visit, gated by `localStorage["weave_tour_seen"]`.
- Persistent **"Visite guidée"** button in the header to replay anytime (sets nothing / does not clear other state).
- After free-exploration, evaluator can Reset and replay.

### Styling

driver.js default popover restyled via CSS override to the Notion look: white popover, `--color-line` border, `--color-ink` text, accent-blue "next" button, soft backdrop (low-opacity dark, not black). No default driver.js theme colors visible.

## Part C — Written evaluator guide

`docs/EVALUATOR_GUIDE.md` (French). Standalone doc a PennyLane/Notion evaluator uses to test à fond and to share internally. Complements the in-app tour (tour = first contact; guide = go deep + reproduce).

Sections:

1. **Ce que vous testez** — one paragraph: Weave = cognitive runtime, org memory + emergent skills/agents. What "success" looks like.
2. **Démarrage** — prerequisites (Docker for Postgres/pgvector, Ollama local model, Rust, pnpm), exact commands to bring up: db (`docker-compose up`), migrations, API (`cargo run`), web (`pnpm dev`), env vars from `.env.example`. Ports.
3. **Scénarios de test** — scripted, each with steps + expected result:
   - S1 Émergence de compétence: Simuler → watch a pattern hit threshold → a skill is born.
   - S2 Émergence forcée: inject the same message 5× in one project → skill emerges deterministically.
   - S3 Promotion org: same pattern across two teams → skill promoted to organization level.
   - S4 Émergence d'agent: skill cluster in a team → specialist agent emerges → approve it.
   - S5 Interroger la mémoire: ask a question → answer cites memory layers (personal→team→project→org).
   - S6 Multi-tenant: switch org preset → scoped memory isolated.
4. **Ce que ça prouve** — map each scenario back to the product claim (self-building memory, no manual skill authoring, provenance, multi-tenant).
5. **Limites du MVP / hors-périmètre** — honest scope so evaluator isn't misled.

Keep it reproducible: every command copy-pasteable, expected outputs stated.

## Delivery & verification

Repo does not yet exist. Establish a clean, tested baseline, then do the work on a branch and merge via PR.

1. **Baseline:** `git init` in `/Users/memo/projects/weave`; add a `.gitignore` (Rust `target/`, `node_modules`, `.next`, `.env`, etc.); commit current code as the baseline on `main`.
2. **GitHub:** create a **private** repo via `gh repo create`; push `main`.
3. **Feature branch:** do reskin + tour + guide on a branch (e.g. `feat/notion-reskin-tour`).
4. **Full-battery gate** (must all pass before merge):
   - `cargo build` (workspace) + `cargo test` — backend green.
   - `pnpm --dir apps/web build` + `tsc --noEmit` — web builds + typechecks.
   - Run the app (db + API + web) and preview-tool smoke test: reskin reads as Notion (white/ink/hairline, no green/emoji), tour auto-starts + replays, step 4 waits for a real `skill_emerged`, ask produces a cited answer. Screenshot + snapshot as evidence.
5. **Merge:** open PR into `main`, confirm gate green, merge. Report actual command output — if anything fails, surface it, do not claim success.

## Non-goals (YAGNI)

- No dual-brand toggle.
- No backend changes.
- No new panels or data — reskin + tour over existing UI.

## Risk

- Low on the frontend (structure preserved; main risk = driver.js restyle looking generic → mitigated by explicit CSS override to Notion tokens).
- Repo/verification risk: current code may not build/test cleanly as-is. If the baseline is already broken, surface it before layering new work — do not mask a pre-existing failure as part of this change.
