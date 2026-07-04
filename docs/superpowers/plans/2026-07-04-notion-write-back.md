# Notion Write-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an emergent agent is approved in Weave, write it into a "Weave Agents" Notion database automatically (best-effort, idempotent).

**Architecture:** New `NotionWriter` in `weave-ingest` (mirrors the read-only `NotionConnector`) with an injectable `api_base` for wiremock tests. Pure helpers build the Notion JSON; network methods ensure the database exists and upsert one row per agent keyed by a `WeaveId` property. `approve_agent` in `weave-api` calls it inline, best-effort — Notion errors never fail approval.

**Tech Stack:** Rust, reqwest, serde_json, axum, wiremock (dev), Notion API v1.

## Global Constraints

- Notion API version header: `Notion-Version: 2022-06-28` (verbatim, same as `notion.rs`).
- `api_base` MUST be injectable (default `https://api.notion.com/v1`, override via `NOTION_API_BASE`) so tests hit wiremock, never the real API.
- Best-effort: a Notion failure logs `tracing::error!` and is surfaced in the response `notion` field; it NEVER turns approval into an error.
- Idempotency key: property `WeaveId` (rich_text) = `agent.id` (UUID string).
- Gate: tests run serial (`--test-threads=1`) on a fresh DB; `cargo clippy` 0 warnings.
- Scope: agents only (not skills).

---

### Task 1: Pure Notion-JSON helpers

**Files:**
- Create: `crates/weave-ingest/src/notion_write.rs`
- Modify: `crates/weave-ingest/src/lib.rs` (add `mod notion_write;` + re-export)

**Interfaces:**
- Consumes: `weave_core::Agent`, `weave_core::AgentStatus::as_str`.
- Produces:
  - `pub fn build_agent_properties(agent: &weave_core::Agent) -> serde_json::Value`
  - `pub fn database_schema() -> serde_json::Value`
  - `pub fn first_result_id(query_resp: &serde_json::Value) -> Option<String>`

- [ ] **Step 1: Write failing unit tests**

In `crates/weave-ingest/src/notion_write.rs`:

```rust
//! Write-back of emergent agents into a "Weave Agents" Notion database.
//! Pure helpers build the JSON; network methods live on `NotionWriter`.

use serde_json::{json, Value};
use weave_core::Agent;

/// Notion page `properties` payload for one agent row.
pub fn build_agent_properties(agent: &Agent) -> Value {
    json!({
        "Name":    { "title": [ { "text": { "content": agent.name } } ] },
        "Role":    { "rich_text": [ { "text": { "content": agent.role } } ] },
        "Domain":  { "select": { "name": agent.domain } },
        "Status":  { "select": { "name": agent.status.as_str() } },
        "Skills":  { "multi_select": agent.skills.iter().map(|s| json!({ "name": s })).collect::<Vec<_>>() },
        "Source":  { "rich_text": [ { "text": { "content": agent.derived_from } } ] },
        "WeaveId": { "rich_text": [ { "text": { "content": agent.id.to_string() } } ] },
    })
}

/// Schema for `POST /databases` (property definitions, not values).
pub fn database_schema() -> Value {
    json!({
        "Name":    { "title": {} },
        "Role":    { "rich_text": {} },
        "Domain":  { "select": {} },
        "Status":  { "select": {} },
        "Skills":  { "multi_select": {} },
        "Source":  { "rich_text": {} },
        "WeaveId": { "rich_text": {} },
    })
}

/// First page id from a `/databases/{id}/query` response, if any.
pub fn first_result_id(query_resp: &Value) -> Option<String> {
    query_resp["results"]
        .as_array()?
        .first()?["id"]
        .as_str()
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;
    use weave_core::{Agent, AgentStatus, MemoryLevel};

    fn sample_agent() -> Agent {
        Agent {
            id: Uuid::nil(),
            project: "pennylane".into(),
            team: "data".into(),
            name: "reconciliation-helper".into(),
            role: "Aide à la réconciliation bancaire".into(),
            domain: "finance-ops".into(),
            skills: vec!["match-tx".into(), "flag-anomaly".into()],
            scope: MemoryLevel::Team,
            status: AgentStatus::Active,
            derived_from: "3 patterns in #data".into(),
            created_at: Utc::now(),
        }
    }

    #[test]
    fn properties_map_agent_fields() {
        let p = build_agent_properties(&sample_agent());
        assert_eq!(p["Name"]["title"][0]["text"]["content"], "reconciliation-helper");
        assert_eq!(p["Domain"]["select"]["name"], "finance-ops");
        assert_eq!(p["Status"]["select"]["name"], "active");
        assert_eq!(p["Skills"]["multi_select"][1]["name"], "flag-anomaly");
        assert_eq!(p["WeaveId"]["rich_text"][0]["text"]["content"], Uuid::nil().to_string());
    }

    #[test]
    fn schema_has_weave_id_and_title() {
        let s = database_schema();
        assert!(s["Name"]["title"].is_object());
        assert!(s["WeaveId"]["rich_text"].is_object());
    }

    #[test]
    fn first_result_id_extracts_or_none() {
        assert_eq!(
            first_result_id(&json!({ "results": [ { "id": "page-1" } ] })),
            Some("page-1".to_string())
        );
        assert_eq!(first_result_id(&json!({ "results": [] })), None);
    }
}
```

