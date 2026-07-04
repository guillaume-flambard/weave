# Emergence Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emergent agents get LLM-synthesized identities and cluster by free-text themes; all hardcoded keyword domains (`classify_domain`) are removed, and specialist routing becomes embedding-based.

**Architecture:** Each skill gets an LLM `theme` at birth (stored). Agents cluster by `(team, theme)`; a `synthesize_agent` LLM call produces name/role/description. `find_specialist` routes by embedding cosine instead of keyword-domain equality. `classify_domain` + its `FAMILIES` table are deleted.

**Tech Stack:** Rust, sqlx/Postgres (pgvector), async-trait LLM gateway (4 impls: ollama/claude/openai/heuristic-mock), embeddings.

## Global Constraints

- Remove `weave_core::classify_domain` and its `FAMILIES` constant entirely; no keyword domain lists anywhere.
- New columns default to empty string (`NOT NULL DEFAULT ''`) — migrations are additive/idempotent (`IF NOT EXISTS`).
- LLM failures in `assign_theme`/`synthesize_agent` must NOT break ingest: log + fall back (empty theme → skill not clustered; agent not created this round).
- Idempotency key for agent emergence is `(team, theme)`, not the display name.
- The heuristic (mock) impl stays deterministic — tests depend on it — and must NOT reintroduce a fixed domain taxonomy.
- Gate: `cargo clippy` 0 warnings; full suite serial (`--test-threads=1`) on a fresh DB.
- Scope: agent emergence only. `infer_memory_level` keywords are out of scope.

---

### Task 1: Schema + core structs (theme on skills, description on agents)

**Files:**
- Create: `migrations/0006_emergence_tuning.sql`
- Modify: `crates/weave-core/src/lib.rs` (Skill, Agent structs)
- Modify: `crates/weave-store/src/postgres.rs` (insert_skill, insert_agent, agents, agent_by_name, skills, skill_by_name, row_to_agent, row_to_skill)

**Interfaces:**
- Produces: `Skill.theme: String`, `Agent.description: String` (both persisted + read back).

- [ ] **Step 1: Write the migration**

`migrations/0006_emergence_tuning.sql`:
```sql
-- Free-text LLM theme per skill (replaces keyword domain clustering) and a
-- synthesized description per agent.
ALTER TABLE skills ADD COLUMN IF NOT EXISTS theme       TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 2: Add fields to core structs**

In `crates/weave-core/src/lib.rs`, add to `pub struct Skill` (after `workstream`):
```rust
    #[serde(default)]
    pub theme: String,
```
Add to `pub struct Agent` (after `domain`):
```rust
    #[serde(default)]
    pub description: String,
```

- [ ] **Step 3: Update store writes/reads**

In `crates/weave-store/src/postgres.rs`:

`insert_skill` — add `theme` to columns/values/bind:
```rust
            "INSERT INTO skills (id, project, team, workstream, name, trigger, body, sources, referents, derived_from_pattern, memory_level, theme)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (project, name) DO NOTHING",
```
…and after `.bind(skill.memory_level.as_str())` add `.bind(&skill.theme)`.

`insert_agent` — add `description`:
```rust
            "INSERT INTO agents (id, project, team, name, role, domain, skills, scope, status, derived_from, description)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (project, name) DO NOTHING",
