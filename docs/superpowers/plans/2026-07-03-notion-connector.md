# Notion Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Notion connector that reads pages + database rows from a workspace and threads them into Weave org memory, replacing the `notion_seed_events()` demo replay when a token is configured.

**Architecture:** New `crates/weave-ingest/src/notion.rs` module implementing the existing `Connector` trait, mirroring `slack.rs`: a thin `NotionConnector` struct (reqwest client + token + project + scope) whose network `poll()` composes **pure, offline-tested mapping functions**. The `ingest_notion` API handler builds the connector when `NOTION_TOKEN` is set, else falls back to the existing seed replay.

**Tech Stack:** Rust, `reqwest` (bearer auth + JSON), `serde_json`, `chrono`, `uuid`, `async-trait`, `anyhow`. Notion REST API v1 (`Notion-Version: 2022-06-28`).

## Global Constraints

- Notion API version header: `Notion-Version: 2022-06-28` (exact) on every request.
- Auth: `Authorization: Bearer {NOTION_TOKEN}`.
- Every produced `Event`: `source == "notion"`, `kind == "doc_edit"`, `confidence == 1.0`.
- No new workspace crates or Cargo deps — only those already in `weave-ingest/Cargo.toml`.
- Object fetch is bounded by `limit` (default 200). Sequential requests, no parallel fan-out (Notion ~3 req/s).
- Pure mapping functions must be unit-tested offline (no token, no network), mirroring `parse_slack_history`.
- `cargo test` stays green (currently 15 tests). CI has no `NOTION_TOKEN` → seed fallback path must remain intact.
- Seed fallback: `NOTION_TOKEN` unset → replay `notion_seed_events()` (do NOT return `not_configured`).

---

### Task 1: Pure text extraction — `rich_text_to_plain` + `parse_page_blocks`

**Files:**
- Create: `crates/weave-ingest/src/notion.rs`
- Modify: `crates/weave-ingest/src/lib.rs` (add `mod notion;` + re-exports)
- Test: inline `#[cfg(test)] mod tests` in `notion.rs`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `pub fn rich_text_to_plain(rich_text: &serde_json::Value) -> String` — takes a `rich_text` array Value, joins each element's `plain_text` with no separator.
  - `pub fn parse_page_blocks(resp: &serde_json::Value) -> String` — takes a `GET /v1/blocks/{id}/children` response (`{"results":[...]}`), returns supported blocks' text joined by `"\n"`.

- [ ] **Step 1: Create the module file with imports and stubs**

Create `crates/weave-ingest/src/notion.rs`:

```rust
//! Read-only Notion connector. Enumerates pages + databases the integration can
//! access (`/v1/search`), reads page block text and database rows, and maps them
//! to Weave events. Live via an integration token; all payload-mapping is pure
//! and unit-tested offline (no token needed).
//!
//! Setup: create a Notion internal integration, share the target pages/databases
//! with it, set NOTION_TOKEN. Capabilities needed: read content (+ read user
//! info to resolve actor names, optional).

use crate::Connector;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use weave_core::Event;

/// The supported block types whose `rich_text` we extract, one line each.
const TEXT_BLOCKS: &[&str] = &[
    "paragraph", "heading_1", "heading_2", "heading_3",
    "bulleted_list_item", "numbered_list_item", "to_do", "quote", "callout", "code",
];

/// Join the `plain_text` runs of a Notion `rich_text` array.
pub fn rich_text_to_plain(rich_text: &serde_json::Value) -> String {
    rich_text
        .as_array()
        .map(|runs| {
            runs.iter()
                .filter_map(|r| r["plain_text"].as_str())
                .collect::<String>()
        })
        .unwrap_or_default()
}

/// Extract text from a `blocks/{id}/children` response: supported block types,
/// one non-empty line each, joined by newlines.
pub fn parse_page_blocks(resp: &serde_json::Value) -> String {
    let Some(results) = resp["results"].as_array() else {
        return String::new();
    };
    let mut lines = Vec::new();
    for block in results {
        let Some(kind) = block["type"].as_str() else { continue };
        if !TEXT_BLOCKS.contains(&kind) {
            continue;
        }
        let line = rich_text_to_plain(&block[kind]["rich_text"]);
        let line = line.trim();
        if !line.is_empty() {
            lines.push(line.to_string());
        }
    }
    lines.join("\n")
}
```

