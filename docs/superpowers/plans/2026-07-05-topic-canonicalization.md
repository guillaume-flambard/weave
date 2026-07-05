# Free-Text Emergence via Topic Canonicalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make named skills and agents emerge from free-text sources (Discord/Slack) by canonicalizing each message's topic at ingest into a stable, project-scoped signature anchor, broadening the pattern-detection gate, and letting team-less skills cluster into org-level specialists.

**Architecture:** Add an LLM `canonicalize_topic(raw_topic, existing)` step at fact construction that maps the LLM's per-message topic to an existing project canonical topic (or a new short one). Persist it on the fact, use it as the pattern signature anchor (replacing the fragile `payload["topic"] || fact.topic` fallback), broaden the gate to any fact with a canonical topic, and drop the `team.is_empty()` skip in agent clustering.

**Tech Stack:** Rust (async_trait, sqlx/Postgres, serde_json). LLM is Groq via the OpenAI-compatible impl; prod has no embeddings (canonicalization is LLM-driven, not vector-driven).

## Global Constraints

- `LlmGateway` is an `#[async_trait]` trait (`crates/weave-llm/src/lib.rs:197`) — new method uses `async fn`, all impls annotated `#[async_trait]`.
- Five impls must implement the new method: `openai.rs`, `claude.rs`, `ollama.rs`, `heuristic.rs` (all in `crates/weave-llm/src/`), and `StubLlm` in `crates/weave-api/src/main.rs` (test mock). Missing any = compile error.
- `payload["topic"]` stays a HARD override — seed/simulate behavior must remain byte-for-byte identical.
- Canonicalization fallback on LLM error → `normalize_theme(raw_topic)` (never worse than today; never blocks ingest).
- No DB migration renames; migration `0008` only ADDs `facts.canonical_topic text NOT NULL DEFAULT ''`.
- Agent clustering key stays `(team, theme)`; only the `team.is_empty()` half of the skip is removed. Keep the `theme.trim().is_empty()` skip.
- DB tests use `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test` (docker weave-postgres); skip when unset.
- Do not touch other providers, connectors, or the echotravel DB.

---

### Task 1: `canonicalize_topic` LLM method (all impls, offline)

**Files:**
- Modify: `crates/weave-llm/src/lib.rs` (add trait method + `canonicalize_prompt`/`canonical_from_response` helpers)
- Modify: `crates/weave-llm/src/openai.rs`, `claude.rs`, `ollama.rs`, `heuristic.rs`
- Modify: `crates/weave-api/src/main.rs` (`StubLlm` impl, ~line 1042)
- Test: inline `#[cfg(test)]` in `heuristic.rs` + `lib.rs`

**Interfaces:**
- Produces on `LlmGateway`:
  `async fn canonicalize_topic(&self, raw_topic: &str, existing: &[String]) -> anyhow::Result<String>`
- Produces helpers in `lib.rs`:
  `pub(crate) fn canonicalize_prompt(raw_topic: &str, existing: &[String]) -> (String, String)`
  `pub(crate) fn canonical_from_response(js: &str, raw_topic: &str) -> String`

- [ ] **Step 1: Write the failing tests**

Add to the `#[cfg(test)] mod tests` in `crates/weave-llm/src/heuristic.rs` (beside the `assign_theme` tests):

```rust
#[tokio::test]
async fn canonicalize_topic_reuses_existing_on_shared_token() {
    let h = HeuristicLlm;
    // First message defines the canonical topic.
    let first = h.canonicalize_topic("relancer minerva", &[]).await.unwrap();
    assert!(!first.is_empty());
    // A reworded message that shares a salient token collapses to the existing one.
    let second = h
        .canonicalize_topic("redémarrer minerva après un crash", &[first.clone()])
        .await
        .unwrap();
    assert_eq!(second, first, "reworded topic should reuse the existing canonical");
}

#[tokio::test]
async fn canonicalize_topic_fresh_when_no_overlap() {
    let h = HeuristicLlm;
    let t = h.canonicalize_topic("régénérer la clé kimi", &["relancer minerva".into()]).await.unwrap();
    assert_ne!(t, "relancer minerva");
    assert_eq!(t, crate::normalize_theme(&t)); // already canonical
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cargo test -p weave-llm canonicalize_topic`
Expected: FAIL — method `canonicalize_topic` not found on `HeuristicLlm`.

- [ ] **Step 3: Add the trait method + shared helpers in `lib.rs`**

In `crates/weave-llm/src/lib.rs`, add to the `LlmGateway` trait (beside `assign_theme`, ~line 214):