- [ ] **Step 2: Wire the module**

In `crates/weave-ingest/src/lib.rs`, add near the other `mod`/`pub use` lines:

```rust
pub mod notion_write;
pub use notion_write::{build_agent_properties, database_schema, first_result_id, NotionWriter, NotionOutcome};
```

(`NotionWriter`/`NotionOutcome` land in Task 2; add them now so the export is stable. If the crate must compile after Task 1, temporarily export only the three fns and add the two names in Task 2.)

- [ ] **Step 3: Verify AgentStatus::as_str returns lowercase**

Run: `grep -A6 'fn as_str' crates/weave-core/src/lib.rs`
Expected: `Active => "active"`, `Pending => "pending"`. If not lowercase, adjust the test assertion in Step 1 to match the real value.

- [ ] **Step 4: Run the unit tests**

Run: `cargo test -p weave-ingest notion_write:: -- --test-threads=1`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/weave-ingest/src/notion_write.rs crates/weave-ingest/src/lib.rs
git commit -m "feat(notion-write): pure helpers for agent→Notion JSON"
```

---

### Task 2: NotionWriter network methods (wiremock-tested)

**Files:**
- Modify: `crates/weave-ingest/src/notion_write.rs` (add struct + impl + tests)
- Modify: `crates/weave-ingest/Cargo.toml` (add `wiremock` dev-dependency)

**Interfaces:**
- Consumes: `build_agent_properties`, `database_schema`, `first_result_id`, `weave_core::Agent`.
- Produces:
  - `pub struct NotionWriter { client: reqwest::Client, token: String, api_base: String }`
  - `pub enum NotionOutcome { Created, Updated }`
  - `pub fn NotionWriter::new(token: impl Into<String>) -> Self` (api_base from `NOTION_API_BASE` env or default)
  - `pub fn NotionWriter::with_base(token: impl Into<String>, api_base: impl Into<String>) -> Self`
  - `pub async fn NotionWriter::upsert_agent(&self, agent: &Agent) -> anyhow::Result<NotionOutcome>`

- [ ] **Step 1: Add wiremock dev-dependency**

In `crates/weave-ingest/Cargo.toml`, under `[dev-dependencies]` (create the section if absent):

```toml
[dev-dependencies]
wiremock = "0.6"
tokio = { workspace = true }
```

Run: `cargo build -p weave-ingest` — Expected: compiles (deps resolve).

- [ ] **Step 2: Write the struct + methods**

Append to `crates/weave-ingest/src/notion_write.rs` (before the `#[cfg(test)] mod tests`):

