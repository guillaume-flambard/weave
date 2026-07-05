# Discord Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, multi-tenant Discord connector that ingests guild text-channel messages into the Weave pipeline, onboarded via an OAuth "Connect Discord" button.

**Architecture:** One Weave-owned Discord app (OAuth bot-install). Each tenant authorizes the bot into their guild; Weave stores the `guild_id` as a `connections` row (`team_id`) and reads message history with its single global bot token. Mirrors the existing Slack connector + Notion OAuth modules exactly.

**Tech Stack:** Rust (axum 0.7, reqwest, serde_json, chrono, uuid, async-trait, wiremock for tests); Next.js 15 / React 19 / TS web app.

## Global Constraints

- Discord REST base: `https://discord.com/api/v10` (env override `DISCORD_API_BASE`).
- Auth header for bot reads: `Authorization: Bot <token>` (NOT bearer).
- No DB migration: `connections.team_id` stores the `guild_id`; global bot token comes from env, never from the stored row.
- Message reads use the **env bot token**, not the OAuth-returned access token.
- Best-effort per channel: a failing/forbidden/429 channel is skipped + logged, never fatal.
- Caps: `max_channels` default 15, `max_messages` default 50 (env `DISCORD_MAX_CHANNELS`, `DISCORD_MAX_MESSAGES`).
- Not-configured OAuth handlers → `web_redirect("connect_error=discord")` (no dead-end), matching Notion.
- Discord returns messages newest-first; ingest oldest-first (`reverse()`).
- Skip bot authors (`author.bot == true`) and empty content.
- Do not touch other providers or the echotravel DB.

---

### Task 1: Discord OAuth module (`discord_oauth.rs`)

**Files:**
- Create: `crates/weave-api/src/discord_oauth.rs`
- Modify: `crates/weave-api/src/main.rs` (add `mod discord_oauth;` near line 31–32 with the other `mod oauth;` / `mod notion_oauth;`)
- Test: inline `#[cfg(test)]` in `discord_oauth.rs`

**Interfaces:**
- Consumes (from `crate::oauth`): `sign_state`, `verify_state`, `urlencode`, `web_redirect`, `store_tokens`, `OauthTokens`.
- Produces:
  - `pub struct DiscordConfig { client_id, client_secret, redirect_uri, bot_token, api_base }`
  - `DiscordConfig::from_env() -> Option<DiscordConfig>`
  - `pub fn parse_discord_response(v: &serde_json::Value) -> anyhow::Result<OauthTokens>`
  - `pub async fn exchange_code(cfg: &DiscordConfig, code: &str) -> anyhow::Result<OauthTokens>`
  - `pub async fn authorize(State<AppState>) -> Response`
  - `pub async fn callback(State<AppState>, Query<CallbackQuery>) -> Response`

- [ ] **Step 1: Write the failing test**

Create `crates/weave-api/src/discord_oauth.rs` with only the test module + a stub so it compiles-then-fails:

```rust
//! Discord OAuth (bot-install flow), mirroring `notion_oauth`. The tenant
//! authorizes the Weave bot into their guild; we persist the returned `guild.id`
//! as the connection's `team_id`. Message reads later use the global bot token,
//! not the token stored here. Access tokens are not refreshed (bot reads don't
//! need them), so `expires_at` is left `None`.

use crate::oauth::{sign_state, store_tokens, urlencode, verify_state, web_redirect, OauthTokens};
use crate::AppState;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use serde::Deserialize;

// VIEW_CHANNEL (1024) | READ_MESSAGE_HISTORY (65536)
const READ_PERMISSIONS: &str = "66560";

pub fn parse_discord_response(_v: &serde_json::Value) -> anyhow::Result<OauthTokens> {
    anyhow::bail!("unimplemented")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ok_takes_guild_id_as_team() {
        let v = serde_json::json!({
            "access_token": "disc_abc",
            "scope": "bot applications.commands",
            "guild": { "id": "G123", "name": "Blue Owl" }
        });
        let t = parse_discord_response(&v).unwrap();
        assert_eq!(t.access_token, "disc_abc");
        assert_eq!(t.team_id, "G123");
        assert_eq!(t.scopes, "bot applications.commands");
        assert!(t.expires_at.is_none());
    }

    #[test]
    fn parse_error_bails() {
        let v = serde_json::json!({ "error": "invalid_grant" });
        assert!(parse_discord_response(&v).is_err());
    }
}
```