```rust
    /// Map a message's raw (LLM-extracted) topic to a stable canonical topic for
    /// the project. `existing` lists the project's current canonical topics so
    /// rewordings collapse onto one (controlled vocabulary), giving pattern
    /// detection a stable anchor. The returned topic is normalized.
    async fn canonicalize_topic(
        &self,
        raw_topic: &str,
        existing: &[String],
    ) -> anyhow::Result<String>;
```

Add the shared prompt/response helpers near `theme_prompt`/`theme_from_response` (~line 114-145):

```rust
/// Shared (system, user) prompt for topic canonicalization with a controlled vocabulary.
pub(crate) fn canonicalize_prompt(raw_topic: &str, existing: &[String]) -> (String, String) {
    let existing_list = if existing.is_empty() {
        "(aucun pour l'instant)".to_string()
    } else {
        existing.join(", ")
    };
    let system = "Tu normalises le sujet d'un message d'équipe en un sujet canonique. \
        Réutilise EXACTEMENT un sujet existant s'il désigne la même chose, sinon propose \
        un sujet canonique COURT et réutilisable (2 à 5 mots). Réponds en JSON strict: \
        {\"topic\": \"...\"}. Minuscules, sans ponctuation."
        .to_string();
    let user = format!("Sujets existants: {existing_list}\nSujet du message: {raw_topic}");
    (system, user)
}

/// Parse + normalize a `{"topic": ...}` response; fall back to the normalized raw topic.
pub(crate) fn canonical_from_response(js: &str, raw_topic: &str) -> String {
    #[derive(serde::Deserialize)]
    struct T {
        #[serde(default)]
        topic: String,
    }
    let topic = parse_json_lenient::<T>(js).map(|t| t.topic).unwrap_or_default();
    let norm = normalize_theme(&topic);
    if norm.is_empty() {
        normalize_theme(raw_topic)
    } else {
        norm
    }
}
```

- [ ] **Step 4: Implement in `heuristic.rs`**

Add to the `impl LlmGateway for HeuristicLlm` block (mirror its `assign_theme`, which reuses an existing domain on a shared token):

```rust
    async fn canonicalize_topic(
        &self,
        raw_topic: &str,
        existing: &[String],
    ) -> anyhow::Result<String> {
        let fresh = crate::normalize_theme(&crate::heuristic_theme(raw_topic));
        let fresh_tokens: Vec<&str> = fresh.split_whitespace().collect();
        for e in existing {
            let en = crate::normalize_theme(e);
            if en
                .split_whitespace()
                .any(|t| t.len() > 2 && fresh_tokens.contains(&t))
            {
                return Ok(en);
            }
        }
        Ok(fresh)
    }
```

- [ ] **Step 5: Implement in `openai.rs`, `claude.rs`, `ollama.rs`**