```
…and after `.bind(&a.derived_from)` add `.bind(&a.description)`.

`agents` and `agent_by_name` SELECTs — append `, description` to the column list.
`skills` and `skill_by_name` SELECTs — append `, theme` to the column list.

In `row_to_agent` add `description: row.get("description"),` and in `row_to_skill` add `theme: row.get("theme"),`. (Find these helpers with `grep -n 'fn row_to_agent\|fn row_to_skill' crates/weave-store/src/postgres.rs`.)

- [ ] **Step 4: Write a roundtrip test**

In `crates/weave-store/tests/postgres_integration.rs`, extend an existing skill/agent test (or add one) asserting `theme`/`description` survive a write→read. Minimal new test:
```rust
#[tokio::test]
async fn skill_theme_and_agent_description_roundtrip() {
    let Some(store) = test_store().await else { return };
    let project = unique("theme");
    // (use the file's existing helpers to build a Skill/Agent; set theme/description)
    // insert, then read back via skills()/agents() and assert the fields match.
}
```
(Match the file's existing helper names — `grep -n 'async fn test_store\|fn unique\|Skill {\|Agent {' crates/weave-store/tests/postgres_integration.rs`.)

- [ ] **Step 5: Build + test**

Run:
```bash
docker exec weave-postgres psql -U weave -d weave -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
TEST_DATABASE_URL=postgres://weave:weave@127.0.0.1:5433/weave WEAVE_ENC_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= cargo test -p weave-store -- --test-threads=1
```
Expected: PASS (build green, roundtrip passes). NOTE: other crates won't build yet if they construct `Skill`/`Agent` literals without the new fields — Task 3/4 fix pipeline; for now add `theme: String::new()` / `description: String::new()` to any literal the compiler flags (seed_predefined_agents in weave-pipeline, test helpers).

- [ ] **Step 6: Commit**

```bash
git add migrations/0006_emergence_tuning.sql crates/weave-core/src/lib.rs crates/weave-store/src/postgres.rs crates/weave-store/tests/postgres_integration.rs
git commit -m "feat(emergence): skills.theme + agents.description schema and structs"
```

---

### Task 2: LLM gateway — assign_theme + synthesize_agent (+ 4 impls)

**Files:**
- Modify: `crates/weave-llm/src/lib.rs` (trait + `SkillBrief`, `AgentSpec` types)
- Modify: `crates/weave-llm/src/heuristic.rs` (deterministic mock)
- Modify: `crates/weave-llm/src/ollama.rs`, `crates/weave-llm/src/claude.rs`, `crates/weave-llm/src/openai.rs`

**Interfaces:**
- Produces:
  - `pub struct SkillBrief { pub name: String, pub trigger: String, pub body: String }`
  - `pub struct AgentSpec { pub name: String, pub role: String, pub description: String }`
  - `async fn assign_theme(&self, trigger: &str, body: &str) -> anyhow::Result<String>`
  - `async fn synthesize_agent(&self, team: &str, theme: &str, skills: &[SkillBrief]) -> anyhow::Result<AgentSpec>`

- [ ] **Step 1: Add types + trait methods**

In `crates/weave-llm/src/lib.rs`, near the other public types:
```rust
/// A skill passed to agent synthesis.
#[derive(Debug, Clone)]
pub struct SkillBrief {
    pub name: String,
    pub trigger: String,
    pub body: String,
}

/// A synthesized agent identity.
#[derive(Debug, Clone)]
pub struct AgentSpec {
    pub name: String,
    pub role: String,
    pub description: String,
}
```
Add to `trait LlmGateway` (after `synthesize_skill`):
```rust
    /// Assign a short free-text theme to a skill (e.g. "réconciliation bancaire").
    async fn assign_theme(&self, trigger: &str, body: &str) -> anyhow::Result<String>;

    /// Synthesize a specialist agent's identity from a cluster of skills.
    async fn synthesize_agent(
        &self,
        team: &str,
        theme: &str,
        skills: &[SkillBrief],
    ) -> anyhow::Result<AgentSpec>;
```

- [ ] **Step 2: Write the heuristic (mock) tests**

In `crates/weave-llm/src/heuristic.rs` `#[cfg(test)] mod tests`:
```rust
    #[tokio::test]
    async fn assign_theme_is_deterministic_and_nonempty() {
        let h = Heuristic::default();
        let a = h.assign_theme("relancer la synchro bancaire", "…").await.unwrap();
        let b = h.assign_theme("relancer la synchro bancaire", "…").await.unwrap();
        assert_eq!(a, b);
        assert!(!a.is_empty());
    }

    #[tokio::test]
    async fn synthesize_agent_fills_identity() {
        let h = Heuristic::default();
        let skills = vec![SkillBrief {
            name: "data/synchro-bancaire".into(),
            trigger: "relancer la synchro bancaire".into(),
            body: "1. Vérifier le connecteur…".into(),
        }];
        let spec = h.synthesize_agent("data", "synchro bancaire", &skills).await.unwrap();
        assert!(!spec.name.is_empty() && !spec.role.is_empty() && !spec.description.is_empty());
    }
```
(Confirm the mock type name with `grep -n 'pub struct\|impl LlmGateway' crates/weave-llm/src/heuristic.rs`; use it in place of `Heuristic::default()`.)

- [ ] **Step 3: Implement in the heuristic mock**

