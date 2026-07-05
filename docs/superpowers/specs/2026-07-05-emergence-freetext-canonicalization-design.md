# Free-Text Emergence via Topic Canonicalization — Design

**Date:** 2026-07-05
**Status:** Approved (brainstorming)
**Linear:** ECH-260 (topic canonicalization); also lifts the agent team-clustering gate
**Author:** Guillaume + Claude

## Context

Weave turns org activity into events → facts → patterns → skills → emergent
agents. This works on the hardcoded seed dataset but **produces zero skills and
zero agents from real free-text sources** (Discord/Slack). Verified live: 8 real
Discord messages → 16 facts / 9 entities / 11 relations, but 0 skills, 0 agents.

Root cause — three compounding gaps, all from one assumption: that the ingest
payload carries a stable clustering anchor (`topic`, `team`) that real chat
connectors never populate.

1. **Pattern-detection is gated** (`crates/weave-pipeline/src/lib.rs:305-307`):
   `detect_pattern_and_maybe_emerge` only runs when `event.payload["topic"]`
   exists (Discord: never) OR the LLM tagged the fact `Question`/`Answer`.
   Free-text tagged `Fact`/`Decision` never enters pattern tracking.
2. **Signature has no stable anchor** (`lib.rs:344-360`): with no
   `payload["topic"]`, the signature falls back to the LLM's per-message
   `fact.topic`. Seven differently-worded messages get seven different topic
   strings → seven signatures → `patterns.occurrences` never reaches
   `WEAVE_SKILL_THRESHOLD` (default 5) → **no skill**.
3. **Agent clustering skips team-less skills** (`lib.rs:528`):
   `if s.team.is_empty() || s.theme.trim().is_empty() { continue; }`. Discord
   never sets `payload["team"]` → `fact.team == ""` → `skill.team == ""` → the
   skill is excluded from the `(team, theme)` cluster map → **no agent**, even
   if a skill did emerge.

The seed sidesteps 1+2 by hardcoding `"topic": sync_topic` into every payload,
and sidesteps 3 only via `simulate.rs`, the only path that sets `payload["team"]`.

## Goal

Named skills **and** agents emerge from free-text sources by canonicalizing each
message's topic at ingest into a stable, project-scoped signature anchor,
broadening the pattern-detection gate accordingly, and letting team-less skills
cluster into org-level specialists.

Non-goals: semantic embedder (ECH-259 — prod runs Groq with no embeddings, so
canonicalization is LLM-driven, not vector-driven); per-tenant guild selector;
changing the seed/simulate behavior (must stay byte-for-byte identical).

## Architecture

LLM canonicalization at ingest. After extraction, each fact's raw LLM topic is
mapped — via one Groq call against the project's existing canonical topics — to
an existing canonical topic (when semantically the same) or a new short one. That
canonical string is persisted on the fact and becomes the pattern signature
anchor, so rewordings collapse to one signature the way the seed's hardcoded
topic does. The agent-clustering gate is relaxed so team-less skills still seed a
specialist.

## Components

### 1. `canonicalize_topic` — `crates/weave-llm/src/lib.rs`

New `LlmGateway` trait method, modeled on the existing `assign_theme`
(`lib.rs:214`) + `theme_prompt`/`normalize_theme` (`clean.rs:57`):

```
async fn canonicalize_topic(&self, raw_topic: &str, existing: &[String]) -> anyhow::Result<String>;
```

- Prompt: "Given this message topic and the project's existing canonical topics,
  return the existing canonical topic it belongs to, or a new short canonical
  topic (≤5 words) if none fits." Parse via `parse_json_lenient`; clean via
  `normalize_theme`.
- **Heuristic fallback** (`HeuristicLlm` impl + on any error at the call site):
  return `normalize_theme(raw_topic)` — never worse than today's `fact.topic`
  fallback.
- Implement for every existing `LlmGateway` impl (ollama/openai/claude/heuristic)
  + the test `StubLlm`. `StubLlm::canonicalize_topic` returns a fixed canonical
  for a known reworded set so pipeline tests are deterministic.

### 2. Persist the canonical topic — `weave-core` + `weave-store` + migration

- `crates/weave-core/src/lib.rs`: add `Fact.canonical_topic: String`
  (`#[serde(default)]`).
- `migrations/0008_topic_canonicalization.sql`:
  `ALTER TABLE facts ADD COLUMN canonical_topic text NOT NULL DEFAULT '';`
- `crates/weave-store/src/postgres.rs`: `insert_fact` writes `canonical_topic`;
  fact reads select it. New:
  `distinct_canonical_topics(project, limit) -> Vec<String>` —
  `SELECT canonical_topic, count(*) c FROM facts WHERE project=$1 AND canonical_topic<>'' GROUP BY 1 ORDER BY c DESC LIMIT $2`
  (bounds the prompt vocabulary; limit ~50).

