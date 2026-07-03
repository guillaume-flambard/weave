//! Read-only Notion connector. Enumerates pages + databases the integration can
//! access (`/v1/search`), reads page block text and database rows, and maps them
//! to Weave events. Live via an integration token; all payload-mapping is pure
//! and unit-tested offline (no token needed).
//!
//! Setup: create a Notion internal integration, share the target pages/databases
//! with it, set NOTION_TOKEN. Capabilities needed: read content (+ read user
//! info to resolve actor names, optional).

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