Deterministic, no fixed taxonomy. Add to `impl LlmGateway for <Mock>`:
```rust
    async fn assign_theme(&self, trigger: &str, _body: &str) -> anyhow::Result<String> {
        // Coarse deterministic theme: the two most significant normalized tokens
        // of the trigger. Groups related skills without a hardcoded domain list.
        let stop = ["le","la","les","un","une","des","de","du","à","au","the","a","of"];
        let words: Vec<String> = trigger
            .to_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| w.len() > 2 && !stop.contains(w))
            .take(2)
            .map(str::to_string)
            .collect();
        Ok(words.join(" "))
    }

    async fn synthesize_agent(
        &self,
        team: &str,
        theme: &str,
        skills: &[SkillBrief],
    ) -> anyhow::Result<AgentSpec> {
        let slug: String = theme.split_whitespace().collect::<Vec<_>>().join("-");
        let names: Vec<&str> = skills.iter().map(|s| s.name.as_str()).collect();
        Ok(AgentSpec {
            name: if slug.is_empty() { format!("agent-{team}") } else { format!("agent-{slug}") },
            role: format!(
                "Tu es le spécialiste « {theme} » de l'équipe {team}. Tu t'appuies sur les \
                 procédures {} et la mémoire partagée.",
                names.join(", ")
            ),
            description: format!("Né de {} procédures récurrentes sur « {theme} ».", skills.len()),
        })
    }
```
Add `use crate::{SkillBrief, AgentSpec};` (or `use super::…`) as the module needs.

- [ ] **Step 4: Implement in ollama/claude/openai**

For each real impl, add the two methods. Model them on that file's existing `synthesize_skill` (same client/prompt plumbing). Prompts:
- `assign_theme`: system "Tu classes une compétence d'équipe. Réponds par un thème court (2-4 mots), en minuscules, sans ponctuation." user = `format!("Déclencheur: {trigger}\nProcédure: {body}")`. Return the trimmed first line.
- `synthesize_agent`: instruct the model to return JSON `{"name","role","description"}` from `team`, `theme`, and the skills list; parse it. On parse failure, fall back to a deterministic `AgentSpec` built like the heuristic (so the product degrades gracefully). Reuse `serde_json::from_str`.

Keep each impl's HTTP/client usage identical to its `synthesize_skill`. If a real backend isn't exercised by tests, a compiling implementation that mirrors `synthesize_skill` is sufficient.

- [ ] **Step 5: Test**

Run: `cargo test -p weave-llm -- --test-threads=1`
Expected: heuristic theme + synthesize tests pass; crate builds (all 4 impls compile).

- [ ] **Step 6: Clippy + commit**

```bash
cargo clippy -p weave-llm
git add crates/weave-llm/src/
git commit -m "feat(emergence): LLM assign_theme + synthesize_agent (4 impls, mock deterministic)"
```

---

### Task 3: Pipeline — theme at skill birth + rich (team,theme) agent clustering

**Files:**
- Modify: `crates/weave-pipeline/src/lib.rs` (detect_pattern_and_maybe_emerge, maybe_emerge_agent, imports, seed_predefined_agents literal)

**Interfaces:**
- Consumes: `LlmGateway::assign_theme`, `synthesize_agent`, `SkillBrief`, `AgentSpec`; `Skill.theme`, `Agent.description`.

- [ ] **Step 1: Set the theme when a skill emerges**

In `detect_pattern_and_maybe_emerge`, before building the `Skill { … }`, add:
```rust
        let theme = self
            .llm
            .assign_theme(&fact.topic, &body)
            .await
            .unwrap_or_default(); // best-effort: no theme → not clustered into an agent
```
Add `theme,` to the `Skill { … }` literal (alongside `workstream: fact.workstream.clone()`).

- [ ] **Step 2: Rewrite maybe_emerge_agent to cluster by (team, theme) with synthesized identity**