- [ ] **Step 2: Register the module in lib.rs**

In `crates/weave-ingest/src/lib.rs`, next to `mod slack;`:

```rust
mod notion;
```

And next to the `pub use slack::{...}` line, add:

```rust
pub use notion::{parse_page_blocks, rich_text_to_plain};
```

- [ ] **Step 3: Write the failing tests**

Append to `crates/weave-ingest/src/notion.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rich_text_joins_runs() {
        let rt = json!([
            { "plain_text": "Bank" },
            { "plain_text": "Sync" },
            { "plain_text": ".rerun" }
        ]);
        assert_eq!(rich_text_to_plain(&rt), "BankSync.rerun");
    }

    #[test]
    fn parse_blocks_extracts_supported_and_skips_unknown() {
        let resp = json!({
            "results": [
                { "type": "heading_1", "heading_1": { "rich_text": [{ "plain_text": "Resync bancaire" }] } },
                { "type": "paragraph", "paragraph": { "rich_text": [{ "plain_text": "BankSync.rerun(client_id)" }] } },
                { "type": "image", "image": { "file": { "url": "https://x" } } },
                { "type": "to_do", "to_do": { "rich_text": [{ "plain_text": "check Grafana" }] } },
                { "type": "paragraph", "paragraph": { "rich_text": [] } }
            ]
        });
        assert_eq!(
            parse_page_blocks(&resp),
            "Resync bancaire\nBankSync.rerun(client_id)\ncheck Grafana"
        );
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p weave-ingest notion::`
Expected: PASS (2 tests). The implementation from Step 1 already satisfies them — this task front-loads the pure logic so the tests are the gate.

If it fails to compile because `parse_page_blocks`/`rich_text_to_plain` are unused elsewhere yet, that's fine — tests reference them.

- [ ] **Step 5: Commit**

```bash
git add crates/weave-ingest/src/notion.rs crates/weave-ingest/src/lib.rs
git commit -m "feat(ingest): notion block text extraction (pure, tested)"
```

---

### Task 2: Page title + `page_to_event`

**Files:**
- Modify: `crates/weave-ingest/src/notion.rs`
- Test: inline tests in `notion.rs`

**Interfaces:**
- Consumes: `parse_page_blocks` (Task 1) is used later by `poll`, not here.
- Produces:
  - `pub fn page_title(page: &serde_json::Value) -> String` — reads the `title`-typed property from `page["properties"]`, joins its rich text; `"Untitled"` if none.
  - `fn actor_of(obj: &serde_json::Value) -> String` — `obj["last_edited_by"]["name"]` if present, else `"notion"`.
  - `fn ts_of(obj: &serde_json::Value) -> DateTime<Utc>` — parse `obj["last_edited_time"]` (RFC3339), fallback `Utc::now()`.
  - `pub fn page_to_event(page: &serde_json::Value, text: String, project: &str) -> Event` — builds a `doc_edit` event; `payload = { text, topic: page_title, notion_id }`.

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `notion.rs`:

```rust
    #[test]
    fn page_maps_to_event_with_title_topic_and_meta() {
        let page = json!({
            "id": "page-123",
            "last_edited_time": "2026-07-01T10:30:00.000Z",
            "last_edited_by": { "object": "user", "id": "u1", "name": "nicolas" },
            "properties": {
                "title": { "type": "title", "title": [{ "plain_text": "Runbook Resync bancaire" }] }
            }
        });
        let ev = page_to_event(&page, "BankSync.rerun(client_id)".to_string(), "pennylane");
        assert_eq!(ev.source, "notion");
        assert_eq!(ev.kind, "doc_edit");
        assert_eq!(ev.project, "pennylane");
        assert_eq!(ev.actor, "nicolas");
        assert_eq!(ev.confidence, 1.0);
        assert_eq!(ev.payload["text"], "BankSync.rerun(client_id)");
        assert_eq!(ev.payload["topic"], "Runbook Resync bancaire");
        assert_eq!(ev.payload["notion_id"], "page-123");
    }

    #[test]
    fn page_title_falls_back_to_untitled() {
        let page = json!({ "properties": {} });
        assert_eq!(page_title(&page), "Untitled");
    }

    #[test]
    fn actor_falls_back_to_notion() {
        let page = json!({ "id": "p", "properties": {} });
        let ev = page_to_event(&page, "x".to_string(), "proj");
        assert_eq!(ev.actor, "notion");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p weave-ingest notion::`
Expected: FAIL — `page_to_event`, `page_title` not found.

- [ ] **Step 3: Implement**

Add to `notion.rs` (before the `tests` module):

