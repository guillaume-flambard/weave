# Discord @Mention Responder — Design

**Date:** 2026-07-05
**Status:** Approved (brainstorming)
**Author:** Guillaume + Claude

## Context

Weave builds org memory from Discord/Slack and lets skills/agents emerge
(ECH-260, shipped). Today that knowledge is **pull-based**: a participant only
benefits by querying Weave's UI (`/ask`). The Discord connector is read-only; the
only write-back is approved agents → Notion.

This adds the first **in-channel response loop**: when a participant `@mentions`
the Weave bot in a Discord channel, Weave replies **in the thread** with a
memory-grounded answer (the same `runtime.answer` that injects the matched
skill + facts), naming the specialist agent when one routes.

## Goal

Participants get org knowledge where they already work — the channel — by
tagging `@Weave`. Reply = `runtime.answer` (skill + facts), with a
`↳ via <agent>` signature when a specialist matches (cosine ≥ 0.35). No agent
orchestration (that stays in `/agents/run`). Never answer the same mention twice.

Non-goals: realtime Gateway/websocket (polling for the first cut); proactive
answering of un-mentioned questions; Slack (Discord first); multi-turn threads.

## Architecture

Extend the read-only Discord connector with a **narrow write** capability plus a
**responder pass**. A new endpoint `POST /respond/discord`, driven by an external
**cron (~1-2 min)**, discovers the guild's text channels, finds recent
`@Weave` mentions not yet answered, calls `runtime.answer`, and posts a reply
referencing the mention message. A small `answered_mentions` table dedups across
poll cycles; a mention is marked answered **only after a successful post**, so a
failed post retries next cycle.

## Components

### 1. Discord write — `crates/weave-ingest/src/discord.rs`

`DiscordConnector::post_reply(&self, channel_id: &str, text: &str, reply_to_message_id: &str) -> anyhow::Result<()>`:
- `POST {api_base}/channels/{channel_id}/messages`, header `Authorization: Bot <token>`,
  JSON `{ "content": <chunk>, "message_reference": { "message_id": reply_to_message_id } }`.
- Discord caps content at 2000 chars → split into ≤1900-char chunks; the first
  chunk carries the `message_reference`, the rest are plain follow-ups.
- Best-effort: returns `Err` on non-2xx (caller decides retry).

`DiscordConnector::bot_user_id(&self) -> anyhow::Result<String>`:
- `GET {api_base}/users/@me` → `id`. The bot must know its own id to detect
  mentions of itself.

### 2. Mention detection — `crates/weave-ingest/src/discord.rs` (pure)

`pub fn mentions_bot(msg: &Value, bot_user_id: &str) -> bool`:
- true when `msg["mentions"]` array contains an object with `id == bot_user_id`,
  OR `msg["content"]` contains `<@{bot_user_id}>` / `<@!{bot_user_id}>`.

`DiscordConnector::discover_mentions(&self, bot_user_id: &str) -> anyhow::Result<Vec<MentionMsg>>`:
- over `discover_channels()`, per channel `GET /channels/{id}/messages?limit=max_messages`,
  keep messages where `author.bot != true`, content non-empty, and
  `mentions_bot(msg, bot_user_id)`. Return `MentionMsg { channel_id, message_id,
  author, text }` (text = content with the `<@id>` mention stripped/trimmed).
- Best-effort per channel (skip 403/429 + log).

### 3. Answered-mentions ledger — store + migration 0009

- `migrations/0009_answered_mentions.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS answered_mentions (
      provider   text NOT NULL,
      message_id text NOT NULL,
      answered_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (provider, message_id)
  );
  ```
- `PgStore::is_answered(provider, message_id) -> anyhow::Result<bool>`
- `PgStore::mark_answered(provider, message_id) -> anyhow::Result<()>`
  (`INSERT ... ON CONFLICT DO NOTHING`).

### 4. Runtime chat wrapper — `crates/weave-pipeline/src/lib.rs`

`runtime.answer` stays unchanged. Add:
`pub async fn answer_for_chat(&self, project: &str, question: &str) -> anyhow::Result<(AnswerResult, Option<String>)>`:
- `let a = self.answer(project, question).await?;`
- `let agent = self.find_specialist(project, question, "").await?.map(|ag| ag.name);`
  (expose the routing that `run_agent` already uses; `find_specialist` returns the
  best ACTIVE agent ≥ `ROUTE_MIN_SIMILARITY` 0.35, else `None`).