```rust
const NOTION_VERSION: &str = "2022-06-28";
const DB_TITLE: &str = "Weave Agents";

/// Result of an upsert: whether the row was newly created or updated in place.
#[derive(Debug, PartialEq, Eq)]
pub enum NotionOutcome {
    Created,
    Updated,
}

/// Writes agents into a "Weave Agents" Notion database. `api_base` is injectable
/// so tests hit a wiremock server instead of the real Notion API.
pub struct NotionWriter {
    client: reqwest::Client,
    token: String,
    api_base: String,
}

impl NotionWriter {
    pub fn new(token: impl Into<String>) -> Self {
        let api_base = std::env::var("NOTION_API_BASE")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "https://api.notion.com/v1".into());
        Self::with_base(token, api_base)
    }

    pub fn with_base(token: impl Into<String>, api_base: impl Into<String>) -> Self {
        NotionWriter { client: reqwest::Client::new(), token: token.into(), api_base: api_base.into() }
    }

    async fn post(&self, path: &str, body: Value) -> anyhow::Result<Value> {
        let v: Value = self
            .client
            .post(format!("{}{path}", self.api_base))
            .bearer_auth(&self.token)
            .header("Notion-Version", NOTION_VERSION)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(v)
    }

    async fn patch(&self, path: &str, body: Value) -> anyhow::Result<Value> {
        let v: Value = self
            .client
            .patch(format!("{}{path}", self.api_base))
            .bearer_auth(&self.token)
            .header("Notion-Version", NOTION_VERSION)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(v)
    }

    /// Resolve the parent page: `NOTION_PARENT_PAGE_ID`, else the first page from `/search`.
    async fn resolve_parent(&self) -> anyhow::Result<String> {
        if let Ok(id) = std::env::var("NOTION_PARENT_PAGE_ID") {
            if !id.trim().is_empty() {
                return Ok(id);
            }
        }
        let resp = self
            .post("/search", json!({ "filter": { "value": "page", "property": "object" }, "page_size": 1 }))
            .await?;
        resp["results"][0]["id"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("no accessible Notion page to host the Weave Agents database"))
    }

    /// Find the "Weave Agents" database or create it under `parent`.
    async fn ensure_database(&self, parent: &str) -> anyhow::Result<String> {
        let resp = self
            .post("/search", json!({
                "query": DB_TITLE,
                "filter": { "value": "database", "property": "object" },
                "page_size": 10
            }))
            .await?;
        if let Some(results) = resp["results"].as_array() {
            for db in results {
                let title = db["title"][0]["plain_text"].as_str().unwrap_or_default();
                if title == DB_TITLE {
                    if let Some(id) = db["id"].as_str() {
                        return Ok(id.to_string());
                    }
                }
            }
        }
        let created = self
            .post("/databases", json!({
                "parent": { "type": "page_id", "page_id": parent },
                "title": [ { "type": "text", "text": { "content": DB_TITLE } } ],
                "properties": database_schema(),
            }))
            .await?;
        created["id"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("notion returned no database id"))
    }

    /// Idempotently upsert `agent` as a row keyed by `WeaveId`.
    pub async fn upsert_agent(&self, agent: &Agent) -> anyhow::Result<NotionOutcome> {
        let parent = self.resolve_parent().await?;
        let db_id = self.ensure_database(&parent).await?;
        let props = build_agent_properties(agent);

        let query = self
            .post(&format!("/databases/{db_id}/query"), json!({
                "filter": { "property": "WeaveId", "rich_text": { "equals": agent.id.to_string() } },
                "page_size": 1
            }))
            .await?;

        if let Some(page_id) = first_result_id(&query) {
            self.patch(&format!("/pages/{page_id}"), json!({ "properties": props })).await?;
            Ok(NotionOutcome::Updated)
        } else {
            self.post("/pages", json!({
                "parent": { "type": "database_id", "database_id": db_id },
                "properties": props
            }))
            .await?;
            Ok(NotionOutcome::Created)
        }
    }
}
```

- [ ] **Step 3: Write the wiremock tests**

