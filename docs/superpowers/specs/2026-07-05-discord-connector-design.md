# Discord Connector — Design

**Date:** 2026-07-05
**Status:** Approved (brainstorming)
**Author:** Guillaume + Claude

## Context

Weave ingests organizational activity into events → facts → patterns → skills →
emergent agents. Today's live connectors: Slack (user-token OAuth, multi-channel)
and Notion (public OAuth + write-back). This spec adds **Discord** as the third
ingest source, and is the **template** for a connector family also covering
GitHub, Linear, and an Obsidian/markdown vault reader (each its own later spec).

Immediate driver: Guillaume + Michael collaborate on Discord (Blue Owl,
phangan.ai guilds). Constraint: PennyLane may adopt Weave, so the design must be
**multi-tenant, robust, clean** — not a single hardcoded bot token.

## Goal

A read-only Discord connector that, per tenant, discovers a guild's text
channels and maps recent messages to Weave `Event`s, feeding the existing
pipeline. Onboarding via a "Connect Discord" button matching the Slack/Notion UX.

Non-goals: write-back to Discord, realtime gateway/websocket, voice, threads
beyond top-level channel history, slash commands.

## Architecture

**Model — OAuth bot-install + one Weave-owned bot.** Weave owns a single Discord
application (`client_id` / `client_secret` / `bot_token`). Each tenant clicks
**Connect Discord** → Discord "Add to Server" OAuth → picks their guild →
authorizes. Weave stores that **`guild_id`** as the tenant's connection. Weave
reads message history with its single **bot token** (Message Content Intent
enabled). The bot token is a global app secret (env); `guild_id` is per-tenant
and non-secret.

Why this over alternatives: OAuth-user-token alone cannot read channel history
(Discord requires a bot in-guild with `READ_MESSAGE_HISTORY`); a single hardcoded
bot token is not tenant-safe. Bot-install OAuth gives both a clean per-tenant
onboarding and correct read scope.

### Storage — no migration

The existing `connections` table already fits:
- `team_id` ← **`guild_id`** (per-tenant identifier)
- `provider` = `"discord"`
- `access_token` ← the OAuth token Discord returns on install (encrypted;
  stored for completeness, not used for reads)
- `scopes` ← granted scopes string

Message reads use the **global bot token from env**, not the stored token.
`get_active_connection("discord")` yields the guild_id via `team_id`.

## Components

### 1. `crates/weave-api/src/discord_oauth.rs` (mirror `notion_oauth.rs`)

- `authorize` → 302 to
  `https://discord.com/oauth2/authorize?client_id=…&scope=bot+applications.commands&permissions=<VIEW_CHANNEL|READ_MESSAGE_HISTORY>&response_type=code&redirect_uri=…&state=<hmac>`
- `callback` → exchange `code` at `https://discord.com/api/oauth2/token`
  (Basic `client_id:client_secret`, `grant_type=authorization_code`). Response
  carries the installed `guild` object → persist `provider="discord"`,
  `team_id=guild.id`. Constant-time `state` verify (reuse Slack helper).
- Not-configured (`DiscordConfig` absent) → `web_redirect(connect_error=discord)`
  — no dead-end (Slack/Notion pattern).

`DiscordConfig { client_id, client_secret, bot_token }` loaded from env; absent =
feature disabled.

### 2. `crates/weave-ingest/src/discord.rs` (mirror `slack.rs`)

`DiscordConnector::for_guild(bot_token, guild_id, project, max_channels, max_messages)`:

- `discover_channels` → `GET /guilds/{guild_id}/channels`; keep `type == 0`
  (GUILD_TEXT); cap `max_channels` (default 15).
- `poll_all` → per channel `GET /channels/{id}/messages?limit={max_messages}`
  (default 50); best-effort per channel (skip forbidden / 429, log); flatten.
- Pure `parse_messages(resp: &Value, channel: &str, project: &str) -> Vec<Event>`
  — unit-testable offline. Mapping:
  - `source` = `"discord"`
  - `ts` = message `timestamp` (ISO 8601, parse directly — no snowflake decode)
  - `actor` = `author.username`
  - `kind` = `"message"`
  - `payload` = `{ "text": content, "channel": channel }`
  - skip bot authors (`author.bot == true`) and empty content
- Header `Authorization: Bot <token>`. `api_base` injectable (`with_base`) for
  wiremock. Caps mirror Slack.

### 3. `crates/weave-api/src/main.rs` — `ingest_discord` (mirror `ingest_slack`)

Load `get_active_connection("discord")` → `guild_id = team_id`; read bot token
from `DiscordConfig` → `DiscordConnector::for_guild(...)` → `poll_all` → insert
events → run pipeline. Route `POST /ingest/discord`. `require_api_key` guarded.

### 4. Web — reuse `ConnectorSetupBlock`

Component is already provider-generic (Connect / Sync / Disconnect, live status,
flash). Add `"discord"` provider entry: Connect → `authorizeUrl("discord")`,
Sync → `ingestDiscord`, Disconnect → existing `disconnectProvider("discord")`.
`lib/api.ts` gains `ingestDiscord`. EN/FR labels added.

## Data flow

Connect Discord (web) → `discord_oauth::authorize` → Discord consent → `callback`
→ upsert connection (guild_id). Sync → `POST /ingest/discord` → discover channels
→ poll messages (bot token) → `parse_messages` → `Event`s → `insert_events` →
pipeline (facts → skills → agents).

## Error handling

- Missing `DiscordConfig` → redirect `connect_error=discord`, never a dead-end.
- Per-channel forbidden / `403` → skip that channel, continue (best-effort).
- Rate limit `429` → skip channel, log `retry_after` (no backoff loop in MVP).
- Empty guild / zero messages → 200 with `events: 0` (not an error; matches
  Slack's empty-workspace behavior).
- `state` mismatch on callback → reject (constant-time compare).

## Testing

- `parse_messages` offline against a sample Discord `messages` payload
  (bot-author + empty-content skipped, ISO timestamp parsed, actor/text mapped).
- `discover_channels` filter: only `type == 0` kept, cap respected (pure over a
  sample `/guilds/{id}/channels` payload).
- wiremock live test: mount `/guilds/{id}/channels` + `/channels/{id}/messages`,
  assert `poll_all` flattens and maps.
- OAuth `state` constant-time verify test (reuse Slack helper coverage).
- Best-effort: one channel returns 403 → its messages absent, others present.

## Rollout

1. Register Weave Discord app; enable **Message Content Intent**; set redirect URI.
2. Env on prod (`ovh-echo` / Forge, `docker-compose.prod.yml`):
   `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`.
3. Invite bot to Blue Owl / phangan.ai; Connect via web; Sync; verify events.

Does not touch other providers or the echotravel DB (isolated stack).

## Follow-ups (out of scope)

- GitHub / Linear / Vault connectors (same port, later specs).
- Thread history, reactions-as-signal, gateway realtime.
- Per-tenant channel allow-list UI (currently auto-discover, capped).
