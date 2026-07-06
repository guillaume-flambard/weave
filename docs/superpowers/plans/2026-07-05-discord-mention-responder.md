# Discord @Mention Responder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a participant @mentions the Weave bot in a Discord channel, Weave posts an in-thread reply built from `runtime.answer` (skill + facts), naming a matching specialist agent, and never answers the same mention twice.

**Architecture:** Extend the read-only Discord connector with a narrow write (`post_reply`) + mention discovery (`discover_mentions`). A cron-driven `POST /respond/discord` endpoint finds unanswered @mentions, calls a new `Runtime::answer_for_chat` (answer + routed agent name), posts the reply, and records the message id in an `answered_mentions` table so poll cycles don't double-reply.

**Tech Stack:** Rust (reqwest, sqlx/Postgres, serde_json, wiremock for tests); external cron for cadence.

## Global Constraints

- Discord REST base default `https://discord.com/api/v10`; auth header `Authorization: Bot <token>` (NOT bearer).
- Reads + writes use the env bot token (`DiscordConfig::from_env().bot_token`), guild from `connections.team_id`.
- Mark a mention answered ONLY after a successful post → a failed post retries next cycle.
- Only react to messages that mention the bot, have non-empty content, and whose `author.bot != true`.
- Discord message content cap = 2000 chars → chunk at ≤1900.
- Best-effort per channel/message: skip + `tracing::warn!`, never fatal.
- Not-configured (no connection / no `DiscordConfig`) → 200 `{"status":"not_configured"}`.
- `AppState.store` is `Arc<PgStore>` → `is_answered`/`mark_answered` are inherent `PgStore` methods.
- DB tests use `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test`; skip when unset.
- Do not touch other providers, the ingest path, or the echotravel DB.

---

### Task 1: Discord write + mention discovery (`discord.rs`)

**Files:**
- Modify: `crates/weave-ingest/src/discord.rs` (add `post` helper, `post_reply`, `bot_user_id`, `mentions_bot`, `strip_mention`, `MentionMsg`, `discover_mentions`)
- Test: inline `#[cfg(test)]` in `discord.rs`

**Interfaces:**
- Produces:
  - `pub fn mentions_bot(msg: &serde_json::Value, bot_user_id: &str) -> bool`
  - `pub struct MentionMsg { pub channel_id: String, pub message_id: String, pub author: String, pub text: String }`
  - `DiscordConnector::bot_user_id(&self) -> anyhow::Result<String>`
  - `DiscordConnector::discover_mentions(&self, bot_user_id: &str) -> anyhow::Result<Vec<MentionMsg>>`
  - `DiscordConnector::post_reply(&self, channel_id: &str, text: &str, reply_to_message_id: &str) -> anyhow::Result<()>`

- [ ] **Step 1: Write the failing tests**

Add to the `#[cfg(test)] mod tests` in `crates/weave-ingest/src/discord.rs`:

```rust
#[test]
fn mentions_bot_detects_array_and_inline() {
    let by_array = serde_json::json!({
        "content": "hey can you help", "mentions": [{ "id": "BOT" }]
    });
    assert!(mentions_bot(&by_array, "BOT"));
    let by_inline = serde_json::json!({ "content": "<@BOT> comment relancer minerva ?", "mentions": [] });
    assert!(mentions_bot(&by_inline, "BOT"));
    let by_inline_nick = serde_json::json!({ "content": "<@!BOT> yo", "mentions": [] });
    assert!(mentions_bot(&by_inline_nick, "BOT"));
    let no = serde_json::json!({ "content": "no mention here", "mentions": [{ "id": "SOMEONE" }] });
    assert!(!mentions_bot(&no, "BOT"));
}

#[tokio::test]
async fn post_reply_posts_with_message_reference() {
    use wiremock::matchers::{method, path, body_string_contains};
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/channels/C1/messages"))
        .and(body_string_contains("message_reference"))
        .and(body_string_contains("hello world"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "id": "M2" })))
        .expect(1)
        .mount(&server)
        .await;
    let c = DiscordConnector::for_guild("tok", "G1", "blueowl", 15, 50).with_base(server.uri());
    c.post_reply("C1", "hello world", "M1").await.unwrap();
    // server.expect(1) verifies exactly one post on drop
}

#[tokio::test]
async fn discover_mentions_keeps_only_bot_mentions() {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path("/guilds/G1/channels"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
            { "id": "C1", "type": 0 }
        ]))).mount(&server).await;
    Mock::given(method("GET")).and(path("/channels/C1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
            { "id": "M1", "content": "<@BOT> comment relancer minerva ?", "mentions": [{ "id": "BOT" }], "author": { "username": "sarah", "bot": false } },
            { "id": "M2", "content": "just chatting", "mentions": [], "author": { "username": "tom", "bot": false } },
            { "id": "M3", "content": "<@BOT> beep", "mentions": [{ "id": "BOT" }], "author": { "username": "weave", "bot": true } }
        ]))).mount(&server).await;
    let c = DiscordConnector::for_guild("tok", "G1", "blueowl", 15, 50).with_base(server.uri());
    let ms = c.discover_mentions("BOT").await.unwrap();
    assert_eq!(ms.len(), 1);              // M2 no-mention + M3 bot-author dropped
    assert_eq!(ms[0].message_id, "M1");
    assert_eq!(ms[0].channel_id, "C1");
    assert!(!ms[0].text.contains("<@BOT>")); // mention token stripped
    assert!(ms[0].text.contains("relancer minerva"));
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cargo test -p weave-ingest -- discord::tests::mentions_bot discord::tests::post_reply discord::tests::discover_mentions`
Expected: FAIL — items not defined.