In each, add (mirror that file's `assign_theme` exactly — same `self.chat(...)` call, `json_mode = true`, same fallback field name). For `openai.rs`:

```rust
    async fn canonicalize_topic(
        &self,
        raw_topic: &str,
        existing: &[String],
    ) -> anyhow::Result<String> {
        let (system, user) = crate::canonicalize_prompt(raw_topic, existing);
        match self.chat(&system, &user, true).await {
            Ok(js) => Ok(crate::canonical_from_response(&js, raw_topic)),
            Err(e) => {
                tracing::warn!("canonicalize_topic failed ({e}); using heuristic");
                self.fallback.canonicalize_topic(raw_topic, existing).await
            }
        }
    }
```

For `claude.rs` and `ollama.rs` use the identical body (their `assign_theme` uses the same `self.chat(&system, &user, true)` + `self.fallback` pattern — confirm the fallback field is named `fallback` in each; if a file names it differently, match that file).

- [ ] **Step 6: Implement in `StubLlm` (`crates/weave-api/src/main.rs`, ~line 1042)**

Add to the `impl LlmGateway for StubLlm` block (beside its `assign_theme`):

```rust
        async fn canonicalize_topic(
            &self,
            raw_topic: &str,
            _existing: &[String],
        ) -> anyhow::Result<String> {
            Ok(weave_llm::normalize_theme(raw_topic))
        }
```

- [ ] **Step 7: Run tests + full build**

Run: `cargo test -p weave-llm canonicalize_topic && cargo build -p weave-api`
Expected: 2 new tests PASS; `weave-api` compiles (StubLlm satisfies the trait).

- [ ] **Step 8: Commit**

```bash
git add crates/weave-llm crates/weave-api/src/main.rs
git commit -m "feat(llm): canonicalize_topic — map free-text topics to a project canonical vocab"
```

---

### Task 2: Persist `canonical_topic` (core + store + migration 0008)

**Files:**
- Modify: `crates/weave-core/src/lib.rs` (add `Fact.canonical_topic`)
- Create: `migrations/0008_topic_canonicalization.sql`
- Modify: `crates/weave-store/src/postgres.rs` (`insert_fact` write + fact SELECTs read + new `distinct_canonical_topics`)
- Test: inline DB test in `postgres.rs` (or where store tests live)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `Fact.canonical_topic: String` (`#[serde(default)]`)
  - `PgStore::distinct_canonical_topics(&self, project: &str, limit: i64) -> anyhow::Result<Vec<String>>`

- [ ] **Step 1: Add the field to `Fact`**

In `crates/weave-core/src/lib.rs`, in `pub struct Fact`, after `content_sig`:

```rust
    /// Stable canonical topic (LLM-canonicalized at ingest); the pattern
    /// signature anchor. Empty when not computed.
    #[serde(default)]
    pub canonical_topic: String,
```

Fix every `Fact { .. }` literal that now misses the field (compiler lists them) by adding `canonical_topic: String::new()` (or the real value in the pipeline — Task 3). Build to find them: `cargo build -p weave-core -p weave-store -p weave-pipeline 2>&1 | grep "missing field"`.

- [ ] **Step 2: Write the migration**

Create `migrations/0008_topic_canonicalization.sql`:

```sql
-- Canonical topic per fact: the stable pattern-signature anchor for free-text
-- sources (Discord/Slack) that don't carry a payload topic. Backfilled only for
-- new ingests; existing rows default to ''.
ALTER TABLE facts ADD COLUMN canonical_topic text NOT NULL DEFAULT '';
```

- [ ] **Step 3: Write the failing store test**

Add a DB-backed test (mirror the existing `insert_fact`/facts tests in `postgres.rs`; skip when `TEST_DATABASE_URL` unset):

```rust
#[tokio::test]
async fn distinct_canonical_topics_orders_by_frequency() {
    let Some(store) = test_store().await else { return }; // match the file's helper name
    let p = "canon-test";
    store.reset_project(p).await.unwrap(); // or the file's cleanup helper
    for ct in ["relancer minerva", "relancer minerva", "clé kimi"] {
        let mut f = sample_fact(p);          // match the file's fact-builder helper
        f.canonical_topic = ct.to_string();
        f.content_sig = uuid::Uuid::new_v4().to_string(); // avoid dedup collapse
        store.insert_fact(&f).await.unwrap();
    }
    let topics = store.distinct_canonical_topics(p, 50).await.unwrap();
    assert_eq!(topics.first().map(String::as_str), Some("relancer minerva"));
    assert!(topics.contains(&"clé kimi".to_string()));
}
```

> If `postgres.rs` has no existing `test_store`/`sample_fact`/`reset_project` helpers, grep the store tests for the equivalents and use those names; build the `Fact` inline with all fields if there's no builder.

- [ ] **Step 4: Run to verify it fails**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-store distinct_canonical_topics`
Expected: FAIL — `distinct_canonical_topics` not found.

- [ ] **Step 5: Wire the column + add the query**

In `insert_fact`: add `canonical_topic` to the INSERT column list and a `.bind(&fact.canonical_topic)` in the matching position. In EVERY `SELECT ... FROM facts` that maps to a `Fact` (search `postgres.rs` for `FROM facts`), add `canonical_topic` to the column list and set `canonical_topic: row.get("canonical_topic")` (or `row.try_get("canonical_topic").unwrap_or_default()`) in the row→`Fact` mapping.

Add the new method to `impl PgStore`:

```rust
    /// The project's canonical topics, most frequent first (bounds the
    /// canonicalization prompt vocabulary). Empty topics excluded.
    pub async fn distinct_canonical_topics(&self, project: &str, limit: i64) -> anyhow::Result<Vec<String>> {
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT canonical_topic FROM facts
             WHERE project = $1 AND canonical_topic <> ''
             GROUP BY canonical_topic
             ORDER BY count(*) DESC
             LIMIT $2",
        )
        .bind(project)
        .bind(limit)
        .fetch_all(self.pool())
        .await?;
        Ok(rows)
    }