### 3. Canonicalize at fact construction — `weave-pipeline/src/lib.rs:262-285`

After building `topic`/`content`, before constructing `Fact`:
- Fetch project vocabulary once per event: `distinct_canonical_topics(project, 50)`.
- `let canonical_topic = event.payload.get("topic").and_then(|v| v.as_str()).map(str::to_string)
     .unwrap_or_else(|| canonicalize (fact topic, vocab), fallback normalize_theme(topic));`
  → **payload `topic` remains a hard override** (seed/thread unchanged); free text
  gets the canonical.
- Set `Fact.canonical_topic`.

### 4. Broaden the gate — `weave-pipeline/src/lib.rs:305-307`

```
let tracked_thread = event.payload.get("topic").is_some();
if tracked_thread || !fact.canonical_topic.is_empty()
    || matches!(ftype, FactType::Question | FactType::Answer) {
    self.detect_pattern_and_maybe_emerge(event, &fact).await?;
}
```

Facts with no canonical topic (pure-entity facts) stay excluded → no noise.

### 5. Anchor the signature on the canonical topic — `weave-pipeline/src/lib.rs:344-350`

Replace the `hint` computation:

```
let hint = event.payload.get("topic").and_then(|v| v.as_str())
    .unwrap_or(&fact.canonical_topic);   // was: &fact.topic
let base_sig = normalize_signature(hint);
```

Downstream (`search_facts(project, base_sig, ...)`, skill name, theme) unchanged.

### 6. Let team-less skills seed agents — `weave-pipeline/src/lib.rs:528`

```
if s.theme.trim().is_empty() { continue; }   // was: s.team.is_empty() || s.theme…
```

Cluster key stays `(team, theme)` with `team` possibly `""` → team-less skills of
the same theme cluster into one org-level specialist. Idempotency check
(`a.team == team && a.domain == theme`, `lib.rs:545`) already handles `team==""`.

## Data flow

Event → `extract` (raw topic) → `canonicalize_topic(raw, project vocab)` →
`Fact.canonical_topic` → gate (canonical present) → `detect_pattern` with
`signature = normalize_signature(canonical)` → `observe` → threshold → skill
(`assign_theme` for its domain, unchanged) → `maybe_emerge_agent` clusters
`(team, theme)` incl. `team==""` → Groq-synthesized named agent (pending approval).

## Error handling

- `canonicalize_topic` LLM failure → fallback `normalize_theme(raw_topic)`
  (degrades to today's behavior; never blocks ingest).
- Empty canonical topic → fact skips pattern detection (as today).
- Vocabulary bounded to ~50 topics → caps prompt size + latency.
- Migration default `''` → existing rows valid; no backfill required.

## Threshold (tuning, not code)

`WEAVE_SKILL_THRESHOLD` (default 5, `weave-api/src/main.rs:60`) unchanged in code.
With canonicalization, rewordings finally count on one signature. Recommend prod
`WEAVE_SKILL_THRESHOLD=3` for realistic free-text volumes;
`WEAVE_AGENT_EMERGE_THRESHOLD=1` already set in prod.

## Testing

- **Unit** (`weave-llm`): `canonicalize_topic` — reworded topics + an existing
  vocab → the existing canonical (mocked/stub); empty vocab → a new normalized
  canonical; heuristic fallback returns `normalize_theme(raw)`.
- **Pipeline** (`weave-pipeline`, DB-backed): ingest N (≥ threshold)
  differently-worded messages whose `StubLlm` canonical is one fixed string, with
  no `payload["topic"]`/`team` → assert one pattern signature, a skill emerges,
  and (theme non-empty, team `""`) an agent emerges. This is the regression that
  would have caught the live 0-skills/0-agents failure.
- **Regression**: seed ingest (hardcoded `payload["topic"]`) still yields the
  same skills — the override path is preserved.
- **Store**: `insert_fact`/read round-trips `canonical_topic`;
  `distinct_canonical_topics` ordering + limit.
- **Migration**: `0008` applies; `facts.canonical_topic` present, defaulted.

## Rollout

1. Migration auto-runs at `weave-api` boot (`store.migrate()`).
2. Deploy (Forge pull + `docker compose up -d --build weave-api`).
3. Set prod `WEAVE_SKILL_THRESHOLD=3` in `prod.env`.
4. Re-ingest the Discord test project → verify a skill + a named agent emerge.

## Follow-ups (out of scope)

- ECH-259 semantic embedder → replace/augment LLM canonicalization with vector
  nearest-topic (cheaper, no per-message LLM call).
- Backfill `canonical_topic` for pre-existing facts (currently only new ingests).