Add `mod discord_oauth;` to `crates/weave-api/src/main.rs` beside the existing module declarations (after `mod notion_oauth;` on line 31).

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p weave-api discord_oauth::tests -- --nocapture`
Expected: FAIL — `parse_ok_takes_guild_id_as_team` panics on `.unwrap()` ("unimplemented").

- [ ] **Step 3: Implement the module**

Replace the stub `parse_discord_response` and add config + handlers:

```rust
/// Discord OAuth app config from env. `client_secret` doubles as the HMAC key
/// for the CSRF state (mirrors Notion). Absent creds => feature disabled.
#[derive(Clone)]
pub struct DiscordConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub bot_token: String,
    pub api_base: String,
}

impl DiscordConfig {
    pub fn from_env() -> Option<DiscordConfig> {
        let nonempty = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
        Some(DiscordConfig {
            client_id: nonempty("DISCORD_CLIENT_ID")?,
            client_secret: nonempty("DISCORD_CLIENT_SECRET")?,
            redirect_uri: nonempty("DISCORD_REDIRECT_URI")
                .unwrap_or_else(|| "http://localhost:8787/oauth/discord/callback".into()),
            bot_token: nonempty("DISCORD_BOT_TOKEN")?,
            api_base: nonempty("DISCORD_API_BASE").unwrap_or_else(|| "https://discord.com/api/v10".into()),
        })
    }
}

/// Parse Discord's `/oauth2/token` response. `team_id` = installed `guild.id`.
/// Tokens are not refreshed here, so `expires_at` stays `None`.
pub fn parse_discord_response(v: &serde_json::Value) -> anyhow::Result<OauthTokens> {
    if let Some(err) = v["error"].as_str() {
        anyhow::bail!("discord oauth error: {err}");
    }
    let access_token = v["access_token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing access_token"))?
        .to_string();
    let team_id = v["guild"]["id"].as_str().unwrap_or_default().to_string();
    let scopes = v["scope"].as_str().unwrap_or_default().to_string();
    Ok(OauthTokens {
        access_token,
        refresh_token: v["refresh_token"].as_str().map(str::to_string),
        expires_at: None,
        team_id,
        scopes,
    })
}

/// Exchange an auth code for tokens via `/oauth2/token` (HTTP Basic client auth).
pub async fn exchange_code(cfg: &DiscordConfig, code: &str) -> anyhow::Result<OauthTokens> {
    let v: serde_json::Value = reqwest::Client::new()
        .post(format!("{}/oauth2/token", cfg.api_base))
        .basic_auth(&cfg.client_id, Some(&cfg.client_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", cfg.redirect_uri.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    parse_discord_response(&v)
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: String,
    pub state: String,
}

/// Redirect to Discord's "Add to Server" consent with a signed CSRF state.
pub async fn authorize(State(state): State<AppState>) -> Response {
    let Some(cfg) = DiscordConfig::from_env() else {
        return web_redirect("connect_error=discord");
    };
    let _ = state; // uniform handler signature
    let csrf = sign_state(&cfg.client_secret, chrono::Utc::now().timestamp());
    let url = format!(
        "https://discord.com/oauth2/authorize?client_id={}&scope={}&permissions={}&response_type=code&redirect_uri={}&state={}",
        urlencode(&cfg.client_id),
        urlencode("bot applications.commands"),
        READ_PERMISSIONS,
        urlencode(&cfg.redirect_uri),
        urlencode(&csrf),
    );
    Redirect::temporary(&url).into_response()
}

/// Discord's redirect back: verify state, exchange code, persist the guild.
pub async fn callback(State(state): State<AppState>, Query(q): Query<CallbackQuery>) -> Response {
    let Some(cfg) = DiscordConfig::from_env() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "discord oauth not configured").into_response();
    };
    if !verify_state(&cfg.client_secret, &q.state, chrono::Utc::now().timestamp()) {
        return web_redirect("connect_error=discord");
    }
    let tokens = match exchange_code(&cfg, &q.code).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("discord code exchange failed: {e}");
            return web_redirect("connect_error=discord");
        }
    };
    if let Err(e) = store_tokens(&state, "discord", tokens).await {
        tracing::error!("store discord connection failed: {e}");
        return web_redirect("connect_error=discord");
    }
    web_redirect("connected=discord")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p weave-api discord_oauth::tests`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add crates/weave-api/src/discord_oauth.rs crates/weave-api/src/main.rs
git commit -m "feat(discord): OAuth bot-install module (authorize/callback/exchange)"
```