Replace the body of `maybe_emerge_agent` with:
```rust
    async fn maybe_emerge_agent(&self, project: &str) -> anyhow::Result<()> {
        let skills = self.store.skills(project).await?;
        let existing = self.store.agents(project).await?;

        // Cluster a team's skills by their free-text theme (no keyword domains).
        let mut by: HashMap<(String, String), Vec<&Skill>> = HashMap::new();
        for s in &skills {
            if s.team.is_empty() || s.theme.trim().is_empty() {
                continue; // org-level or un-themed skills don't seed a specialist
            }
            by.entry((s.team.clone(), s.theme.clone())).or_default().push(s);
        }

        for ((team, theme), cluster) in by {
            if cluster.len() < AGENT_EMERGE_THRESHOLD {
                continue;
            }
            // Idempotent by (team, theme): the display name is LLM-rich and can vary.
            if existing.iter().any(|a| a.team == team && a.domain == theme) {
                continue;
            }
            let briefs: Vec<weave_llm::SkillBrief> = cluster
                .iter()
                .map(|s| weave_llm::SkillBrief {
                    name: s.name.clone(),
                    trigger: s.trigger.clone(),
                    body: s.body.clone(),
                })
                .collect();
            let spec = match self.llm.synthesize_agent(&team, &theme, &briefs).await {
                Ok(spec) => spec,
                Err(e) => {
                    tracing::error!("synthesize_agent failed for ({team},{theme}): {e}");
                    continue; // best-effort: skip this round
                }
            };
            let skill_names: Vec<String> = cluster.iter().map(|s| s.name.clone()).collect();
            let agent = Agent {
                id: Uuid::new_v4(),
                project: project.to_string(),
                team: team.clone(),
                name: spec.name.clone(),
                role: spec.role,
                domain: theme.clone(),
                description: spec.description,
                skills: skill_names.clone(),
                scope: MemoryLevel::Team,
                status: AgentStatus::Pending,
                derived_from: format!("équipe {team} · {} skills sur « {theme} »", skill_names.len()),
                created_at: Utc::now(),
            };
            if self.store.insert_agent(&agent).await? {
                self.emit(PipelineEvent::AgentEmerged {
                    name: spec.name,
                    domain: theme,
                    skills: skill_names,
                    status: "pending".into(),
                });
            }
        }
        Ok(())
    }
```

- [ ] **Step 3: Fix the seed literal**

In `seed_predefined_agents`, add `description: String::new(),` to the `Agent { … }` literal.
Remove the now-unused `classify_domain` from the `use weave_core::{…}` import (Task 4 deletes it).

- [ ] **Step 4: Pipeline emergence test**