- [ ] **Step 3: Implement in `discord.rs`**

Add a `post` helper inside `impl DiscordConnector` (beside `get`):

```rust
    async fn post(&self, path: &str, body: serde_json::Value) -> anyhow::Result<serde_json::Value> {
        let v: serde_json::Value = self
            .client
            .post(format!("{}{path}", self.api_base))
            .header("Authorization", format!("Bot {}", self.token))
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(v)
    }

    /// The bot's own user id, needed to detect mentions of itself.
    pub async fn bot_user_id(&self) -> anyhow::Result<String> {
        let v = self.get("/users/@me", &[]).await?;
        v["id"].as_str().map(str::to_string).ok_or_else(|| anyhow::anyhow!("no bot id"))
    }

    /// Post a reply in a channel, threaded to `reply_to_message_id`. Chunks to
    /// Discord's 2000-char cap; the first chunk carries the reply reference.
    pub async fn post_reply(&self, channel_id: &str, text: &str, reply_to_message_id: &str) -> anyhow::Result<()> {
        let chunks = chunk_text(text, 1900);
        for (i, chunk) in chunks.iter().enumerate() {
            let mut body = serde_json::json!({ "content": chunk });
            if i == 0 {
                body["message_reference"] = serde_json::json!({ "message_id": reply_to_message_id });
            }
            self.post(&format!("/channels/{channel_id}/messages"), body).await?;
        }
        Ok(())
    }

    /// Discover unanswered-candidate @mentions of the bot across text channels.
    pub async fn discover_mentions(&self, bot_user_id: &str) -> anyhow::Result<Vec<MentionMsg>> {
        let channels = self.discover_channels().await?;
        let limit = self.max_messages.to_string();
        let mut out = Vec::new();
        for ch in channels {
            match self.get(&format!("/channels/{ch}/messages"), &[("limit", &limit)]).await {
                Ok(msgs) => {
                    let Some(arr) = msgs.as_array() else { continue };
                    for m in arr {
                        if m["author"]["bot"].as_bool() == Some(true) {
                            continue;
                        }
                        let content = m["content"].as_str().unwrap_or("").trim();
                        if content.is_empty() || !mentions_bot(m, bot_user_id) {
                            continue;
                        }
                        let Some(mid) = m["id"].as_str() else { continue };
                        let author = m["author"]["username"].as_str().unwrap_or("unknown").to_string();
                        out.push(MentionMsg {
                            channel_id: ch.clone(),
                            message_id: mid.to_string(),
                            author,
                            text: strip_mention(content, bot_user_id),
                        });
                    }
                }
                Err(e) => tracing::warn!("discord mentions channel {ch} skipped: {e}"),
            }
        }
        Ok(out)
    }
```

Add these free items (near `parse_messages`, module level):