---

### Task 2: Discord connector (`discord.rs`)

**Files:**
- Create: `crates/weave-ingest/src/discord.rs`
- Modify: `crates/weave-ingest/src/lib.rs` (add `mod discord;` beside `mod slack;` ~line 16, and a `pub use` beside the slack re-export ~line 21)
- Test: inline `#[cfg(test)]` in `discord.rs`

**Interfaces:**
- Consumes: `crate::Connector`, `weave_core::Event`.
- Produces:
  - `pub fn parse_text_channel_ids(resp: &serde_json::Value) -> Vec<String>`
  - `pub fn parse_messages(resp: &serde_json::Value, channel: &str, project: &str) -> Vec<Event>`
  - `pub struct DiscordConnector` with:
    - `for_guild(bot_token, guild_id, project, max_channels: usize, max_messages: u32) -> Self`
    - `with_base(self, base) -> Self`
    - `async fn discover_channels(&self) -> anyhow::Result<Vec<String>>`
    - `async fn poll_all(&self) -> anyhow::Result<Vec<Event>>`
  - re-exported from `weave_ingest` as `DiscordConnector`, `parse_messages as parse_discord_messages`, `parse_text_channel_ids`.

- [ ] **Step 1: Write the failing tests**

Create `crates/weave-ingest/src/discord.rs`:

