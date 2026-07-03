//! Read-only Notion connector. Enumerates pages + databases the integration can
//! access (`/v1/search`), reads page block text and database rows, and maps them
//! to Weave events. Live via an integration token; all payload-mapping is pure
//! and unit-tested offline (no token needed).
//!
//! Setup: create a Notion internal integration, share the target pages/databases
//! with it, set NOTION_TOKEN. Capabilities needed: read content (+ read user
//! info to resolve actor names, optional).

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

/// The title of a page/row: first property whose type is "title".
#[allow(dead_code)]
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

#[allow(dead_code)]
fn actor_of(obj: &serde_json::Value) -> String {
    obj["last_edited_by"]["name"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("notion")
        .to_string()
}

#[allow(dead_code)]
fn ts_of(obj: &serde_json::Value) -> DateTime<Utc> {
    obj["last_edited_time"]
        .as_str()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(Utc::now)
}

/// Map a Notion page (with its already-extracted block text) to an event.
#[allow(dead_code)]
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

/// A compact "Name: value" line for a database property, or None if the type is
/// the row title or unsupported.
#[allow(dead_code)]
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
#[allow(dead_code)]
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
}