```rust
/// A message that @mentions the bot, awaiting a reply.
#[derive(Debug, Clone)]
pub struct MentionMsg {
    pub channel_id: String,
    pub message_id: String,
    pub author: String,
    pub text: String,
}

/// True when the message mentions `bot_user_id` (via the `mentions` array or an
/// inline `<@id>` / `<@!id>` token).
pub fn mentions_bot(msg: &serde_json::Value, bot_user_id: &str) -> bool {
    if let Some(arr) = msg["mentions"].as_array() {
        if arr.iter().any(|u| u["id"].as_str() == Some(bot_user_id)) {
            return true;
        }
    }
    let c = msg["content"].as_str().unwrap_or("");
    c.contains(&format!("<@{bot_user_id}>")) || c.contains(&format!("<@!{bot_user_id}>"))
}

/// Remove the bot mention tokens from the content, leaving the question text.
fn strip_mention(content: &str, bot_user_id: &str) -> String {
    content
        .replace(&format!("<@{bot_user_id}>"), "")
        .replace(&format!("<@!{bot_user_id}>"), "")
        .trim()
        .to_string()
}

/// Split `text` into chunks no longer than `max` chars (on char boundaries).
fn chunk_text(text: &str, max: usize) -> Vec<String> {
    if text.chars().count() <= max {
        return vec![text.to_string()];
    }
    let mut out = Vec::new();
    let mut cur = String::new();
    for ch in text.chars() {
        if cur.chars().count() >= max {
            out.push(std::mem::take(&mut cur));
        }
        cur.push(ch);
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}
```

- [ ] **Step 4: Register re-exports in `crates/weave-ingest/src/lib.rs`**

Extend the discord `pub use` line to also export the new public items:

```rust
pub use discord::{
    mentions_bot, parse_messages as parse_discord_messages, parse_text_channel_ids,
    DiscordConnector, MentionMsg,
};
```

- [ ] **Step 5: Run tests + build**

Run: `cargo test -p weave-ingest discord && cargo build -p weave-ingest`
Expected: PASS (3 new + existing). If `wiremock`'s `body_string_contains` import path differs, use `wiremock::matchers::body_string_contains` (confirm with `cargo doc`), or match on `path` only and drop the body matchers.

- [ ] **Step 6: Commit**

```bash
git add crates/weave-ingest/src/discord.rs crates/weave-ingest/src/lib.rs
git commit -m "feat(discord): post_reply + mention discovery (write-back primitives)"
```

---

### Task 2: `answered_mentions` ledger (store + migration 0009)

**Files:**
- Create: `migrations/0009_answered_mentions.sql`
- Modify: `crates/weave-store/src/postgres.rs` (add `is_answered` / `mark_answered` to `impl PgStore`)
- Test: `crates/weave-store/tests/postgres_integration.rs` (mirror existing DB test style)

**Interfaces:**
- Produces:
  - `PgStore::is_answered(&self, provider: &str, message_id: &str) -> anyhow::Result<bool>`
  - `PgStore::mark_answered(&self, provider: &str, message_id: &str) -> anyhow::Result<()>`

- [ ] **Step 1: Write the migration**

Create `migrations/0009_answered_mentions.sql`:

```sql
-- Dedup ledger for the @mention responder: a mention we've already replied to
-- is never answered again across poll cycles.
CREATE TABLE IF NOT EXISTS answered_mentions (
    provider    text NOT NULL,
    message_id  text NOT NULL,
    answered_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, message_id)
);
```

- [ ] **Step 2: Write the failing test**