Add inside `#[cfg(test)] mod tests` in `notion_write.rs`:

```rust
    use wiremock::matchers::{method, path, path_regex};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn upsert_creates_when_absent() {
        let server = MockServer::start().await;
        // resolve_parent → /search page
        Mock::given(method("POST")).and(path("/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "results": [ { "id": "parent-page", "object": "page" } ]
            })))
            .mount(&server).await;
        // ensure_database create → /databases
        Mock::given(method("POST")).and(path("/databases"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "db-1" })))
            .mount(&server).await;
        // query → no existing row
        Mock::given(method("POST")).and(path_regex(r"^/databases/.+/query$"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "results": [] })))
            .mount(&server).await;
        // create page
        Mock::given(method("POST")).and(path("/pages"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "page-new" })))
            .mount(&server).await;

        let w = NotionWriter::with_base("tok", server.uri());
        let out = w.upsert_agent(&sample_agent()).await.unwrap();
        assert_eq!(out, NotionOutcome::Created);
    }

    #[tokio::test]
    async fn upsert_updates_when_present() {
        let server = MockServer::start().await;
        Mock::given(method("POST")).and(path("/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "results": [ { "id": "db-1", "object": "database",
                    "title": [ { "plain_text": "Weave Agents" } ] } ]
            })))
            .mount(&server).await;
        // query → existing row
        Mock::given(method("POST")).and(path_regex(r"^/databases/.+/query$"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "results": [ { "id": "row-1" } ] })))
            .mount(&server).await;
        // patch existing page
        Mock::given(method("PATCH")).and(path_regex(r"^/pages/.+$"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "row-1" })))
            .mount(&server).await;

        std::env::set_var("NOTION_PARENT_PAGE_ID", "parent-page");
        let w = NotionWriter::with_base("tok", server.uri());
        let out = w.upsert_agent(&sample_agent()).await.unwrap();
        assert_eq!(out, NotionOutcome::Updated);
        std::env::remove_var("NOTION_PARENT_PAGE_ID");
    }
```

Note: `upsert_updates_when_present` sets `NOTION_PARENT_PAGE_ID` so `resolve_parent` skips `/search` (whose mock here returns the database, not a page). The `/search` mock still serves `ensure_database`, which finds "Weave Agents" and returns `db-1` without creating.

- [ ] **Step 4: Run the tests**

Run: `cargo test -p weave-ingest notion_write:: -- --test-threads=1`
Expected: 5 tests pass (3 pure + 2 wiremock).

- [ ] **Step 5: Clippy**

Run: `cargo clippy -p weave-ingest`
Expected: 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add crates/weave-ingest/src/notion_write.rs crates/weave-ingest/Cargo.toml
git commit -m "feat(notion-write): NotionWriter upsert_agent (ensure db + idempotent row)"
```

---

### Task 3: Wire into approve_agent (best-effort)

**Files:**
- Modify: `crates/weave-api/src/main.rs` (`approve_agent` handler ~682-697; add API test near line 1226)

**Interfaces:**
- Consumes: `weave_ingest::NotionWriter`, `AgentStore::agents`, `get_active_connection`.
- Produces: `approve_agent` response gains a `"notion"` field: `"written" | "not_connected" | "failed"`.

- [ ] **Step 1: Write the failing API test**

Add to the `#[cfg(test)] mod tests` in `crates/weave-api/src/main.rs`:

```rust
    #[tokio::test]
    async fn approve_agent_reports_notion_not_connected() {
        let Some(app) = test_app().await else {
            eprintln!("skipping api test: TEST_DATABASE_URL not set or unavailable");
            return;
        };
        // Seed a pending agent to approve.
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let store = weave_store::PgStore::connect(&url).await.unwrap();
        store.migrate().await.unwrap();
        store.seed_predefined_agents("pennylane").await.ok();

        let body = serde_json::json!({ "project": "pennylane", "name": "assistant" });
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/agents/approve")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let j = json_body(resp).await;
        assert_eq!(j["status"], "active");
        // No Notion connection stored → best-effort reports not_connected.
        assert_eq!(j["notion"], "not_connected");
    }
```