```rust
//! Read-only Discord connector. Discovers a guild's text channels and maps
//! `GET /channels/{id}/messages` into Weave events. Live via a bot token
//! (`Authorization: Bot <token>`); the pure `parse_messages` / `parse_text_channel_ids`
//! functions are unit-tested offline. Needs the Message Content Intent enabled
//! on the Discord app.

use crate::Connector;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use weave_core::Event;

pub struct DiscordConnector {
    client: reqwest::Client,
    token: String,
    guild_id: String,
    project: String,
    api_base: String,
    max_channels: usize,
    max_messages: u32,
}

/// Pure extractor: text-channel ids (`type == 0`) from a `/guilds/{id}/channels` response.
pub fn parse_text_channel_ids(resp: &serde_json::Value) -> Vec<String> {
    resp.as_array()
        .map(|arr| {
            arr.iter()
                .filter(|c| c["type"].as_i64() == Some(0))
                .filter_map(|c| c["id"].as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

/// Pure mapper from a `/channels/{id}/messages` response array to events.
/// Skips bot authors and empty content; Discord returns newest-first so we reverse.
pub fn parse_messages(resp: &serde_json::Value, channel: &str, project: &str) -> Vec<Event> {
    let mut out = Vec::new();
    let Some(messages) = resp.as_array() else {
        return out;
    };
    for m in messages {
        if m["author"]["bot"].as_bool() == Some(true) {
            continue;
        }
        let text = m["content"].as_str().unwrap_or("").trim();
        if text.is_empty() {
            continue;
        }
        let actor = m["author"]["username"].as_str().unwrap_or("unknown").to_string();
        let ts = m["timestamp"]
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);
        out.push(Event {
            id: Uuid::new_v4(),
            source: "discord".into(),
            ts,
            actor,
            project: project.to_string(),
            kind: "message".into(),
            payload: serde_json::json!({ "text": text, "channel": channel }),
            confidence: 1.0,
        });
    }
    out.reverse();
    out
}

impl DiscordConnector {
    /// Multi-channel connector over one guild; discovers the guild's text channels.
    pub fn for_guild(
        token: impl Into<String>,
        guild_id: impl Into<String>,
        project: impl Into<String>,
        max_channels: usize,
        max_messages: u32,
    ) -> Self {
        DiscordConnector {
            client: reqwest::Client::new(),
            token: token.into(),
            guild_id: guild_id.into(),
            project: project.into(),
            api_base: "https://discord.com/api/v10".into(),
            max_channels,
            max_messages,
        }
    }

    /// Override the API base (tests point this at a wiremock server).
    pub fn with_base(mut self, base: impl Into<String>) -> Self {
        self.api_base = base.into();
        self
    }

    async fn get(&self, path: &str, query: &[(&str, &str)]) -> anyhow::Result<serde_json::Value> {
        let v: serde_json::Value = self
            .client
            .get(format!("{}{path}", self.api_base))
            .header("Authorization", format!("Bot {}", self.token))
            .query(query)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(v)
    }

    /// Discover the guild's text channels (capped).
    pub async fn discover_channels(&self) -> anyhow::Result<Vec<String>> {
        let v = self.get(&format!("/guilds/{}/channels", self.guild_id), &[]).await?;
        let mut ids = parse_text_channel_ids(&v);
        ids.truncate(self.max_channels);
        Ok(ids)
    }

    /// Ingest every discovered channel, best-effort (a failing channel is skipped).
    pub async fn poll_all(&self) -> anyhow::Result<Vec<Event>> {
        let channels = self.discover_channels().await?;
        let limit = self.max_messages.to_string();
        let mut events = Vec::new();
        for ch in channels {
            match self
                .get(&format!("/channels/{ch}/messages"), &[("limit", &limit)])
                .await
            {
                Ok(msgs) => events.extend(parse_messages(&msgs, &ch, &self.project)),
                Err(e) => tracing::warn!("discord channel {ch} skipped: {e}"),
            }
        }
        Ok(events)
    }
}

#[async_trait]
impl Connector for DiscordConnector {
    fn source(&self) -> &str {
        "discord"
    }
    async fn poll(&self) -> anyhow::Result<Vec<Event>> {
        self.poll_all().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_messages_skips_bots_and_empty_reverses() {
        let resp = serde_json::json!([
            { "content": "second", "author": { "username": "zoanlogia", "bot": false }, "timestamp": "2026-07-05T10:11:00.000000+00:00" },
            { "content": "", "author": { "username": "zoanlogia", "bot": false }, "timestamp": "2026-07-05T10:10:00.000000+00:00" },
            { "content": "beep", "author": { "username": "weavebot", "bot": true }, "timestamp": "2026-07-05T10:09:00.000000+00:00" },
            { "content": "first", "author": { "username": "pylon", "bot": false }, "timestamp": "2026-07-05T10:08:00.000000+00:00" }
        ]);
        let events = parse_messages(&resp, "web-general", "blueowl");
        assert_eq!(events.len(), 2); // empty + bot skipped
        // newest-first input reversed → oldest first
        assert_eq!(events[0].actor, "pylon");
        assert!(events[0].text().contains("first"));
        assert_eq!(events[0].payload["channel"], "web-general");
        assert_eq!(events[1].actor, "zoanlogia");
    }

    #[test]
    fn parse_text_channel_ids_keeps_only_text() {
        let resp = serde_json::json!([
            { "id": "C1", "type": 0 },
            { "id": "V1", "type": 2 },
            { "id": "C2", "type": 0 }
        ]);
        assert_eq!(parse_text_channel_ids(&resp), vec!["C1", "C2"]);
        assert!(parse_text_channel_ids(&serde_json::json!([])).is_empty());
    }

    #[tokio::test]
    async fn poll_all_aggregates_channels_best_effort() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;
        // discover: one text + one voice channel
        Mock::given(method("GET"))
            .and(path("/guilds/G1/channels"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
                { "id": "C1", "type": 0 },
                { "id": "C2", "type": 0 },
                { "id": "V1", "type": 2 }
            ])))
            .mount(&server)
            .await;
        // C1 has one usable message
        Mock::given(method("GET"))
            .and(path("/channels/C1/messages"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
                { "content": "relancer la synchro", "author": { "username": "sarah", "bot": false }, "timestamp": "2026-07-05T10:00:00.000000+00:00" }
            ])))
            .mount(&server)
            .await;
        // C2 → 403 forbidden → skipped (best-effort)
        Mock::given(method("GET"))
            .and(path("/channels/C2/messages"))
            .respond_with(ResponseTemplate::new(403))
            .mount(&server)
            .await;

        let c = DiscordConnector::for_guild("tok", "G1", "blueowl", 15, 50).with_base(server.uri());
        let events = c.poll_all().await.unwrap();
        assert_eq!(events.len(), 1); // C1 only; C2 skipped, V1 filtered out
        assert!(events[0].text().contains("synchro"));
    }
}
```

