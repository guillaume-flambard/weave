//! Read-only Slack connector. Pulls `conversations.history` from one channel and
//! maps messages to Weave events. Live via a bot token; the pure `parse_history`
//! function is unit-tested offline against a sample payload (no token needed).
//!
//! Scopes needed on the Slack app (read-only): `channels:history`,
//! `groups:history`, `users:read`.

use crate::Connector;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use uuid::Uuid;
use weave_core::Event;

pub struct SlackConnector {
    client: reqwest::Client,
    token: String,
    channel: String,
    project: String,
    limit: u32,
}

impl SlackConnector {
    pub fn new(token: impl Into<String>, channel: impl Into<String>, project: impl Into<String>) -> Self {
        SlackConnector {
            client: reqwest::Client::new(),
            token: token.into(),
            channel: channel.into(),
            project: project.into(),
            limit: 200,
        }
    }

    async fn get(&self, method: &str, query: &[(&str, &str)]) -> anyhow::Result<serde_json::Value> {
        let v: serde_json::Value = self
            .client
            .get(format!("https://slack.com/api/{method}"))
            .bearer_auth(&self.token)
            .query(query)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        if v["ok"].as_bool() != Some(true) {
            anyhow::bail!("slack {method} error: {}", v["error"]);
        }
        Ok(v)
    }

    /// Fetch a `user_id -> display name` map so events carry human actors.
    async fn user_map(&self) -> anyhow::Result<HashMap<String, String>> {
        let v = self.get("users.list", &[]).await?;
        let mut map = HashMap::new();
        if let Some(members) = v["members"].as_array() {
            for m in members {
                if let Some(id) = m["id"].as_str() {
                    let name = m["profile"]["display_name"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .or_else(|| m["real_name"].as_str())
                        .or_else(|| m["name"].as_str())
                        .unwrap_or(id);
                    map.insert(id.to_string(), name.to_string());
                }
            }
        }
        Ok(map)
    }
}

#[async_trait]
impl Connector for SlackConnector {
    fn source(&self) -> &str {
        "slack"
    }

    async fn poll(&self) -> anyhow::Result<Vec<Event>> {
        let users = self.user_map().await.unwrap_or_default();
        let limit = self.limit.to_string();
        let history = self
            .get("conversations.history", &[("channel", &self.channel), ("limit", &limit)])
            .await?;
        Ok(parse_history(&history, &self.project, &users))
    }
}

/// Convert a Slack `ts` string ("1700000000.000100") to a UTC datetime.
fn ts_to_datetime(ts: &str) -> DateTime<Utc> {
    let secs = ts.split('.').next().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
    DateTime::from_timestamp(secs, 0).unwrap_or_else(Utc::now)
}

/// Pure mapper from a `conversations.history` response to events. Unit-tested.
pub fn parse_history(
    resp: &serde_json::Value,
    project: &str,
    users: &HashMap<String, String>,
) -> Vec<Event> {
    let mut out = Vec::new();
    let Some(messages) = resp["messages"].as_array() else {
        return out;
    };
    for m in messages {
        // Only real user messages (skip joins, bot noise, edits without text).
        if m["type"].as_str() != Some("message") || m.get("subtype").is_some() {
            continue;
        }
        let text = m["text"].as_str().unwrap_or("").trim();
        if text.is_empty() {
            continue;
        }
        let user_id = m["user"].as_str().unwrap_or("unknown");
        let actor = users.get(user_id).cloned().unwrap_or_else(|| user_id.to_string());
        let ts = m["ts"].as_str().unwrap_or("0");

        let mut payload = serde_json::json!({ "text": text, "slack_user": user_id, "slack_ts": ts });
        // A thread reply is the prod analog of our "topic" hint: replies in the
        // same thread share a signature anchor.
        if let Some(thread) = m["thread_ts"].as_str() {
            payload["topic"] = serde_json::Value::String(format!("thread:{thread}"));
            payload["reply_to"] = serde_json::Value::String(thread.to_string());
        }

        out.push(Event {
            id: Uuid::new_v4(),
            source: "slack".into(),
            ts: ts_to_datetime(ts),
            actor,
            project: project.to_string(),
            kind: "message".into(),
            payload,
            confidence: 1.0,
        });
    }
    // Slack returns newest-first; ingest oldest-first.
    out.reverse();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_history_and_resolves_users() {
        let resp = serde_json::json!({
            "ok": true,
            "messages": [
                { "type": "message", "user": "U1", "text": "Comment relancer la synchro bancaire ?", "ts": "1700000002.000100" },
                { "type": "message", "subtype": "channel_join", "user": "U2", "text": "joined", "ts": "1700000001.000000" },
                { "type": "message", "user": "U2", "text": "BankSync.rerun(client_id)", "ts": "1700000000.000000", "thread_ts": "1700000002.000100" }
            ]
        });
        let mut users = HashMap::new();
        users.insert("U1".to_string(), "sarah".to_string());
        users.insert("U2".to_string(), "nicolas".to_string());

        let events = parse_history(&resp, "pennylane", &users);
        assert_eq!(events.len(), 2); // channel_join skipped
        // Oldest first after reverse: the threaded reply (ts ...000) comes first.
        assert_eq!(events[0].actor, "nicolas");
        assert_eq!(events[0].payload["reply_to"], "1700000002.000100");
        assert_eq!(events[1].actor, "sarah");
        assert!(events[1].text().contains("synchro"));
    }
}