```rust
/// The title of a page/row: first property whose type is "title".
pub fn page_title(page: &serde_json::Value) -> String {
    if let Some(props) = page["properties"].as_object() {
        for prop in props.values() {
            if prop["type"] == "title" {
                let t = rich_text_to_plain(&prop["title"]);
                let t = t.trim();
                if !t.is_empty() {
                    return t.to_string();
                }
            }
        }
    }
    "Untitled".to_string()
}

fn actor_of(obj: &serde_json::Value) -> String {
    obj["last_edited_by"]["name"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("notion")
        .to_string()
}

fn ts_of(obj: &serde_json::Value) -> DateTime<Utc> {
    obj["last_edited_time"]
        .as_str()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(Utc::now)
}

/// Map a Notion page (with its already-extracted block text) to an event.
pub fn page_to_event(page: &serde_json::Value, text: String, project: &str) -> Event {
    let id = page["id"].as_str().unwrap_or("").to_string();
    Event {
        id: Uuid::new_v4(),
        source: "notion".into(),
        ts: ts_of(page),
        actor: actor_of(page),
        project: project.to_string(),
        kind: "doc_edit".into(),
        payload: serde_json::json!({
            "text": text,
            "topic": page_title(page),
            "notion_id": id,
        }),
        confidence: 1.0,
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p weave-ingest notion::`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add crates/weave-ingest/src/notion.rs
git commit -m "feat(ingest): map notion page to event"
```

---

### Task 3: Database row mapping — `summarize_property` + `db_row_to_event`

**Files:**
- Modify: `crates/weave-ingest/src/notion.rs`
- Test: inline tests in `notion.rs`

**Interfaces:**
- Consumes: `page_title`, `actor_of`, `ts_of` (Task 2).
- Produces:
  - `fn summarize_property(name: &str, prop: &serde_json::Value) -> Option<String>` — `"name: value"` for supported property types; `None` for `title` and unsupported types.
  - `pub fn db_row_to_event(row: &serde_json::Value, project: &str) -> Event` — text is `"<title> — <prop summary · ...>"` (or just `<title>` if no other props); `payload = { text, topic: title, notion_id }`.

- [ ] **Step 1: Write the failing test**

Add to the `tests` module:

```rust
    #[test]
    fn summarize_handles_common_property_types() {
        assert_eq!(
            summarize_property("Statut", &json!({ "type": "status", "status": { "name": "En cours" } })),
            Some("Statut: En cours".to_string())
        );
        assert_eq!(
            summarize_property("Équipe", &json!({ "type": "select", "select": { "name": "Data" } })),
            Some("Équipe: Data".to_string())
        );
        assert_eq!(
            summarize_property("Tags", &json!({ "type": "multi_select", "multi_select": [
                { "name": "bank" }, { "name": "sync" }
            ] })),
            Some("Tags: bank, sync".to_string())
        );
        assert_eq!(
            summarize_property("Notes", &json!({ "type": "rich_text", "rich_text": [{ "plain_text": "idempotent" }] })),
            Some("Notes: idempotent".to_string())
        );
        // title is the row title, not a summary line
        assert_eq!(
            summarize_property("Name", &json!({ "type": "title", "title": [{ "plain_text": "X" }] })),
            None
        );
        // unsupported type
        assert_eq!(
            summarize_property("Files", &json!({ "type": "files", "files": [] })),
            None
        );
    }

    #[test]
    fn db_row_maps_to_event_with_title_and_summary() {
        let row = json!({
            "id": "row-9",
            "last_edited_time": "2026-07-02T08:00:00.000Z",
            "last_edited_by": { "name": "camille" },
            "properties": {
                "Name": { "type": "title", "title": [{ "plain_text": "Resync staging" }] },
                "Statut": { "type": "status", "status": { "name": "Fait" } },
                "Tags": { "type": "multi_select", "multi_select": [{ "name": "bank" }] }
            }
        });
        let ev = db_row_to_event(&row, "pennylane");
        assert_eq!(ev.source, "notion");
        assert_eq!(ev.kind, "doc_edit");
        assert_eq!(ev.actor, "camille");
        assert_eq!(ev.payload["topic"], "Resync staging");
        assert_eq!(ev.payload["notion_id"], "row-9");
        let text = ev.payload["text"].as_str().unwrap();
        assert!(text.starts_with("Resync staging — "), "got: {text}");
        assert!(text.contains("Statut: Fait"), "got: {text}");
        assert!(text.contains("Tags: bank"), "got: {text}");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p weave-ingest notion::`
Expected: FAIL — `summarize_property`, `db_row_to_event` not found.

- [ ] **Step 3: Implement**

Add to `notion.rs` (before the `tests` module):

```rust
/// A compact "Name: value" line for a database property, or None if the type is
/// the row title or unsupported.
fn summarize_property(name: &str, prop: &serde_json::Value) -> Option<String> {
    let ty = prop["type"].as_str()?;
    let value = match ty {
        "title" => return None,
        "rich_text" => rich_text_to_plain(&prop["rich_text"]),
        "select" => prop["select"]["name"].as_str().unwrap_or_default().to_string(),
        "status" => prop["status"]["name"].as_str().unwrap_or_default().to_string(),
        "multi_select" => prop["multi_select"]
            .as_array()
            .map(|opts| {
                opts.iter()
                    .filter_map(|o| o["name"].as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default(),
        "date" => prop["date"]["start"].as_str().unwrap_or_default().to_string(),
        "people" => prop["people"]
            .as_array()
            .map(|ppl| {
                ppl.iter()
                    .filter_map(|p| p["name"].as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default(),
        "number" => match prop["number"].as_f64() {
            Some(n) => n.to_string(),
            None => return None,
        },
        "checkbox" => if prop["checkbox"].as_bool().unwrap_or(false) { "oui" } else { "non" }.to_string(),
        _ => return None,
    };
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    Some(format!("{name}: {value}"))
}

/// Map a database row (a page object from `databases/{id}/query`) to an event.
pub fn db_row_to_event(row: &serde_json::Value, project: &str) -> Event {
    let title = page_title(row);
    let mut parts = Vec::new();
    if let Some(props) = row["properties"].as_object() {
        for (name, prop) in props {
            if let Some(line) = summarize_property(name, prop) {
                parts.push(line);
            }
        }
    }
    let text = if parts.is_empty() {
        title.clone()
    } else {
        format!("{title} — {}", parts.join(" · "))
    };
    let id = row["id"].as_str().unwrap_or("").to_string();
    Event {
        id: Uuid::new_v4(),
        source: "notion".into(),
        ts: ts_of(row),
        actor: actor_of(row),
        project: project.to_string(),
        kind: "doc_edit".into(),
        payload: serde_json::json!({ "text": text, "topic": title, "notion_id": id }),
        confidence: 1.0,
    }
}
```

Note: `properties` is a JSON object; iteration order is not guaranteed, so the test asserts with `contains` rather than exact string equality for the summary parts.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p weave-ingest notion::`
Expected: PASS (all notion tests).

- [ ] **Step 5: Commit**

```bash
git add crates/weave-ingest/src/notion.rs
git commit -m "feat(ingest): map notion database rows to events"
```

---

### Task 4: `NotionScope` + `NotionConnector` (network `poll`)

**Files:**
- Modify: `crates/weave-ingest/src/notion.rs`
- Modify: `crates/weave-ingest/src/lib.rs` (extend re-exports)
- Test: inline test in `notion.rs` (scope parsing only — `poll` is network, not unit-tested)

**Interfaces:**
- Consumes: `parse_page_blocks`, `page_to_event`, `db_row_to_event`.
- Produces:
  - `pub enum NotionScope { All, Ids { pages: Vec<String>, databases: Vec<String> } }`
  - `pub fn scope_from_ids(pages_csv: Option<&str>, databases_csv: Option<&str>) -> NotionScope` — both `None`/empty → `All`; otherwise `Ids` with comma-split trimmed non-empty ids.
  - `pub struct NotionConnector` with `pub fn new(token, project, scope) -> Self` and `impl Connector` (`source() == "notion"`, `poll()` returns `Vec<Event>`).

- [ ] **Step 1: Write the failing test (scope parsing)**

Add to the `tests` module:

```rust
    #[test]
    fn scope_none_is_all() {
        assert!(matches!(scope_from_ids(None, None), NotionScope::All));
        assert!(matches!(scope_from_ids(Some(""), Some("  ")), NotionScope::All));
    }

    #[test]
    fn scope_parses_csv_ids() {
        match scope_from_ids(Some("p1, p2 ,"), Some("d1")) {
            NotionScope::Ids { pages, databases } => {
                assert_eq!(pages, vec!["p1", "p2"]);
                assert_eq!(databases, vec!["d1"]);
            }
            NotionScope::All => panic!("expected Ids"),
        }
    }

    #[test]
    fn connector_reports_source() {
        let c = NotionConnector::new("tok", "pennylane", NotionScope::All);
        assert_eq!(c.source(), "notion");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p weave-ingest notion::`
Expected: FAIL — `NotionScope`, `scope_from_ids`, `NotionConnector` not found.

- [ ] **Step 3: Implement the scope parser, struct, and Connector**

Add to `notion.rs` (before the `tests` module). Place the `use` additions at the top of the file with the other imports:

```rust
// add near the top imports:
// use std::collections::HashMap;  // not needed unless resolving users; skip for v1
```

```rust
const NOTION_VERSION: &str = "2022-06-28";
const API: &str = "https://api.notion.com/v1";

/// Which Notion objects to ingest.
pub enum NotionScope {
    /// Everything the integration can access (discovered via /v1/search).
    All,
    /// Explicit object ids.
    Ids { pages: Vec<String>, databases: Vec<String> },
}

fn split_ids(csv: Option<&str>) -> Vec<String> {
    csv.unwrap_or_default()
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// Build a scope from comma-separated id env vars. Empty/absent → All.
pub fn scope_from_ids(pages_csv: Option<&str>, databases_csv: Option<&str>) -> NotionScope {
    let pages = split_ids(pages_csv);
    let databases = split_ids(databases_csv);
    if pages.is_empty() && databases.is_empty() {
        NotionScope::All
    } else {
        NotionScope::Ids { pages, databases }
    }
}

pub struct NotionConnector {
    client: reqwest::Client,
    token: String,
    project: String,
    scope: NotionScope,
    limit: usize,
}

impl NotionConnector {
    pub fn new(token: impl Into<String>, project: impl Into<String>, scope: NotionScope) -> Self {
        NotionConnector {
            client: reqwest::Client::new(),
            token: token.into(),
            project: project.into(),
            scope,
            limit: 200,
        }
    }

    async fn get(&self, path: &str) -> anyhow::Result<serde_json::Value> {
        let v: serde_json::Value = self
            .client
            .get(format!("{API}{path}"))
            .bearer_auth(&self.token)
            .header("Notion-Version", NOTION_VERSION)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        check_error(&v)?;
        Ok(v)
    }

    async fn post(&self, path: &str, body: serde_json::Value) -> anyhow::Result<serde_json::Value> {
        let v: serde_json::Value = self
            .client
            .post(format!("{API}{path}"))
            .bearer_auth(&self.token)
            .header("Notion-Version", NOTION_VERSION)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        check_error(&v)?;
        Ok(v)
    }

    /// Discover (page_ids, database_ids) per the scope.
    async fn discover(&self) -> anyhow::Result<(Vec<String>, Vec<String>)> {
        match &self.scope {
            NotionScope::Ids { pages, databases } => Ok((pages.clone(), databases.clone())),
            NotionScope::All => {
                let mut pages = Vec::new();
                let mut databases = Vec::new();
                let mut cursor: Option<String> = None;
                loop {
                    let mut body = serde_json::json!({ "page_size": 100 });
                    if let Some(c) = &cursor {
                        body["start_cursor"] = serde_json::Value::String(c.clone());
                    }
                    let resp = self.post("/search", body).await?;
                    if let Some(results) = resp["results"].as_array() {
                        for obj in results {
                            let Some(id) = obj["id"].as_str() else { continue };
                            match obj["object"].as_str() {
                                Some("page") => pages.push(id.to_string()),
                                Some("database") => databases.push(id.to_string()),
                                _ => {}
                            }
                        }
                    }
                    if pages.len() + databases.len() >= self.limit {
                        break;
                    }
                    match resp["next_cursor"].as_str() {
                        Some(c) => cursor = Some(c.to_string()),
                        None => break,
                    }
                }
                Ok((pages, databases))
            }
        }
    }
}

/// Surface Notion's error envelope as an error.
fn check_error(v: &serde_json::Value) -> anyhow::Result<()> {
    if v["object"].as_str() == Some("error") {
        anyhow::bail!(
            "notion error {}: {}",
            v["code"].as_str().unwrap_or("unknown"),
            v["message"].as_str().unwrap_or("")
        );
    }
    Ok(())
}

#[async_trait]
impl Connector for NotionConnector {
    fn source(&self) -> &str {
        "notion"
    }

    async fn poll(&self) -> anyhow::Result<Vec<Event>> {
        let (page_ids, db_ids) = self.discover().await?;
        let mut events = Vec::new();

        for id in page_ids {
            if events.len() >= self.limit {
                break;
            }
            // Page metadata (title, last_edited_*) + its block text.
            let page = self.get(&format!("/pages/{id}")).await?;
            let blocks = self.get(&format!("/blocks/{id}/children?page_size=100")).await?;
            let text = parse_page_blocks(&blocks);
            events.push(page_to_event(&page, text, &self.project));
        }

        for db_id in db_ids {
            if events.len() >= self.limit {
                break;
            }
            let mut cursor: Option<String> = None;
            loop {
                let mut body = serde_json::json!({ "page_size": 100 });
                if let Some(c) = &cursor {
                    body["start_cursor"] = serde_json::Value::String(c.clone());
                }
                let resp = self.post(&format!("/databases/{db_id}/query"), body).await?;
                if let Some(rows) = resp["results"].as_array() {
                    for row in rows {
                        events.push(db_row_to_event(row, &self.project));
                        if events.len() >= self.limit {
                            break;
                        }
                    }
                }
                match resp["next_cursor"].as_str() {
                    Some(c) if events.len() < self.limit => cursor = Some(c.to_string()),
                    _ => break,
                }
            }
        }

        // Oldest first, consistent with the Slack connector.
        events.sort_by_key(|e| e.ts);
        Ok(events)
    }
}
```

- [ ] **Step 4: Extend lib.rs re-exports**

In `crates/weave-ingest/src/lib.rs`, update the notion re-export line to:

```rust
pub use notion::{
    db_row_to_event, page_to_event, parse_page_blocks, rich_text_to_plain, scope_from_ids,
    NotionConnector, NotionScope,
};
```

- [ ] **Step 5: Run tests + full build to verify**

Run: `cargo test -p weave-ingest`
Expected: PASS (all notion tests + existing seed test).

Run: `cargo build -p weave-ingest`
Expected: compiles clean, no warnings about unused code.

- [ ] **Step 6: Commit**

```bash
git add crates/weave-ingest/src/notion.rs crates/weave-ingest/src/lib.rs
git commit -m "feat(ingest): NotionConnector poll() over pages + databases"
```

---

### Task 5: Wire `ingest_notion` to the real connector (token → real, else seed)

**Files:**
- Modify: `crates/weave-api/src/main.rs` (imports line ~20-22; `ingest_notion` fn ~480-503; add a test near the existing `#[cfg(test)]` tests)

**Interfaces:**
- Consumes: `NotionConnector`, `NotionScope`, `scope_from_ids` (Task 4); existing `notion_seed_events`, `Connector`, `project_of`, `require_api_key`, `state.runtime`.
- Produces: updated handler behavior; no new public API.

- [ ] **Step 1: Add imports**

In `crates/weave-api/src/main.rs`, extend the `weave_ingest` use block (lines 20-22) to:

```rust
use weave_ingest::{
    generate_events, preset_by_org, presets, scope_from_ids, seed_events, notion_seed_events,
    Connector, NotionConnector, SlackConnector,
};
```

- [ ] **Step 2: Write the failing test**

The existing tests build an app and hit routes. Add a test asserting that with no `NOTION_TOKEN`, `POST /ingest/notion` still returns the seed path (`status:"ingesting"`, `source:"notion"`, `events` == notion seed count). Add near the other route tests in the `#[cfg(test)]` module:

```rust
    #[tokio::test]
    async fn ingest_notion_without_token_replays_seed() {
        std::env::remove_var("NOTION_TOKEN");
        let app = test_app().await;
        let seed_count = weave_ingest::notion_seed_events().len();
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/ingest/notion?project=pennylane")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(v["source"], "notion");
        assert_eq!(v["status"], "ingesting");
        assert_eq!(v["events"], seed_count);
    }
```

Note: match the exact helper names used by the surrounding tests. If the existing tests use a helper other than `test_app()` / a different `to_bytes` import, mirror those exactly — read the neighbouring test bodies first and copy their setup verbatim. If the API requires an api key, add the same header the other POST tests use.

- [ ] **Step 3: Run test to verify it fails or passes-for-wrong-reason**

Run: `cargo test -p weave-api ingest_notion_without_token`
Expected: Likely PASS already (current handler always replays seed). This test locks in the fallback so Task 5's refactor cannot regress it. If it fails, fix the test setup to match the existing test harness before touching the handler.

- [ ] **Step 4: Rewrite `ingest_notion` to branch on the token**

Replace the body of `ingest_notion` (currently lines ~480-503) with:

```rust
/// Ingest a real Notion workspace when NOTION_TOKEN is set; otherwise replay the
/// Notion-tagged seed events (keeps the offline demo working with no secrets).
async fn ingest_notion(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let project = project_of(&q);
    let token = std::env::var("NOTION_TOKEN").ok().filter(|t| !t.trim().is_empty());

    let events = match token {
        Some(token) => {
            let scope = scope_from_ids(
                std::env::var("NOTION_PAGE_IDS").ok().as_deref(),
                std::env::var("NOTION_DATABASE_IDS").ok().as_deref(),
            );
            tracing::info!(project = %project, source = "notion", "notion live ingest requested");
            let connector = NotionConnector::new(token, project.clone(), scope);
            connector.poll().await? // surface auth/permission errors now
        }
        None => {
            let mut events = notion_seed_events();
            for event in &mut events {
                event.project = project.clone();
            }
            tracing::info!(project = %project, source = "notion", events = events.len(), "notion seed replay (no token)");
            events
        }
    };

    let n = events.len();
    let runtime = state.runtime.clone();
    tokio::spawn(async move {
        for event in events {
            if let Err(e) = runtime.ingest(&event).await {
                tracing::error!("notion ingest failed: {e}");
            }
        }
        tracing::info!("notion ingest complete ({n} events)");
    });
    Ok(Json(json!({ "status": "ingesting", "source": "notion", "events": n, "project": project })))
}
```

- [ ] **Step 5: Run the test + full workspace tests**

Run: `cargo test -p weave-api ingest_notion_without_token`
Expected: PASS.

Run: `cargo test`
Expected: PASS — all workspace tests (15 existing + new notion tests).

- [ ] **Step 6: Commit**

```bash
git add crates/weave-api/src/main.rs
git commit -m "feat(api): ingest_notion uses real connector when NOTION_TOKEN set"
```

---

### Task 6: Document the env config

**Files:**
- Modify: `.env.example`
- Modify: `README.md` (connector/setup section, if present)

**Interfaces:**
- Consumes: nothing. Produces: docs only.

- [ ] **Step 1: Add Notion config to `.env.example`**

Append near the Slack config (or in a "Connectors" area):

```bash
# --- Notion connector (real ingest) ---
# Create an internal integration at https://www.notion.so/my-integrations,
# copy its token, and share the target pages/databases with the integration.
# Unset → the demo replays scripted Notion seed events instead.
NOTION_TOKEN=
# Optional: restrict to specific object ids (comma-separated). Empty = everything shared.
NOTION_PAGE_IDS=
NOTION_DATABASE_IDS=
```

If `.env.example` has no Slack section, also confirm Slack's vars (`SLACK_BOT_TOKEN`, `SLACK_CHANNEL`) are documented; add them in the same style if missing.

- [ ] **Step 2: Add a short README note**

If `README.md` has a connectors/setup section, add one line: real Notion ingest via `NOTION_TOKEN` (integration token; share pages/databases with the integration), falling back to seed replay when unset — mirroring Slack.

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document NOTION_TOKEN connector config"
```

---

## Self-Review

**Spec coverage:**
- Real page ingest (blocks → event) → Tasks 1, 2, 4. ✅
- Real database row ingest → Tasks 3, 4. ✅
- Pure offline-tested mappers (`rich_text_to_plain`, `parse_page_blocks`, `page_to_event`, `db_row_to_event`) → Tasks 1-3. ✅
- `Connector` trait impl, `source()=="notion"`, bounded `limit`, sequential fetch → Task 4. ✅
- Notion API surface (`/search`, `/blocks/{id}/children`, `/databases/{id}/query`), version header, bearer auth → Task 4. ✅
- Event field mapping table (source/kind/ts/actor/project/confidence/text/topic/notion_id) → Tasks 2-3. ✅
- API wiring: token → real, else seed fallback; scope env; synchronous error surfacing → Task 5. ✅
- Error envelope handling (`object:"error"`) + `error_for_status` → Task 4 (`check_error`). ✅
- Env config docs → Task 6. ✅
- Non-goals (OAuth, nested pages, incremental cursor, image blocks) correctly omitted. ✅
- `cargo test` stays green; CI seed path intact → Task 5 test. ✅

**Placeholder scan:** No TBD/TODO. Task 5 Step 2 flags "mirror the existing test harness" — this is a real instruction (read neighbouring tests) not a placeholder, because the exact helper names in main.rs's test module are not visible in the spec; the implementer must match them. Every code step ships complete code.

**Type consistency:** `NotionScope`, `scope_from_ids`, `NotionConnector::new(token, project, scope)`, `page_to_event(page, text, project)`, `db_row_to_event(row, project)`, `parse_page_blocks(resp)`, `rich_text_to_plain(rich_text)` are used with identical signatures across tasks and re-exports. `check_error`, `actor_of`, `ts_of`, `page_title`, `split_ids`, `summarize_property` are internal helpers, defined once. ✅