- [ ] **Step 2: Register the module** in `crates/weave-ingest/src/lib.rs`

Add beside `mod slack;`:

```rust
mod discord;
```

Add beside the slack `pub use` (~line 21):

```rust
pub use discord::{parse_messages as parse_discord_messages, parse_text_channel_ids, DiscordConnector};
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cargo test -p weave-ingest discord`
Expected: PASS (3 tests). If `wiremock` is not already a dev-dependency, it is (the Slack tests use it) — confirm with `grep wiremock crates/weave-ingest/Cargo.toml`.

- [ ] **Step 4: Commit**

```bash
git add crates/weave-ingest/src/discord.rs crates/weave-ingest/src/lib.rs
git commit -m "feat(discord): read-only guild connector (discover + poll_all, best-effort)"
```

---

### Task 3: `ingest_discord` handler + routes

**Files:**
- Modify: `crates/weave-api/src/main.rs` (import `DiscordConnector`; add handler; add 3 routes)

**Interfaces:**
- Consumes: `discord_oauth::DiscordConfig` (Task 1), `weave_ingest::DiscordConnector` (Task 2), existing `require_api_key`, `project_of`, `ProjectQ`, `AppError`, `AppState`, `state.store.get_active_connection`.
- Produces: `POST /ingest/discord`, `GET /oauth/discord/authorize`, `GET /oauth/discord/callback`.

- [ ] **Step 1: Write the failing test**

Add to the `#[cfg(test)]` module in `crates/weave-api/src/main.rs` (beside the existing connection/oauth tests):

```rust
#[tokio::test]
async fn ingest_discord_without_connection_is_not_configured() {
    let state = test_state().await; // same helper the other handler tests use
    let app = app(state);
    let res = app
        .oneshot(
            axum::http::Request::builder()
                .method("POST")
                .uri("/ingest/discord")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), axum::http::StatusCode::OK);
    let body = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["status"], "not_configured");
}
```

