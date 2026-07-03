# Notion Connector — Design

**Date:** 2026-07-03
**Status:** Approved (design)
**Sub-project:** Chantier 1 of the "Live real OAuth Slack + Notion" arc (Weave PennyLane demo). Independent, buildable now; no external-account dependency blocks implementation (a Notion integration token supplied via env unblocks live testing, mirroring how `SLACK_BOT_TOKEN` already works).

## Goal

Give Weave a **real** Notion connector that reads pages and database rows from a Notion workspace and threads them into org memory through the existing ingest pipeline — replacing today's `notion_seed_events()` demo replay. This makes the "Notion — décisions & documentation d'équipe" source in the UI genuinely live, matching the already-real Slack connector.

## Non-goals (this chantier)

- **OAuth flow** — deferred to chantier 2/4. Here the token comes from env (`NOTION_TOKEN`), exactly like `SLACK_BOT_TOKEN`.
- **Nested child-page recursion** — only top-level blocks of each page are read in v1.
- **Incremental sync / cursors** — `poll()` returns everything once, like `SeedConnector`. Idempotent re-ingest is handled by `Event::content_hash`.
- **Image / file / embed blocks** — text blocks only.
- **Deployment** — chantier 1 (deploy) in the arc, separate spec.

## Architecture

New module `crates/weave-ingest/src/notion.rs`, exported from `crates/weave-ingest/src/lib.rs` (alongside `slack`). Implements the existing `Connector` trait:

```rust
#[async_trait]
pub trait Connector: Send + Sync {
    fn source(&self) -> &str;               // "notion"
    async fn poll(&self) -> anyhow::Result<Vec<Event>>;
}
```

Same shape as `SlackConnector`: a thin struct holding `reqwest::Client` + token + project + optional scope, with all payload-mapping logic factored into **pure functions** that are unit-tested offline against sample JSON (no token, no network) — mirroring `parse_slack_history`.

```rust
pub struct NotionConnector {
    client: reqwest::Client,
    token: String,
    project: String,
    scope: NotionScope,   // explicit page/db ids, or All (discover via search)
    limit: usize,         // hard cap on objects fetched (default 200)
}

impl NotionConnector {
    pub fn new(token, project, scope) -> Self;
}
```

### Notion API surface used

- `POST /v1/search` — enumerate pages + databases the integration can access. Paginated (`start_cursor`, `next_cursor`, `page_size: 100`). Bounded to `limit` objects total.
- `GET /v1/blocks/{page_id}/children` — top-level blocks of a page.
- `POST /v1/databases/{db_id}/query` — rows (each row is a page object) of a database. Paginated, bounded.

All requests: `Authorization: Bearer {token}`, `Notion-Version: 2022-06-28`, `Content-Type: application/json`.

### Event mapping

One `Event` per page and per database row.

| Event field | Source |
|---|---|
| `source` | `"notion"` |
| `kind` | `"doc_edit"` |
| `ts` | `last_edited_time` (RFC3339 → `DateTime<Utc>`) |
| `actor` | `last_edited_by` display name if resolvable, else `"notion"` |
| `project` | connector's project |
| `confidence` | `1.0` |
| `payload.text` | page: concatenated block text; row: `title — prop summary` |
| `payload.topic` | page/row title (anchors related edits to one signature, like Slack `thread_ts`) |
| `payload.notion_id` | object id (traceability / provenance) |

**Block text extraction** (`parse_page_blocks`): concatenate the plain text of these block types, one line each — `paragraph`, `heading_1`, `heading_2`, `heading_3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `quote`, `callout`, `code`. Each carries a `rich_text` array; `rich_text_to_plain` joins the `plain_text` fields. Unknown block types skipped.

**Database row summary** (`db_row_to_event`): find the `title`-typed property for the row title; summarize other properties compactly by type — `rich_text` (joined plain text), `select`/`status` (name), `multi_select` (names joined), `date` (start), `people` (names), `number`/`checkbox` (value). Result: `"<title> — <k>: <v> · <k>: <v>"`. Property types not listed are skipped.

### Pure functions (offline-tested)

- `rich_text_to_plain(&Value) -> String`
- `parse_page_blocks(&Value) -> String` (takes a `blocks.children` response)
- `page_to_event(&Value page, text, project) -> Event`
- `db_row_to_event(&Value row, project) -> Event`

`poll()` is the only part that touches the network; it composes these.

## API wiring

`ingest_notion` in `crates/weave-api/src/main.rs` (currently replays `notion_seed_events()`):

- `NOTION_TOKEN` set (non-empty) → build `NotionConnector`, `poll()` (surfaces auth errors synchronously, like `ingest_slack`), spawn ingest of the events, return `{status:"ingesting", source:"notion", events:n, project}`.
- `NOTION_TOKEN` unset → **fall back to `notion_seed_events()`** (existing behavior) so the scripted offline demo is never broken.

Optional scope env, read in the handler: `NOTION_PAGE_IDS`, `NOTION_DATABASE_IDS` (comma-separated). Absent → `NotionScope::All` (discover via search).

### Decision: seed fallback (approved)

When no token is configured, keep replaying the seed rather than returning Slack-style `not_configured`. Rationale: the offline scripted demo must keep working with zero secrets. The tradeoff (slightly less "honest" than Slack) is accepted for demo resilience.

## Error handling

`poll()` checks each response for Notion's error envelope (`{"object":"error","status","code","message"}`) plus HTTP `error_for_status()`, and returns `anyhow::Error` with the Notion `message`. The API handler surfaces this to the caller synchronously (same pattern as `ingest_slack`), so a bad/expired token or missing share shows up immediately rather than silently in a spawned task.

Rate limits: Notion allows ~3 req/s. `poll()` fetches sequentially and is bounded by `limit`; no aggressive parallelism. If Notion returns `429`, the error surfaces (no retry loop in v1).

## Testing

**Offline unit tests** (in `notion.rs`, no token/network — mirror the `parse_history` test):
- `rich_text_to_plain` joins multi-run rich text.
- `parse_page_blocks` extracts text across the supported block types and skips unknown ones.
- `page_to_event` sets source/kind/ts/actor/topic/notion_id correctly from a sample page.
- `db_row_to_event` derives title + property summary and correct fields from a sample row.

**API behavior test** (extend existing main.rs tests): `ingest_notion` with no token replays seed (`events` == seed count); shape assertion on the JSON response.

`cargo test` must stay green (currently 15 tests). Existing frontend E2E unaffected (no token in CI → seed fallback).

## Interfaces & isolation

- `NotionConnector` depends only on `reqwest`, `serde_json`, `chrono`, `uuid`, `weave_core::Event`, `async_trait` — same deps as `slack.rs`. No new workspace crates.
- Pure mappers have no I/O → independently testable and reasoned about.
- The API handler depends on the connector only through the `Connector` trait + env, so swapping the token source later (OAuth, chantier 4) touches only the handler, not the connector.