Add to `crates/weave-store/tests/postgres_integration.rs` (use the file's existing store helper — grep for how other tests build `PgStore` + `migrate()`):

```rust
#[tokio::test]
async fn answered_mentions_dedup() {
    let Some(store) = test_store().await else { return }; // match the file's helper
    let mid = format!("M-{}", uuid::Uuid::new_v4());
    assert!(!store.is_answered("discord", &mid).await.unwrap());
    store.mark_answered("discord", &mid).await.unwrap();
    assert!(store.is_answered("discord", &mid).await.unwrap());
    // idempotent — marking twice does not error
    store.mark_answered("discord", &mid).await.unwrap();
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-store answered_mentions_dedup`
Expected: FAIL — methods not defined.

- [ ] **Step 4: Implement in `postgres.rs`**

Add to `impl PgStore` (beside other inherent methods):

```rust
    /// True if this provider message has already been answered.
    pub async fn is_answered(&self, provider: &str, message_id: &str) -> anyhow::Result<bool> {
        let n: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM answered_mentions WHERE provider = $1 AND message_id = $2",
        )
        .bind(provider)
        .bind(message_id)
        .fetch_one(self.pool())
        .await?;
        Ok(n > 0)
    }

    /// Record a mention as answered (idempotent).
    pub async fn mark_answered(&self, provider: &str, message_id: &str) -> anyhow::Result<()> {
        sqlx::query(
            "INSERT INTO answered_mentions (provider, message_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING",
        )
        .bind(provider)
        .bind(message_id)
        .execute(self.pool())
        .await?;
        Ok(())
    }
```

- [ ] **Step 5: Run the test**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-store answered_mentions_dedup`
Expected: PASS (migration `0009` auto-applies via `store.migrate()`).

- [ ] **Step 6: Commit**

```bash
git add migrations/0009_answered_mentions.sql crates/weave-store/src/postgres.rs crates/weave-store/tests/postgres_integration.rs
git commit -m "feat(store): answered_mentions dedup ledger (migration 0009)"
```

---

### Task 3: `Runtime::answer_for_chat` wrapper

**Files:**
- Modify: `crates/weave-pipeline/src/lib.rs` (add `answer_for_chat` to `impl Runtime`)
- Test: inline DB-backed `#[cfg(test)]` in `crates/weave-pipeline/src/lib.rs`

**Interfaces:**
- Consumes: existing `Runtime::answer -> AnswerResult { answer, skill_used, layers }`, private `Runtime::find_specialist(project, task, exclude) -> Option<Agent>`.
- Produces: `Runtime::answer_for_chat(&self, project: &str, question: &str) -> anyhow::Result<(AnswerResult, Option<String>)>`

- [ ] **Step 1: Write the failing test**

Add to `crates/weave-pipeline/src/lib.rs` `#[cfg(test)] mod tests` (reuse the `test_store()` / `ZeroEmbedder` harness added for the canonicalization e2e tests; skip when `TEST_DATABASE_URL` unset):

```rust
#[tokio::test]
async fn answer_for_chat_returns_answer_and_no_agent_when_none() {
    let Some(store) = test_store().await else { return };
    let rt = Runtime::new(
        store.clone(),
        std::sync::Arc::new(weave_llm::HeuristicLlm),
        std::sync::Arc::new(ZeroEmbedder),
        3,
    );
    let project = format!("chat-{}", uuid::Uuid::new_v4());
    let (a, agent) = rt.answer_for_chat(&project, "comment relancer minerva ?").await.unwrap();
    assert!(!a.answer.is_empty());
    assert!(agent.is_none(), "no agents in a fresh project → no routed agent");
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-pipeline answer_for_chat`
Expected: FAIL — method not defined.

- [ ] **Step 3: Implement in `lib.rs`**

Add to `impl Runtime` (beside `answer`):

```rust
    /// Chat-shaped answer: the memory-grounded answer plus the name of the
    /// specialist agent that routes to this question (if any, ≥ ROUTE_MIN_SIMILARITY).
    pub async fn answer_for_chat(
        &self,
        project: &str,
        question: &str,
    ) -> anyhow::Result<(AnswerResult, Option<String>)> {
        let a = self.answer(project, question).await?;
        let agent = self.find_specialist(project, question, "").await?.map(|ag| ag.name);
        Ok((a, agent))
    }
```

- [ ] **Step 4: Run the test**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-pipeline answer_for_chat`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/weave-pipeline/src/lib.rs
git commit -m "feat(pipeline): answer_for_chat — answer + routed specialist name"
```

---

### Task 4: `respond_discord` handler + route + end-to-end flow test

**Files:**
- Modify: `crates/weave-api/src/main.rs` (import `MentionMsg`; add `respond_discord`; register route; add tests)

**Interfaces:**
- Consumes: `DiscordConnector` (+ `bot_user_id`, `discover_mentions`, `post_reply`, `with_base`), `discord_oauth::DiscordConfig`, `state.store.{get_active_connection, is_answered, mark_answered}`, `runtime.answer_for_chat`.
- Produces: `POST /respond/discord`.

- [ ] **Step 1: Write the failing tests**

Add to the `#[cfg(test)] mod tests` in `crates/weave-api/src/main.rs`:

```rust
#[tokio::test]
async fn respond_discord_without_connection_is_not_configured() {
    let Some(app) = test_app().await else { return };
    let resp = app
        .oneshot(Request::builder().method("POST").uri("/respond/discord").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(json_body(resp).await["status"], "not_configured");
}

#[tokio::test]
async fn respond_discord_answers_a_mention_once() {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let Some(app) = test_app().await else { return };

    // A stored discord connection (guild id in team_id).
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = PgPoolOptions::new().max_connections(1).connect(&url).await.unwrap();
    let store = PgStore::from_pool(pool);
    store.migrate().await.unwrap();
    let cipher = weave_store::Cipher::from_base64("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=").unwrap();
    store.upsert_connection(&cipher, &weave_store::NewConnection {
        provider: "discord".into(), team_id: "G1".into(),
        access_token: "unused".into(), refresh_token: None, expires_at: None, scopes: String::new(),
    }).await.unwrap();

    // Mock the Discord API.
    let mock = MockServer::start().await;
    Mock::given(method("GET")).and(path("/users/@me"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "id": "BOT" }))).mount(&mock).await;
    Mock::given(method("GET")).and(path("/guilds/G1/channels"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([{ "id": "C1", "type": 0 }]))).mount(&mock).await;
    Mock::given(method("GET")).and(path("/channels/C1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
            { "id": "M1", "content": "<@BOT> comment relancer minerva ?", "mentions": [{ "id": "BOT" }], "author": { "username": "sarah", "bot": false } }
        ]))).mount(&mock).await;
    Mock::given(method("POST")).and(path("/channels/C1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "id": "M2" })))
        .expect(1) // posted exactly once across BOTH calls below
        .mount(&mock).await;

    std::env::set_var("DISCORD_CLIENT_ID", "cid");
    std::env::set_var("DISCORD_CLIENT_SECRET", "csecret");
    std::env::set_var("DISCORD_BOT_TOKEN", "btok");
    std::env::set_var("DISCORD_API_BASE", mock.uri());

    let call = || app.clone().oneshot(
        Request::builder().method("POST").uri("/respond/discord?project=chatdemo").body(Body::empty()).unwrap()
    );
    let r1 = call().await.unwrap();
    assert_eq!(r1.status(), StatusCode::OK);
    assert_eq!(json_body(r1).await["answered"], 1);
    // Second cycle: already answered → no new post, answered 0.
    let r2 = call().await.unwrap();
    assert_eq!(json_body(r2).await["answered"], 0);
    // mock.expect(1) verifies exactly one POST occurred, on drop.
}
```

> Match the connection-insert helper types to the repo: `weave_store::NewConnection` fields are `provider, team_id, access_token, refresh_token, expires_at, scopes` (confirm via `crates/weave-store/src/connections.rs`). If `PgPoolOptions`/`PgStore`/`Cipher` imports aren't already in the test module, add them as sibling tests do.

- [ ] **Step 2: Run to verify they fail**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-api respond_discord`
Expected: FAIL — route `/respond/discord` returns 404.

- [ ] **Step 3: Add the handler + route**

Add `MentionMsg` to the `weave_ingest` import in `main.rs` (extend the existing `use weave_ingest::{...}`).

Add the handler (beside `ingest_discord`):

```rust
async fn respond_discord(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let project = project_of(&q);

    let Some(conn) = state.store.get_active_connection(&state.cipher, "discord").await? else {
        return Ok(Json(json!({ "status": "not_configured", "hint": "connect Discord first" })));
    };
    let Some(cfg) = discord_oauth::DiscordConfig::from_env() else {
        return Ok(Json(json!({ "status": "not_configured", "hint": "DISCORD_BOT_TOKEN not set" })));
    };

    let max_channels = std::env::var("DISCORD_MAX_CHANNELS").ok().and_then(|v| v.parse().ok()).unwrap_or(15);
    let max_messages = std::env::var("DISCORD_MAX_MESSAGES").ok().and_then(|v| v.parse().ok()).unwrap_or(50);
    let conn_client = DiscordConnector::for_guild(cfg.bot_token, conn.team_id, &project, max_channels, max_messages)
        .with_base(cfg.api_base);

    let bot_id = conn_client.bot_user_id().await?;
    let mentions = conn_client.discover_mentions(&bot_id).await?;

    let mut answered = 0usize;
    for m in mentions {
        if state.store.is_answered("discord", &m.message_id).await? {
            continue;
        }
        let (a, agent) = state.runtime.answer_for_chat(&project, &m.text).await?;
        let reply = match agent {
            Some(name) => format!("{}\n\n↳ via {name}", a.answer),
            None => a.answer,
        };
        match conn_client.post_reply(&m.channel_id, &reply, &m.message_id).await {
            Ok(_) => {
                state.store.mark_answered("discord", &m.message_id).await?;
                answered += 1;
            }
            Err(e) => tracing::warn!("discord reply failed for {}: {e}", m.message_id),
        }
    }
    Ok(Json(json!({ "status": "responded", "answered": answered, "project": project })))
}
```

Register the route beside `/ingest/discord`:

```rust
        .route("/respond/discord", post(respond_discord))
```

- [ ] **Step 4: Run tests + build + clippy**

Run: `TEST_DATABASE_URL=postgres://weave:weave@localhost:5433/weave_test cargo test -p weave-api respond_discord && cargo clippy -p weave-api -p weave-ingest -p weave-store -p weave-pipeline -- -D warnings`
Expected: both `respond_discord` tests PASS; clippy clean. (If the shared DB is dirty and the pre-existing flaky `stats_...` test is in the run, ignore it — it's known DB-isolation debt; scope the test run to `respond_discord` as shown.)

- [ ] **Step 5: Commit**

```bash
git add crates/weave-api/src/main.rs
git commit -m "feat(discord): POST /respond/discord — in-thread @mention answers"
```

---

### Task 5: Env template + rollout docs

**Files:**
- Modify: `.env.example` (note the responder cron + SEND_MESSAGES permission)

- [ ] **Step 1: Document rollout in `.env.example`**

Near the `DISCORD_*` block, add a comment block (no new vars — the responder reuses the existing Discord config):

```bash
# @mention responder: POST /respond/discord (cron every ~2 min) answers @Weave
# mentions in-thread. Requires the bot invited WITH SEND_MESSAGES:
#   https://discord.com/api/oauth2/authorize?client_id=$DISCORD_CLIENT_ID&scope=bot%20applications.commands&permissions=68608
# Cron: */2 * * * * curl -s -X POST -H "authorization: Bearer $WEAVE_API_KEY" \
#   https://strayeye.com/weave-api/respond/discord?project=<PROJECT>
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(discord): document @mention responder cron + SEND_MESSAGES invite"
```

> Prod rollout (manual, not this plan): deploy (Forge pull + `docker compose up -d --build weave-api`; migration 0009 auto-applies); guild owner re-invites the bot with `permissions=68608`; add the cron. Then post `@Weave comment relancer minerva ?` and confirm the in-thread reply + `↳ via reinitialiseur-pipeline`.

---

## Self-Review

**Spec coverage:**
- `post_reply` write + 2000-char chunking → Task 1. ✓
- `mentions_bot` + `discover_mentions` + `bot_user_id` → Task 1. ✓
- `answered_mentions` table + `is_answered`/`mark_answered` + migration 0009 → Task 2. ✓
- `answer_for_chat` (answer + routed agent) → Task 3. ✓
- `respond_discord` handler, mark-after-post, not_configured, route → Task 4. ✓
- Reply format `↳ via {agent}` → Task 4 Step 3. ✓
- Cron + SEND_MESSAGES rollout → Task 5. ✓
- Tests: mention detection, post shape, discover filter (Task 1); dedup (Task 2); answer_for_chat (Task 3); end-to-end respond-once + no-repeat (Task 4). ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. Soft spots (store test helper name in Task 2/4, wiremock body matcher path in Task 1) carry explicit grep-and-adapt instructions. ✓

**Type consistency:** `MentionMsg { channel_id, message_id, author, text }`, `mentions_bot(&Value, &str) -> bool`, `bot_user_id -> Result<String>`, `discover_mentions(&str) -> Result<Vec<MentionMsg>>`, `post_reply(&str,&str,&str) -> Result<()>`, `is_answered/mark_answered(&str,&str)`, `answer_for_chat -> (AnswerResult, Option<String>)` — identical across definition and call sites. `AnswerResult.answer` field matches the real struct. ✓
