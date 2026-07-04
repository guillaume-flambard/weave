//! Write-back of emergent agents into a "Weave Agents" Notion database.
//! Pure helpers build the JSON; network methods live on `NotionWriter`, whose
//! `api_base` is injectable so tests hit a wiremock server, never the real API.

use serde_json::{json, Value};
use weave_core::Agent;

const NOTION_VERSION: &str = "2022-06-28";
const DB_TITLE: &str = "Weave Agents";

/// Notion page `properties` payload for one agent row.
pub fn build_agent_properties(agent: &Agent) -> Value {
    json!({
        "Name":    { "title": [ { "text": { "content": agent.name } } ] },
        "Role":    { "rich_text": [ { "text": { "content": agent.role } } ] },
        "Domain":  { "select": { "name": agent.domain } },
        "Status":  { "select": { "name": agent.status.as_str() } },
        "Skills":  { "multi_select": agent.skills.iter().map(|s| json!({ "name": s })).collect::<Vec<_>>() },
        "Source":  { "rich_text": [ { "text": { "content": agent.derived_from } } ] },
        "WeaveId": { "rich_text": [ { "text": { "content": agent.id.to_string() } } ] },
    })
}

/// Schema for `POST /databases` (property definitions, not values).
pub fn database_schema() -> Value {
    json!({
        "Name":    { "title": {} },
        "Role":    { "rich_text": {} },
        "Domain":  { "select": {} },
        "Status":  { "select": {} },
        "Skills":  { "multi_select": {} },
        "Source":  { "rich_text": {} },
        "WeaveId": { "rich_text": {} },
    })
}

/// First page id from a `/databases/{id}/query` response, if any.
pub fn first_result_id(query_resp: &Value) -> Option<String> {
    query_resp["results"].as_array()?.first()?["id"]
        .as_str()
        .map(str::to_string)
}

/// Result of an upsert: whether the row was newly created or updated in place.
#[derive(Debug, PartialEq, Eq)]
pub enum NotionOutcome {
    Created,
    Updated,
}

/// Writes agents into a "Weave Agents" Notion database. `api_base` is injectable
/// so tests hit a wiremock server instead of the real Notion API.
pub struct NotionWriter {
    client: reqwest::Client,
    token: String,
    api_base: String,
}