> Note: use whatever the existing tests use to build the router + state. If they call a helper named differently than `app`/`test_state`, match it (grep `async fn` in the test module first). If `require_api_key` blocks unauthenticated calls in tests, replicate how the sibling `/connections` test authenticates.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p weave-api ingest_discord_without_connection`
Expected: FAIL — route `/ingest/discord` returns 404 (not yet registered).

- [ ] **Step 3: Add the import, handler, and routes**

Add `DiscordConnector` to the `weave_ingest` import in `main.rs` (find the line importing `SlackConnector` and add `DiscordConnector`):

```rust
use weave_ingest::{DiscordConnector, /* …existing imports… */ SlackConnector};
```

Add the handler (place beside `ingest_slack`):

```rust
async fn ingest_discord(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let project = project_of(&q);

    // The connection stores the installed guild id in team_id; reads use the
    // global bot token from env (not the OAuth token on the row).
    let Some(conn) = state.store.get_active_connection(&state.cipher, "discord").await? else {
        return Ok(Json(json!({
            "status": "not_configured",
            "hint": "connect Discord via /oauth/discord/authorize (installs the bot into your guild)"
        })));
    };
    let Some(cfg) = discord_oauth::DiscordConfig::from_env() else {
        return Ok(Json(json!({
            "status": "not_configured",
            "hint": "DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID not set on the API"
        })));
    };

    let guild_id = conn.team_id;
    let max_channels = std::env::var("DISCORD_MAX_CHANNELS").ok().and_then(|v| v.parse().ok()).unwrap_or(15);
    let max_messages = std::env::var("DISCORD_MAX_MESSAGES").ok().and_then(|v| v.parse().ok()).unwrap_or(50);

    tracing::info!(project = %project, source = "discord", guild = %guild_id, "discord ingest requested");
    let events = DiscordConnector::for_guild(cfg.bot_token, guild_id, &project, max_channels, max_messages)
        .poll_all()
        .await?;

    let n = events.len();
    let runtime = state.runtime.clone();
    tokio::spawn(async move {
        for event in events {
            if let Err(e) = runtime.ingest(&event).await {
                tracing::error!("discord ingest failed: {e}");
            }
        }
        tracing::info!("discord ingest complete ({n} events)");
    });
    Ok(Json(json!({ "status": "ingesting", "source": "discord", "events": n, "project": project })))
}
```

Add routes beside the notion oauth routes (after line ~190):

```rust
        .route("/ingest/discord", post(ingest_discord))
        .route("/oauth/discord/authorize", get(discord_oauth::authorize))
        .route("/oauth/discord/callback", get(discord_oauth::callback))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p weave-api ingest_discord_without_connection`
Expected: PASS.

- [ ] **Step 5: Full backend build + clippy**

Run: `cargo build -p weave-api && cargo clippy -p weave-api -p weave-ingest -- -D warnings`
Expected: clean (0 warnings). Fix any before committing.

- [ ] **Step 6: Commit**

```bash
git add crates/weave-api/src/main.rs
git commit -m "feat(discord): POST /ingest/discord + oauth routes wired"
```

---

### Task 4: Web — Connect / Sync / Disconnect for Discord

**Files:**
- Modify: `apps/web/lib/api.ts` (add `ingestDiscord`; widen `authorizeUrl` type)
- Modify: `apps/web/lib/connectors.ts` (add `discord` base + profile entries)
- Modify: `apps/web/components/chat/chat-blocks.tsx` (OAUTH set, `connect`, `sync`, icon, import)

**Interfaces:**
- Consumes: backend `POST /ingest/discord`, `GET /oauth/discord/authorize`, `DELETE /connections/discord` (already generic).
- Produces: `ingestDiscord(project?: string)`; a `discord` connector row rendered by the existing `ConnectorSetupBlock`.

- [ ] **Step 1: `api.ts` — add `ingestDiscord` and widen `authorizeUrl`**

After `ingestNotion` (line ~142):

```ts
export function ingestDiscord(project?: string) {
  const q = project ? `?project=${encodeURIComponent(project)}` : "";
  return fetchJson<{ ingested?: number; events?: number; message?: string }>(`${API}/ingest/discord${q}`, { method: "POST" });
}
```

Change `authorizeUrl` signature (line ~161):

```ts
export function authorizeUrl(provider: "slack" | "notion" | "discord") {
  return `${API}/oauth/${provider}/authorize`;
}
```

- [ ] **Step 2: `connectors.ts` — add the discord source**

Add to `BASE_CONNECTORS` after the `notion` entry (line ~51):

```ts
  {
    id: "discord",
    name: "Discord",
    role: "Questions & réponses des salons d'équipe",
    items: "",
    lastSync: "",
    itemsLabel: "Salons à lire",
    team: "tech",
    things: ["#general", "#tech", "#web-general"],
  },
```

Add `discord` to **both** `PENNYLANE_PROFILE` and `ACME_PROFILE` (`tiers` + `status`), matching the shape of the slack/notion lines:

```ts
    // in tiers:
    discord: "primary",
    // in status:
    discord: "disconnected",
```

- [ ] **Step 3: `chat-blocks.tsx` — wire the provider**

Add the import (line ~12 — extend the existing `../../lib/api` import):

```ts
import { authorizeUrl, disconnectProvider, fetchConnections, ingestDiscord, ingestNotion, ingestSlack } from "../../lib/api";
```

Add an icon (extend the icon import from `lucide-react` with `MessageCircle`, then in the icon switch ~line 30):

```tsx
  if (id === "discord") return <MessageCircle {...p} />;
```

Mark discord as OAuth (line ~49):

```ts
  const OAUTH = new Set(["slack", "notion", "discord"]);
```

Allow discord in `connect` (line ~102):

```ts
    if (id !== "slack" && id !== "notion" && id !== "discord") return;
