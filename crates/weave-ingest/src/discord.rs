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
        let Some(ts) = m["timestamp"]
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.with_timezone(&Utc))
        else {
            tracing::warn!("discord channel {channel}: message with missing/malformed timestamp skipped");
            continue;
        };
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
    fn parse_messages_drops_malformed_timestamp() {
        let resp = serde_json::json!([
            { "content": "newer", "author": { "username": "pylon", "bot": false }, "timestamp": "2026-07-05T10:11:00.000000+00:00" },
            { "content": "garbage ts", "author": { "username": "zoanlogia", "bot": false }, "timestamp": "not-a-date" },
            { "content": "older", "author": { "username": "sarah", "bot": false }, "timestamp": "2026-07-05T10:08:00.000000+00:00" }
        ]);
        let events = parse_messages(&resp, "web-general", "blueowl");
        assert_eq!(events.len(), 2); // garbage-timestamp message dropped
        assert!(events.iter().all(|e| e.text() != "garbage ts"));
        // remaining events still ordered oldest-first
        assert_eq!(events[0].actor, "sarah");
        assert!(events[0].text().contains("older"));
        assert_eq!(events[1].actor, "pylon");
        assert!(events[1].text().contains("newer"));
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

    #[tokio::test]
    async fn poll_all_uses_bot_token_header_not_oauth() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;
        // Both mocks only match when the exact bot-token header is present, proving
        // the connector authenticates reads with the env bot token, not an OAuth token.
        Mock::given(method("GET"))
            .and(path("/guilds/G1/channels"))
            .and(header("authorization", "Bot testtoken"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!([{ "id": "C1", "type": 0 }])),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/channels/C1/messages"))
            .and(header("authorization", "Bot testtoken"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
                { "content": "hi", "author": { "username": "u", "bot": false }, "timestamp": "2026-07-05T10:00:00.000000+00:00" }
            ])))
            .mount(&server)
            .await;

        let c = DiscordConnector::for_guild("testtoken", "G1", "blueowl", 15, 50).with_base(server.uri());
        let events = c.poll_all().await.unwrap();
        assert_eq!(events.len(), 1);
    }

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
}