(If `seed_predefined_agents` names differ, use whatever agent name the seed guarantees; the assertion only needs an existing agent to approve. Verify with `grep -n 'seed_predefined_agents' crates/weave-*/src/*.rs`.)

- [ ] **Step 2: Run it to see it fail**

Run: `TEST_DATABASE_URL=postgres://weave:weave@127.0.0.1:5433/weave WEAVE_ENC_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= cargo test -p weave-api --bin weave-api approve_agent_reports_notion_not_connected -- --test-threads=1`
Expected: FAIL — response has no `notion` field.

- [ ] **Step 3: Implement best-effort push in approve_agent**

Replace the body of `approve_agent` (keep signature) so it ends like this:

```rust
    state
        .store
        .set_agent_status(&project, &req.name, AgentStatus::Active)
        .await?;

    // Best-effort: write the approved agent into Notion. Never fails approval.
    let notion = push_agent_to_notion(&state, &project, &req.name).await;

    Ok(Json(json!({ "status": "active", "name": req.name, "project": project, "notion": notion })))
}

/// Push the just-approved agent into Notion. Returns a status string for the
/// response; any error is logged and downgraded to "failed" (best-effort).
async fn push_agent_to_notion(state: &AppState, project: &str, name: &str) -> &'static str {
    use weave_store::AgentStore;
    let conn = match state.store.get_active_connection(&state.cipher, "notion").await {
        Ok(Some(c)) => c,
        Ok(None) => return "not_connected",
        Err(e) => { tracing::error!("notion connection lookup failed: {e}"); return "failed"; }
    };
    let agent = match state.store.agents(project).await {
        Ok(list) => list.into_iter().find(|a| a.name == name),
        Err(e) => { tracing::error!("agent lookup failed: {e}"); return "failed"; }
    };
    let Some(agent) = agent else { return "failed" };
    match weave_ingest::NotionWriter::new(conn.access_token).upsert_agent(&agent).await {
        Ok(_) => "written",
        Err(e) => { tracing::error!("notion write-back failed: {e}"); "failed" }
    }
}
```

- [ ] **Step 4: Run the API test (fresh DB)**

Run: `docker exec weave-postgres psql -U weave -d weave -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`
Then: `TEST_DATABASE_URL=postgres://weave:weave@127.0.0.1:5433/weave WEAVE_ENC_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= cargo test -p weave-api --bin weave-api approve_agent_reports_notion_not_connected -- --test-threads=1`
Expected: PASS.

- [ ] **Step 5: Full gate — clippy + all tests on fresh DB**

Run:
```bash
docker exec weave-postgres psql -U weave -d weave -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
cargo clippy -p weave-api -p weave-ingest -p weave-store
TEST_DATABASE_URL=postgres://weave:weave@127.0.0.1:5433/weave WEAVE_ENC_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= cargo test -p weave-api -p weave-ingest -p weave-store -- --test-threads=1
```
Expected: 0 clippy warnings; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add crates/weave-api/src/main.rs
git commit -m "feat(notion-write): approve_agent writes approved agent to Notion (best-effort)"
```

---

## Self-Review

- **Spec coverage:** target DB (Task 2 `ensure_database`), auto-on-approval (Task 3), best-effort (Task 3 `push_agent_to_notion`), idempotency via WeaveId (Task 2 `upsert_agent` query→patch/create), injectable base for tests (Task 2 `with_base`), agents-only scope (no skills touched). Covered.
- **Placeholders:** none — every step has full code.
- **Type consistency:** `NotionWriter::new/with_base/upsert_agent`, `NotionOutcome::{Created,Updated}`, `build_agent_properties/database_schema/first_result_id` used identically across tasks.
- **Known verifications folded in:** `AgentStatus::as_str` lowercase (Task 1 Step 3); `seed_predefined_agents` agent name (Task 3 Step 1 note).