```

- [ ] **Step 6: Run the test + migration**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-store distinct_canonical_topics`
Expected: PASS (migration `0008` auto-applies via `store.migrate()` in the test harness; if the harness doesn't migrate, run migrations first the way sibling store tests do).

- [ ] **Step 7: Commit**

```bash
git add crates/weave-core/src/lib.rs crates/weave-store/src/postgres.rs migrations/0008_topic_canonicalization.sql
git commit -m "feat(store): facts.canonical_topic column + distinct_canonical_topics (migration 0008)"
```

---

### Task 3: Pipeline wiring + agent clustering fix + end-to-end emergence test

**Files:**
- Modify: `crates/weave-pipeline/src/lib.rs` (fact build ~262-285; gate ~305-307; signature ~344-350; agent clustering ~528)
- Test: inline DB-backed `#[cfg(test)]` in `crates/weave-pipeline/src/lib.rs`

**Interfaces:**
- Consumes: `LlmGateway::canonicalize_topic` (Task 1), `Fact.canonical_topic` + `PgStore::distinct_canonical_topics` (Task 2).
- Produces: free-text emergence (skill + agent) end to end.

- [ ] **Step 1: Write the failing end-to-end test**

Add a DB-backed test to `crates/weave-pipeline/src/lib.rs` `#[cfg(test)] mod tests` (create the module if absent). Use `HeuristicLlm` (real extraction + heuristic canonicalize/theme/agent — no external LLM) and `StubEmbedder`-equivalent. Model the harness on how `weave-api` builds a `Runtime` (`Runtime::new(store, llm, embedder, threshold)`); skip when `TEST_DATABASE_URL` unset.

```rust
#[tokio::test]
async fn free_text_messages_emerge_skill_and_agent() {
    let Some(store) = test_store().await else { return }; // PgStore from TEST_DATABASE_URL, migrated
    // Named agents need cluster-size 1 for a single team-less theme in this test.
    std::env::set_var("WEAVE_AGENT_EMERGE_THRESHOLD", "1");
    let rt = Runtime::new(
        std::sync::Arc::new(store.clone()),
        std::sync::Arc::new(weave_llm::HeuristicLlm),
        std::sync::Arc::new(ZeroEmbedder), // a Vec<f32> of EMBEDDING_DIM zeros
        3, // WEAVE_SKILL_THRESHOLD equivalent
    );
    let project = "canon-emerge";
    // Reworded, free-text: NO payload "topic" and NO "team" — like real Discord.
    // All share the salient token "minerva" so the heuristic canonical collapses.
    let msgs = [
        "comment on relance minerva quand il plante",
        "minerva a crashé comment je le relance",
        "quelle commande pour redémarrer minerva",
        "relancer minerva après un crash, le runbook ?",
    ];
    for (i, text) in msgs.iter().enumerate() {
        let ev = Event {
            id: uuid::Uuid::new_v4(),
            source: "discord".into(),
            ts: chrono::Utc::now(),
            actor: format!("user{i}"),
            project: project.into(),
            kind: "message".into(),
            payload: serde_json::json!({ "text": text, "channel": "général" }),
            confidence: 1.0,
        };
        rt.ingest(&ev).await.unwrap();
    }
    let skills = store.skills(project).await.unwrap();
    assert!(!skills.is_empty(), "a skill should emerge from recurring free-text");
    let agents = store.agents(project).await.unwrap();
    assert!(!agents.is_empty(), "a team-less themed skill should seed an org-level agent");
}
```

Add a local `ZeroEmbedder` in the test module implementing `EmbeddingGateway` returning `vec![0.0; weave_core::EMBEDDING_DIM]` (copy `StubEmbedder` from `weave-api` tests). If `weave-pipeline` has no DB test harness, add a minimal `test_store()` that reads `TEST_DATABASE_URL`, builds `PgStore`, and calls `migrate()` — mirror `weave-api`'s `test_app`.

- [ ] **Step 2: Run to verify it fails**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-pipeline free_text_messages_emerge`
Expected: FAIL — 0 skills (canonical topic not yet computed/anchored).

- [ ] **Step 3: Canonicalize at fact construction**

In `crates/weave-pipeline/src/lib.rs`, in the extraction loop (~262-285), before constructing `Fact`, compute the canonical topic (fetch the project vocabulary once per event — hoist this fetch above the per-fact loop if the loop iterates multiple facts):

```rust
        // Stable clustering anchor: payload topic is a hard override (seed/thread);
        // otherwise canonicalize the LLM topic against the project's vocabulary so
        // rewordings collapse onto one signature.
        let canonical_topic = match event.payload.get("topic").and_then(|v| v.as_str()) {
            Some(t) => t.to_string(),
            None => {
                let vocab = self
                    .store
                    .distinct_canonical_topics(&event.project, 50)
                    .await
                    .unwrap_or_default();
                self.llm
                    .canonicalize_topic(&topic, &vocab)
                    .await
                    .unwrap_or_else(|_| weave_llm::normalize_theme(&topic))
            }
        };
```

Set it in the `Fact { .. }` literal: `canonical_topic,`.

- [ ] **Step 4: Broaden the pattern-detection gate (~305-307)**

Replace the gate condition:

```rust
        let tracked_thread = event.payload.get("topic").is_some();
        if tracked_thread
            || !fact.canonical_topic.is_empty()
            || matches!(ftype, FactType::Question | FactType::Answer)
        {
            self.detect_pattern_and_maybe_emerge(event, &fact).await?;
        }
```

- [ ] **Step 5: Anchor the signature on the canonical topic (~344-350)**

In `detect_pattern_and_maybe_emerge`, change the `hint`:

```rust
        let hint = event
            .payload
            .get("topic")
            .and_then(|v| v.as_str())
            .unwrap_or(&fact.canonical_topic); // was: &fact.topic
        let base_sig = normalize_signature(hint);
```

- [ ] **Step 6: Let team-less skills seed agents (~528)**

In `maybe_emerge_agent`, change the skip:

```rust
            if s.theme.trim().is_empty() {
                continue; // un-themed skills can't name a specialist
            }
```

(Removed the `s.team.is_empty() ||` half. Cluster key stays `(team, theme)` with `team` possibly `""`.)

- [ ] **Step 7: Run the end-to-end test + full pipeline suite**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-pipeline`
Expected: `free_text_messages_emerge_skill_and_agent` PASSES; existing pipeline tests still pass.

- [ ] **Step 8: Regression — seed still emerges + workspace-wide build/clippy**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-api && cargo clippy --workspace -- -D warnings`
Expected: `weave-api` suite green on a clean DB (reset first if the shared DB is dirty: `psql ... TRUNCATE events,facts,skills,agents,patterns,connections,entities,relationships RESTART IDENTITY CASCADE`); clippy clean. This confirms the seed/simulate path (which sets `payload["topic"]`) is unchanged.

- [ ] **Step 9: Commit**

```bash
git add crates/weave-pipeline/src/lib.rs
git commit -m "feat(pipeline): canonical-topic signature anchor + broadened gate + team-less agent clustering"
```

---

### Task 4: Prod threshold config

**Files:**
- Modify: `.env.example` (document `WEAVE_SKILL_THRESHOLD`)

**Interfaces:** none (config only).

- [ ] **Step 1: Document the threshold**

In `.env.example`, near the other `WEAVE_*` tuning vars (grep for `WEAVE_AGENT_EMERGE_THRESHOLD`; if absent, add beside the LLM block):

```bash
# Emergence tuning. With free-text canonicalization, rewordings count on one
# signature, so a lower skill threshold is realistic. Prod uses 3.
WEAVE_SKILL_THRESHOLD=3
WEAVE_AGENT_EMERGE_THRESHOLD=1
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(emergence): document WEAVE_SKILL_THRESHOLD=3 for free-text"
```

> Prod rollout (manual, not this plan): set `WEAVE_SKILL_THRESHOLD=3` in `/home/forge/weave-secrets/prod.env`, then rebuild `weave-api` (migration `0008` auto-applies at boot), then re-ingest the Discord test project and confirm a skill + named agent emerge.

---

## Self-Review

**Spec coverage:**
- Canonical topic LLM method (spec §1) → Task 1. ✓
- Persist canonical_topic + vocab query + migration (spec §2) → Task 2. ✓
- Canonicalize at fact build, payload override preserved (spec §3) → Task 3 Step 3. ✓
- Broaden gate (spec §4) → Task 3 Step 4. ✓
- Signature anchor on canonical (spec §5) → Task 3 Step 5. ✓
- Team-less agent clustering (spec §6) → Task 3 Step 6. ✓
- Error handling: fallback `normalize_theme(raw)` → Task 1 helper + Task 3 Step 3 `unwrap_or_else`. ✓
- Threshold tuning (spec) → Task 4. ✓
- Tests: canonicalize unit (Task 1), store round-trip/vocab (Task 2), e2e emergence + seed regression (Task 3). ✓

**Placeholder scan:** No TBD/TODO. Soft spots flagged with explicit grep-and-match instructions (store test helper names in Task 2 Step 3; pipeline DB harness in Task 3 Step 1) because those helpers vary — mitigated, not hand-waved. ✓

**Type consistency:** `canonicalize_topic(&self, raw_topic: &str, existing: &[String]) -> Result<String>` identical across trait + 5 impls + call site. `canonical_topic: String` field consistent in core/store/pipeline. `distinct_canonical_topics(project, limit: i64) -> Vec<String>` consistent between Task 2 definition and Task 3 call. Helpers `canonicalize_prompt` / `canonical_from_response` names consistent. ✓