- return `(a, agent)`.

### 5. Responder handler — `crates/weave-api/src/main.rs`

`POST /respond/discord` (`respond_discord`), `require_api_key`-guarded:
1. Load `get_active_connection("discord")` → `guild_id = team_id`; else 200
   `{"status":"not_configured"}`.
2. `DiscordConfig::from_env()` → bot token; else 200 `not_configured`.
3. `project = project_of(&q)`.
4. `let conn = DiscordConnector::for_guild(cfg.bot_token, guild_id, &project, caps…)`.
5. `let bot_id = conn.bot_user_id().await?;`
6. `for m in conn.discover_mentions(&bot_id).await?`:
   - `if store.is_answered("discord", &m.message_id).await? { continue }`
   - `let (a, agent) = runtime.answer_for_chat(&project, &m.text).await?;`
   - `let reply = format_reply(&a.answer, &agent);` (append `\n\n↳ via {agent}`
     when `Some`)
   - `match conn.post_reply(&m.channel_id, &reply, &m.message_id).await {
        Ok(_) => store.mark_answered("discord", &m.message_id).await?,
        Err(e) => tracing::warn!("discord reply failed for {}: {e}", m.message_id),
      }` (no mark on failure → retried next cycle)
7. Return `{"status":"responded","answered":n,"project":project}`.

Route registered beside `/ingest/discord`. Reuses the same connection + bot
token (no new secrets).

### 6. Trigger cadence (rollout, not code)

External cron hits `POST /respond/discord?project=<P>` every 1-2 min (VPS crontab
or Forge scheduled job), with the API key header. No in-app scheduler.

### 7. Bot permission (rollout)

The bot was invited with `permissions=66560` (VIEW_CHANNEL | READ_MESSAGE_HISTORY)
— **no SEND_MESSAGES**. To post, re-invite with `permissions=68608`
(`66560 | 2048`); the guild owner re-runs the invite link. Reads keep working
regardless.

## Data flow

cron → `POST /respond/discord?project=P` → discover channels → collect `@Weave`
mentions (unanswered) → per mention: `answer_for_chat` (skill + facts + routed
agent name) → `post_reply` in-thread → `mark_answered`.

## Error handling

- No connection / no `DiscordConfig` → 200 `not_configured` (never a dead-end).
- Per-channel / per-message failure → skip + `tracing::warn!`, continue.
- Post failure (429/5xx) → NOT marked answered → retried next cycle.
- Empty `discover_mentions` → 200 `answered: 0`.
- Bot lacks SEND_MESSAGES → post returns 403 → logged, not marked, surfaces in
  logs until the re-invite grants it.

## Testing

- `mentions_bot` pure: mentions-array hit, `<@id>` / `<@!id>` in content, no-match.
- `post_reply` shape (wiremock): asserts `POST /channels/C1/messages`, `Bot` auth,
  body `content` + `message_reference.message_id`; long text → multiple posts.
- `is_answered` / `mark_answered` (DB, migration 0009): mark then is_answered=true;
  ON CONFLICT idempotent.
- Responder flow (wiremock): channel with one `@Weave` mention → `answer_for_chat`
  (HeuristicLlm) → exactly one `post_reply` → marked; second run → zero posts
  (already answered). A bot-authored mention and a non-mention are ignored.
- `answer_for_chat` (DB, HeuristicLlm): returns the answer; agent name present
  only when a matching ACTIVE agent exists.

## Rollout

1. Deploy (Forge pull + `docker compose up -d --build weave-api`; migration 0009
   auto-applies at boot).
2. Guild owner re-invites the bot with `permissions=68608` (adds SEND_MESSAGES).
3. Add the cron: `*/2 * * * * curl -s -X POST -H "authorization: Bearer $KEY"
   https://strayeye.com/weave-api/respond/discord?project=<P>`.
4. Post `@Weave comment relancer minerva ?` in a channel → confirm an in-thread
   reply with the runbook + `↳ via reinitialiseur-pipeline`.

## Follow-ups (out of scope)

- Realtime Gateway (websocket) for instant replies.
- Slack mention responder (same shape, Slack write API).
- Proactive answering of recurring un-mentioned questions.
- Multi-turn thread context.