impl NotionWriter {
    pub fn new(token: impl Into<String>) -> Self {
        let api_base = std::env::var("NOTION_API_BASE")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "https://api.notion.com/v1".into());
        Self::with_base(token, api_base)
    }

    pub fn with_base(token: impl Into<String>, api_base: impl Into<String>) -> Self {
        NotionWriter {
            client: reqwest::Client::new(),
            token: token.into(),
            api_base: api_base.into(),
        }
    }

    async fn post(&self, path: &str, body: Value) -> anyhow::Result<Value> {
        Ok(self
            .client
            .post(format!("{}{path}", self.api_base))
            .bearer_auth(&self.token)
            .header("Notion-Version", NOTION_VERSION)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }

    async fn patch(&self, path: &str, body: Value) -> anyhow::Result<Value> {
        Ok(self
            .client
            .patch(format!("{}{path}", self.api_base))
            .bearer_auth(&self.token)
            .header("Notion-Version", NOTION_VERSION)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }

    async fn get(&self, path: &str) -> anyhow::Result<Value> {
        Ok(self
            .client
            .get(format!("{}{path}", self.api_base))
            .bearer_auth(&self.token)
            .header("Notion-Version", NOTION_VERSION)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }

    /// Resolve the parent page: `NOTION_PARENT_PAGE_ID`, else the first page from `/search`.
    async fn resolve_parent(&self) -> anyhow::Result<String> {
        if let Ok(id) = std::env::var("NOTION_PARENT_PAGE_ID") {
            if !id.trim().is_empty() {
                return Ok(id);
            }
        }
        let resp = self
            .post(
                "/search",
                json!({ "filter": { "value": "page", "property": "object" }, "page_size": 1 }),
            )
            .await?;
        resp["results"][0]["id"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("no accessible Notion page to host the Weave Agents database"))
    }

    /// Find the "Weave Agents" database or create it under `parent`.
    ///
    /// Looks in the parent page's direct children rather than `/search`: Notion's
    /// search index lags behind creation, so a freshly-made database is invisible
    /// to `/search` for a while — which would spawn duplicate databases on every
    /// write until the index caught up. Listing children is immediately consistent.
    async fn ensure_database(&self, parent: &str) -> anyhow::Result<String> {
        let kids = self
            .get(&format!("/blocks/{parent}/children?page_size=100"))
            .await?;
        if let Some(results) = kids["results"].as_array() {
            for block in results {
                if block["type"] == "child_database"
                    && block["child_database"]["title"].as_str() == Some(DB_TITLE)
                {
                    if let Some(id) = block["id"].as_str() {
                        return Ok(id.to_string());
                    }
                }
            }
        }
        let created = self
            .post(
                "/databases",
                json!({
                    "parent": { "type": "page_id", "page_id": parent },
                    "title": [ { "type": "text", "text": { "content": DB_TITLE } } ],
                    "properties": database_schema(),
                }),
            )
            .await?;
        created["id"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("notion returned no database id"))
    }

    /// Idempotently upsert `agent` as a row keyed by `WeaveId`.
    pub async fn upsert_agent(&self, agent: &Agent) -> anyhow::Result<NotionOutcome> {
        let parent = self.resolve_parent().await?;
        let db_id = self.ensure_database(&parent).await?;
        let props = build_agent_properties(agent);

        let query = self
            .post(
                &format!("/databases/{db_id}/query"),
                json!({
                    "filter": { "property": "WeaveId", "rich_text": { "equals": agent.id.to_string() } },
                    "page_size": 1
                }),
            )
            .await?;

        if let Some(page_id) = first_result_id(&query) {
            self.patch(&format!("/pages/{page_id}"), json!({ "properties": props }))
                .await?;
            Ok(NotionOutcome::Updated)
        } else {
            self.post(
                "/pages",
                json!({
                    "parent": { "type": "database_id", "database_id": db_id },
                    "properties": props
                }),
            )
            .await?;
            Ok(NotionOutcome::Created)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;
    use weave_core::{Agent, AgentStatus, MemoryLevel};
    use wiremock::matchers::{method, path, path_regex};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn sample_agent() -> Agent {
        Agent {
            id: Uuid::nil(),
            project: "pennylane".into(),
            team: "data".into(),
            name: "reconciliation-helper".into(),
            role: "Aide à la réconciliation bancaire".into(),
            domain: "finance-ops".into(),
            skills: vec!["match-tx".into(), "flag-anomaly".into()],
            scope: MemoryLevel::Team,
            status: AgentStatus::Active,
            derived_from: "3 patterns in #data".into(),
            created_at: Utc::now(),
        }
    }

    #[test]
    fn properties_map_agent_fields() {
        let p = build_agent_properties(&sample_agent());
        assert_eq!(p["Name"]["title"][0]["text"]["content"], "reconciliation-helper");
        assert_eq!(p["Domain"]["select"]["name"], "finance-ops");
        assert_eq!(p["Status"]["select"]["name"], "active");
        assert_eq!(p["Skills"]["multi_select"][1]["name"], "flag-anomaly");
        assert_eq!(p["WeaveId"]["rich_text"][0]["text"]["content"], Uuid::nil().to_string());
    }

    #[test]
    fn schema_has_weave_id_and_title() {
        let s = database_schema();
        assert!(s["Name"]["title"].is_object());
        assert!(s["WeaveId"]["rich_text"].is_object());
    }

    #[test]
    fn first_result_id_extracts_or_none() {
        assert_eq!(
            first_result_id(&json!({ "results": [ { "id": "page-1" } ] })),
            Some("page-1".to_string())
        );
        assert_eq!(first_result_id(&json!({ "results": [] })), None);
    }

    #[tokio::test]
    async fn upsert_creates_when_absent() {
        let server = MockServer::start().await;
        // resolve_parent → /search returns a page
        Mock::given(method("POST")).and(path("/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "results": [ { "id": "parent-page", "object": "page" } ]
            })))
            .mount(&server).await;
        // ensure_database → parent has no child databases yet
        Mock::given(method("GET")).and(path_regex(r"^/blocks/.+/children$"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "results": [] })))
            .mount(&server).await;
        Mock::given(method("POST")).and(path("/databases"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "db-1" })))
            .mount(&server).await;
        Mock::given(method("POST")).and(path_regex(r"^/databases/.+/query$"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "results": [] })))
            .mount(&server).await;
        Mock::given(method("POST")).and(path("/pages"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "page-new" })))
            .mount(&server).await;

        std::env::remove_var("NOTION_PARENT_PAGE_ID");
        let w = NotionWriter::with_base("tok", server.uri());
        let out = w.upsert_agent(&sample_agent()).await.unwrap();
        assert_eq!(out, NotionOutcome::Created);
    }

    #[tokio::test]
    async fn upsert_updates_when_present() {
        let server = MockServer::start().await;
        // ensure_database → parent already has the "Weave Agents" child database
        Mock::given(method("GET")).and(path_regex(r"^/blocks/.+/children$"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "results": [ { "id": "db-1", "type": "child_database",
                    "child_database": { "title": "Weave Agents" } } ]
            })))
            .mount(&server).await;
        Mock::given(method("POST")).and(path_regex(r"^/databases/.+/query$"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "results": [ { "id": "row-1" } ] })))
            .mount(&server).await;
        Mock::given(method("PATCH")).and(path_regex(r"^/pages/.+$"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "row-1" })))
            .mount(&server).await;

        std::env::set_var("NOTION_PARENT_PAGE_ID", "parent-page");
        let w = NotionWriter::with_base("tok", server.uri());
        let out = w.upsert_agent(&sample_agent()).await.unwrap();
        assert_eq!(out, NotionOutcome::Updated);
        std::env::remove_var("NOTION_PARENT_PAGE_ID");
    }
}