```

Route the sync call (line ~131):

```ts
      const res = id === "slack" ? await ingestSlack(orgId)
        : id === "discord" ? await ingestDiscord(orgId)
        : await ingestNotion(orgId);
```

- [ ] **Step 4: Typecheck + build the web app**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm build`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Verify in the preview**

Start the dev server (preview_start), open the sources view, confirm a **Discord** row renders with a **Connect** button and a Discord icon. Confirm no console errors (preview_console_logs). (OAuth redirect itself needs live Discord creds — verifying the row + button presence is sufficient here.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api.ts apps/web/lib/connectors.ts apps/web/components/chat/chat-blocks.tsx
git commit -m "feat(discord): web Connect/Sync/Disconnect wiring"
```

---

### Task 5: Config, env template, rollout docs

**Files:**
- Modify: `docker-compose.prod.yml` (pass `DISCORD_*` env to the api service)
- Modify: `.env.example` (or the repo's env template — grep for `SLACK_CLIENT_ID` to find it)
- Modify: `docs/superpowers/specs/2026-07-05-discord-connector-design.md` (tick the rollout checklist as done where applicable) — optional

**Interfaces:** none (config only).

- [ ] **Step 1: Locate the env template and prod compose entries**

Run: `grep -rn "SLACK_CLIENT_ID" .env.example docker-compose.prod.yml 2>/dev/null; grep -rln "SLACK_CLIENT_ID" . --include='*.yml' --include='*.example' --include='*.env*'`
Expected: shows where Slack's OAuth env is declared — mirror those spots.

- [ ] **Step 2: Add Discord env to the template**

In the env template, beside the `SLACK_*` / `NOTION_*` block:

```bash
# Discord (OAuth bot-install; one Weave-owned app). Message Content Intent must be ON.
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_REDIRECT_URI=https://strayeye.com/api/oauth/discord/callback
# Optional: DISCORD_API_BASE, DISCORD_MAX_CHANNELS, DISCORD_MAX_MESSAGES
```

- [ ] **Step 3: Pass the env through `docker-compose.prod.yml`**

In the api service `environment:` block, beside the `SLACK_*` entries:

```yaml
      - DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
      - DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET}
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - DISCORD_REDIRECT_URI=${DISCORD_REDIRECT_URI}
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.prod.yml .env.example
git commit -m "chore(discord): env template + prod compose wiring"
```

- [ ] **Step 5: Manual rollout (documented, not automated)**

1. Discord Developer Portal → New Application "Weave" → Bot → **enable Message Content Intent**.
2. OAuth2 → add redirect `https://strayeye.com/api/oauth/discord/callback`.
3. Copy client id/secret + bot token → set env on Forge (`ovh-echo`), redeploy the api container.
4. In the Weave web app → Sources → **Connect Discord** → pick Blue Owl → authorize.
5. **Sync** → confirm `events > 0` and that facts/skills appear.

---

## Self-Review

**Spec coverage:**
- OAuth bot-install + guild_id storage → Task 1 (module) + Task 3 (stores via `store_tokens` on `team_id`). ✓
- `discover_channels` (type 0, cap) → Task 2. ✓
- `poll_all` best-effort, 403/429 skip → Task 2 (403 tested; 429 also hits the `Err` arm via `error_for_status`). ✓
- `parse_messages` mapping (source/ts ISO/actor/kind/payload, bot+empty skip, reverse) → Task 2. ✓
- `ingest_discord` handler mirroring slack → Task 3. ✓
- Web Connect/Sync/Disconnect reuse → Task 4. ✓
- Not-configured → `web_redirect("connect_error=discord")` → Task 1. ✓
- No migration (team_id=guild_id) → Task 3 uses `conn.team_id`. ✓
- Config/rollout → Task 5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. The one soft spot is Task 3 Step 1's note to match existing test helpers — mitigated with an explicit grep instruction. ✓

**Type consistency:** `parse_discord_response`, `DiscordConfig`, `for_guild(token, guild_id, project, max_channels: usize, max_messages: u32)`, `parse_messages(resp, channel, project)`, `parse_text_channel_ids(resp)` — names identical across Tasks 1–4. `OauthTokens` fields match `crate::oauth`. Auth header `Bot ` (not bearer) consistent. ✓
