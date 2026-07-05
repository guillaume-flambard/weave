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
}