In `crates/weave-pipeline` tests (find the existing emergence test with `grep -rn 'maybe_emerge\|AgentEmerged\|emerge' crates/weave-pipeline/`; if tests live in an integration file, add there). Test outline (use the crate's existing Runtime test harness + mock LLM):
```rust
// Insert two skills for the same (team="data", theme="synchro bancaire"),
// call the code path that triggers maybe_emerge_agent (e.g. Runtime::ingest of a
// second qualifying event, or a direct call if exposed), then assert:
//   let agents = store.agents(project).await.unwrap();
//   let a = agents.iter().find(|a| a.team=="data" && a.domain=="synchro bancaire").unwrap();
//   assert_eq!(a.status, AgentStatus::Pending);
//   assert!(!a.description.is_empty());
//   assert!(!a.name.starts_with("specialiste-")); // rich, not the old template
// Inserting a third same-theme skill must NOT create a second agent (idempotent).
```
If `maybe_emerge_agent` is private, drive it through `ingest` with seed events that produce two same-theme skills (the mock `assign_theme` reduces both triggers to the same 2 tokens). Prefer an end-to-end ingest test over exposing internals.

- [ ] **Step 5: Run pipeline tests**

Run:
```bash
docker exec weave-postgres psql -U weave -d weave -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
TEST_DATABASE_URL=postgres://weave:weave@127.0.0.1:5433/weave WEAVE_ENC_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= cargo test -p weave-pipeline -- --test-threads=1
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add crates/weave-pipeline/src/lib.rs
git commit -m "feat(emergence): themed clustering + synthesized agent identity"
```

---

### Task 4: Embedding routing + delete classify_domain

**Files:**
- Modify: `crates/weave-pipeline/src/lib.rs` (find_specialist)
- Modify: `crates/weave-core/src/lib.rs` (delete classify_domain + FAMILIES + its tests)

**Interfaces:**
- Consumes: `EmbeddingGateway::embed`, `Agent` fields.

- [ ] **Step 1: Rewrite find_specialist to route by embedding cosine**

Replace `find_specialist` with:
```rust
    /// Find the active specialist (≠ `exclude`) whose identity best matches the
    /// task by embedding similarity. No keyword domains.
    async fn find_specialist(
        &self,
        project: &str,
        task: &str,
        exclude: &str,
    ) -> anyhow::Result<Option<Agent>> {
        const ROUTE_MIN_SIMILARITY: f32 = 0.35;
        let candidates: Vec<Agent> = self
            .store
            .agents(project)
            .await?
            .into_iter()
            .filter(|a| a.status == AgentStatus::Active && a.name != exclude && !a.skills.is_empty())
            .collect();
        if candidates.is_empty() {
            return Ok(None);
        }
        let task_emb = self.embedder.embed(task).await?;
        let mut best: Option<(f32, Agent)> = None;
        for a in candidates {
            let text = format!("{} {} {}", a.domain, a.role, a.description);
            let emb = self.embedder.embed(&text).await?;
            let sim = cosine(&task_emb, &emb);
            if best.as_ref().map(|(b, _)| sim > *b).unwrap_or(true) {
                best = Some((sim, a));
            }
        }
        Ok(best.filter(|(s, _)| *s >= ROUTE_MIN_SIMILARITY).map(|(_, a)| a))
    }
```
Add a cosine helper near the other free functions:
```rust
fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 { 0.0 } else { dot / (na * nb) }
}
```

- [ ] **Step 2: Delete classify_domain**

In `crates/weave-core/src/lib.rs`, delete the `pub fn classify_domain` function, the `FAMILIES` constant, and any `#[cfg(test)]` tests that call `classify_domain` (the ones asserting `.contains("deploy")` / `.contains("staging")`). Remove `classify_domain` from `weave-pipeline`'s `use weave_core::{…}` import (if not already done in Task 3).

- [ ] **Step 3: Routing test**

Add to the pipeline test file:
```rust
// Seed one ACTIVE agent whose (domain/role/description) is about "synchro bancaire".
// find_specialist is private → drive through run_agent on a matching task and assert
// the trace shows a "delegate" step to that agent; for an unrelated task ("congés payés")
// assert no delegation. If find_specialist can be made pub(crate), test it directly:
//   assert!(rt_find_specialist(project, "relancer la synchro bancaire", "assistant").is_some());
//   assert!(rt_find_specialist(project, "quelle météo demain", "assistant").is_none());
```
Prefer driving via `run_agent` and inspecting `AgentRun.trace` for a `delegate` action.

- [ ] **Step 4: Full gate — clippy + all tests, fresh DB**

Run:
```bash
docker exec weave-postgres psql -U weave -d weave -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
cargo clippy -p weave-core -p weave-store -p weave-llm -p weave-pipeline -p weave-api
TEST_DATABASE_URL=postgres://weave:weave@127.0.0.1:5433/weave WEAVE_ENC_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= cargo test -p weave-core -p weave-store -p weave-llm -p weave-pipeline -p weave-api -- --test-threads=1
```
Expected: 0 clippy warnings; all tests pass. Fix any remaining `Skill`/`Agent` literals missing `theme`/`description` (test helpers in weave-api etc.).

- [ ] **Step 5: Commit**

```bash
git add crates/weave-pipeline/src/lib.rs crates/weave-core/src/lib.rs
git commit -m "feat(emergence): embedding-based specialist routing; delete classify_domain"
```

---

## Self-Review

- **Spec coverage:** theme per skill (T1 schema + T3 assign) ✓; (team,theme) clustering (T3) ✓; synthesized identity (T2 + T3) ✓; embedding routing (T4) ✓; idempotency by (team,theme) (T3) ✓; remove classify_domain+FAMILIES (T4) ✓; 4 LLM impls (T2) ✓; mock deterministic no taxonomy (T2 heuristic) ✓; best-effort LLM errors (T3 assign unwrap_or_default, synthesize continue) ✓; migration additive (T1) ✓.
- **Placeholder scan:** test bodies in T3/T4 are outlined (not full code) because they depend on the crate's existing test harness names, which the implementer must grep for — each includes the exact asserts and the driving approach. All production code is complete.
- **Type consistency:** `SkillBrief{name,trigger,body}`, `AgentSpec{name,role,description}`, `assign_theme(trigger,body)`, `synthesize_agent(team,theme,skills)`, `Skill.theme`, `Agent.description`, `cosine` — used identically across tasks.
