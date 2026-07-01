//! Weave HTTP surface: REST + SSE live feed + a minimal MCP endpoint so external
//! agents (e.g. Claude) can query the shared memory over the Model Context Protocol.

use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::{Stream, StreamExt};
use tower_http::cors::{Any, CorsLayer};

use weave_ingest::{
    generate_events, preset_by_org, presets, seed_events, Connector, SlackConnector,
};
use weave_llm::{
    ClaudeLlm, EmbeddingGateway, HashEmbedder, HeuristicLlm, LlmGateway, OllamaEmbedder, OllamaLlm,
};
use weave_pipeline::Runtime;
use weave_store::{PgStore, Store};

const DEFAULT_PROJECT: &str = "pennylane";

#[derive(Clone)]
struct AppState {
    runtime: Arc<Runtime>,
    store: Arc<PgStore>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,weave_api=info".into()),
        )
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://weave:weave@localhost:5433/weave".into());
    let addr = std::env::var("WEAVE_API_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let threshold: i32 = std::env::var("WEAVE_SKILL_THRESHOLD")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(5);

    // Storage: one Postgres behind all ports.
    let store = Arc::new(PgStore::connect(&database_url).await?);
    store.migrate().await?;
    let dyn_store: Arc<dyn Store> = store.clone();

    // LLM gateway — multi-provider, pluggable. Default: Ollama (local, no key).
    // WEAVE_LLM_PROVIDER = ollama | claude | heuristic | auto
    let provider = std::env::var("WEAVE_LLM_PROVIDER").unwrap_or_else(|_| "ollama".into());
    let anthropic_key = std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|k| !k.trim().is_empty());
    let llm: Arc<dyn LlmGateway> = match provider.as_str() {
        "claude" => match anthropic_key {
            Some(key) => Arc::new(ClaudeLlm::new(key, llm_model())),
            None => {
                tracing::warn!("provider=claude but ANTHROPIC_API_KEY unset; using heuristic");
                Arc::new(HeuristicLlm::new())
            }
        },
        "heuristic" => Arc::new(HeuristicLlm::new()),
        "auto" => match anthropic_key {
            Some(key) => Arc::new(ClaudeLlm::new(key, llm_model())),
            None => Arc::new(OllamaLlm::new(ollama_url(), ollama_model())),
        },
        _ => Arc::new(OllamaLlm::new(ollama_url(), ollama_model())),
    };
    // Embeddings — real semantic (Ollama nomic) by default, hash fallback.
    // WEAVE_EMBED_PROVIDER = ollama | hash
    let embedder: Arc<dyn EmbeddingGateway> =
        match std::env::var("WEAVE_EMBED_PROVIDER").unwrap_or_else(|_| "ollama".into()).as_str() {
            "hash" => Arc::new(HashEmbedder::new()),
            _ => Arc::new(OllamaEmbedder::new(ollama_url(), embed_model())),
        };

    let runtime = Arc::new(Runtime::new(dyn_store, llm, embedder, threshold));
    tracing::info!("LLM gateway: {}", runtime.llm_name());
    runtime.seed_predefined_agents(DEFAULT_PROJECT).await?;

    let state = AppState { runtime, store };

    let app = Router::new()
        .route("/health", get(health))
        .route("/replay", post(replay))
        .route("/ingest/slack", post(ingest_slack))
        .route("/reset", post(reset))
        .route("/org", get(get_org).put(put_org))
        .route("/org/presets", get(get_presets))
        .route("/org/load", post(load_org))
        .route("/simulate", post(simulate))
        .route("/inject", post(inject))
        .route("/events", get(sse_events))
        .route("/stats", get(get_stats))
        .route("/facts", get(get_facts))
        .route("/skills", get(get_skills))
        .route("/graph", get(get_graph))
        .route("/ask", post(ask))
        .route("/agents", get(get_agents))
        .route("/agents/approve", post(approve_agent))
        .route("/agents/run", post(run_agent))
        .route("/mcp", post(mcp))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Weave API listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

fn llm_model() -> String {
    std::env::var("WEAVE_LLM_MODEL").unwrap_or_else(|_| "claude-opus-4-8".into())
}
fn ollama_url() -> String {
    std::env::var("WEAVE_OLLAMA_URL").unwrap_or_else(|_| "http://localhost:11434".into())
}
fn ollama_model() -> String {
    std::env::var("WEAVE_OLLAMA_MODEL").unwrap_or_else(|_| "qwen3.5:9b".into())
}
fn embed_model() -> String {
    std::env::var("WEAVE_EMBED_MODEL").unwrap_or_else(|_| "nomic-embed-text".into())
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({ "status": "ok", "service": "weave", "llm": state.runtime.llm_name() }))
}

#[derive(Deserialize)]
struct ProjectQ {
    project: Option<String>,
}

fn project_of(q: &ProjectQ) -> String {
    q.project.clone().unwrap_or_else(|| DEFAULT_PROJECT.into())
}

/// Kick off a live replay of the seed stream in the background.
async fn replay(State(state): State<AppState>) -> Json<Value> {
    let runtime = state.runtime.clone();
    tokio::spawn(async move {
        for event in seed_events() {
            if let Err(e) = runtime.ingest(&event).await {
                tracing::error!("ingest failed: {e}");
            }
            tokio::time::sleep(Duration::from_millis(750)).await;
        }
        tracing::info!("replay complete");
    });
    Json(json!({ "status": "replaying" }))
}

// --- Sandbox: bring-your-own-org ---

/// Current org config for a tenant (stored, else the matching preset).
async fn get_org(
    State(state): State<AppState>,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    use weave_store::OrgStore;
    let org = project_of(&q);
    if let Some(cfg) = state.store.get_org_config(&org).await? {
        return Ok(Json(cfg));
    }
    match preset_by_org(&org) {
        Some(p) => Ok(Json(json!(p))),
        None => Ok(Json(json!({ "org": org, "name": org, "teams": [] }))),
    }
}

async fn get_presets() -> Json<Value> {
    Json(json!(presets()))
}

#[derive(Deserialize)]
struct LoadReq {
    org: String,
}

/// Load a preset as the active org: store its config, wipe old data, seed agents.
async fn load_org(
    State(state): State<AppState>,
    Json(req): Json<LoadReq>,
) -> Result<Json<Value>, AppError> {
    use weave_store::OrgStore;
    let cfg = preset_by_org(&req.org)
        .ok_or_else(|| anyhow::anyhow!("unknown preset: {}", req.org))?;
    let value = json!(cfg);
    state.store.save_org_config(&req.org, &value).await?;
    state.store.reset(&req.org).await?;
    state.runtime.seed_predefined_agents(&req.org).await?;
    Ok(Json(value))
}

/// Save an edited org config.
async fn put_org(
    State(state): State<AppState>,
    Json(cfg): Json<Value>,
) -> Result<Json<Value>, AppError> {
    use weave_store::OrgStore;
    let org = cfg.get("org").and_then(Value::as_str).unwrap_or(DEFAULT_PROJECT).to_string();
    state.store.save_org_config(&org, &cfg).await?;
    Ok(Json(json!({ "status": "saved", "org": org })))
}

#[derive(Deserialize)]
struct SimReq {
    project: Option<String>,
}

/// Generate and live-ingest the org's activity stream (the "everyone is using AI"
/// simulation). Uses the stored config, else the preset.
async fn simulate(
    State(state): State<AppState>,
    Json(req): Json<SimReq>,
) -> Result<Json<Value>, AppError> {
    use weave_core::OrgConfig;
    use weave_store::OrgStore;
    let org = req.project.unwrap_or_else(|| DEFAULT_PROJECT.into());
    let cfg: OrgConfig = match state.store.get_org_config(&org).await? {
        Some(v) => serde_json::from_value(v)?,
        None => preset_by_org(&org).ok_or_else(|| anyhow::anyhow!("no org config for {org}"))?,
    };
    let events = generate_events(&cfg);
    let n = events.len();
    let runtime = state.runtime.clone();
    tokio::spawn(async move {
        for event in events {
            if let Err(e) = runtime.ingest(&event).await {
                tracing::error!("simulate ingest failed: {e}");
            }
            tokio::time::sleep(Duration::from_millis(180)).await;
        }
        tracing::info!("simulation complete ({n} events)");
    });
    Ok(Json(json!({ "status": "simulating", "events": n })))
}

#[derive(Deserialize)]
struct InjectReq {
    project: Option<String>,
    team: Option<String>,
    workstream: Option<String>,
    actor: Option<String>,
    text: String,
    #[serde(default)]
    topic: Option<String>,
}

/// Manually inject one message (the tester types as a team member).
async fn inject(
    State(state): State<AppState>,
    Json(req): Json<InjectReq>,
) -> Result<Json<Value>, AppError> {
    let org = req.project.unwrap_or_else(|| DEFAULT_PROJECT.into());
    let mut payload = json!({
        "text": req.text,
        "team": req.team.unwrap_or_default(),
        "workstream": req.workstream.unwrap_or_default(),
    });
    if let Some(t) = req.topic {
        payload["topic"] = json!(t);
    }
    let event = weave_core::Event {
        id: uuid::Uuid::new_v4(),
        source: "manual".into(),
        ts: chrono::Utc::now(),
        actor: req.actor.unwrap_or_else(|| "vous".into()),
        project: org,
        kind: "message".into(),
        payload,
        confidence: 1.0,
    };
    state.runtime.ingest(&event).await?;
    Ok(Json(json!({ "status": "injected" })))
}

/// Pull a Slack channel (read-only) and ingest it through the same pipeline.
/// Configured via SLACK_BOT_TOKEN + SLACK_CHANNEL. This is the Phase 0 "real on a
/// wire" path: same emergence, but on real messages.
async fn ingest_slack(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let token = std::env::var("SLACK_BOT_TOKEN").ok().filter(|t| !t.trim().is_empty());
    let channel = std::env::var("SLACK_CHANNEL").ok().filter(|c| !c.trim().is_empty());
    let (Some(token), Some(channel)) = (token, channel) else {
        return Ok(Json(json!({
            "status": "not_configured",
            "hint": "set SLACK_BOT_TOKEN and SLACK_CHANNEL (scopes: channels:history, users:read)"
        })));
    };

    let connector = SlackConnector::new(token, channel, DEFAULT_PROJECT);
    let events = connector.poll().await?; // surface auth/permission errors now
    let n = events.len();
    let runtime = state.runtime.clone();
    tokio::spawn(async move {
        for event in events {
            if let Err(e) = runtime.ingest(&event).await {
                tracing::error!("slack ingest failed: {e}");
            }
        }
        tracing::info!("slack ingest complete ({n} events)");
    });
    Ok(Json(json!({ "status": "ingesting", "source": "slack", "events": n })))
}

/// Wipe the demo project so a replay can be rehearsed from scratch.
async fn reset(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    state.store.reset(DEFAULT_PROJECT).await?;
    state.runtime.seed_predefined_agents(DEFAULT_PROJECT).await?;
    Ok(Json(json!({ "status": "reset" })))
}

/// SSE live feed of pipeline events.
async fn sse_events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<SseEvent, Infallible>>> {
    let rx = state.runtime.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|msg| match msg {
        Ok(ev) => Some(Ok(SseEvent::default().json_data(ev).unwrap_or_default())),
        Err(_) => None, // lagged; skip
    });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

async fn get_stats(
    State(state): State<AppState>,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    use weave_store::{AgentStore, EventStore, FactStore, GraphStore, SkillStore};
    let p = project_of(&q);
    Ok(Json(json!({
        "events": state.store.count_events(&p).await?,
        "facts": state.store.recent_facts(&p, 10000).await?.len(),
        "entities": state.store.entities(&p).await?.len(),
        "relationships": state.store.relationships(&p).await?.len(),
        "skills": state.store.skills(&p).await?.into_iter().map(|s| s.name).collect::<Vec<_>>(),
        "agents": state.store.agents(&p).await?.into_iter().map(|a| json!({"name": a.name, "status": a.status})).collect::<Vec<_>>(),
        "llm": state.runtime.llm_name(),
    })))
}

async fn get_facts(
    State(state): State<AppState>,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    use weave_store::FactStore;
    let facts = state.store.recent_facts(&project_of(&q), 100).await?;
    Ok(Json(json!(facts)))
}

async fn get_skills(
    State(state): State<AppState>,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    use weave_store::SkillStore;
    let skills = state.store.skills(&project_of(&q)).await?;
    Ok(Json(json!(skills)))
}

async fn get_graph(
    State(state): State<AppState>,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    use weave_store::GraphStore;
    let project = project_of(&q);
    let entities = state.store.entities(&project).await?;
    let relationships = state.store.relationships(&project).await?;
    Ok(Json(json!({ "entities": entities, "relationships": relationships })))
}

#[derive(Deserialize)]
struct AskReq {
    project: Option<String>,
    question: String,
}

async fn ask(
    State(state): State<AppState>,
    Json(req): Json<AskReq>,
) -> Result<Json<Value>, AppError> {
    let project = req.project.unwrap_or_else(|| DEFAULT_PROJECT.into());
    let result = state.runtime.answer(&project, &req.question).await?;
    Ok(Json(json!(result)))
}

async fn get_agents(
    State(state): State<AppState>,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    use weave_store::AgentStore;
    let agents = state.store.agents(&project_of(&q)).await?;
    Ok(Json(json!(agents)))
}

#[derive(Deserialize)]
struct ApproveReq {
    name: String,
}

/// Human-in-the-loop governance: activate an emergent (pending) agent.
async fn approve_agent(
    State(state): State<AppState>,
    Json(req): Json<ApproveReq>,
) -> Result<Json<Value>, AppError> {
    use weave_core::AgentStatus;
    use weave_store::AgentStore;
    state
        .store
        .set_agent_status(DEFAULT_PROJECT, &req.name, AgentStatus::Active)
        .await?;
    Ok(Json(json!({ "status": "active", "name": req.name })))
}

#[derive(Deserialize)]
struct RunReq {
    project: Option<String>,
    agent: Option<String>,
    task: String,
}

async fn run_agent(
    State(state): State<AppState>,
    Json(req): Json<RunReq>,
) -> Result<Json<Value>, AppError> {
    let project = req.project.unwrap_or_else(|| DEFAULT_PROJECT.into());
    let agent = req.agent.unwrap_or_else(|| "assistant".into());
    let run = state.runtime.run_agent(&project, &agent, &req.task).await?;
    Ok(Json(json!(run)))
}

// --- Minimal MCP (JSON-RPC 2.0) endpoint ---

fn rpc_ok(id: Value, result: Value) -> Json<Value> {
    Json(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

fn rpc_err(id: Value, code: i32, message: &str) -> Json<Value> {
    Json(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }))
}

async fn mcp(State(state): State<AppState>, Json(req): Json<Value>) -> Json<Value> {
    let id = req.get("id").cloned().unwrap_or(Value::Null);
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");

    match method {
        "initialize" => rpc_ok(
            id,
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "weave", "version": "0.1.0" }
            }),
        ),
        "tools/list" => rpc_ok(
            id,
            json!({ "tools": [{
                "name": "ask_memory",
                "description": "Query the team's shared cognitive memory (Weave). Returns an answer with memory-layer provenance and any emergent skill used.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "project": { "type": "string" },
                        "question": { "type": "string" }
                    },
                    "required": ["question"]
                }
            }] }),
        ),
        "tools/call" => {
            let params = req.get("params").cloned().unwrap_or_default();
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            if name != "ask_memory" {
                return rpc_err(id, -32601, "unknown tool");
            }
            let args = params.get("arguments").cloned().unwrap_or_default();
            let project = args
                .get("project")
                .and_then(Value::as_str)
                .unwrap_or(DEFAULT_PROJECT)
                .to_string();
            let question = args
                .get("question")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            match state.runtime.answer(&project, &question).await {
                Ok(res) => rpc_ok(
                    id,
                    json!({
                        "content": [{ "type": "text", "text": res.answer }],
                        "structuredContent": res
                    }),
                ),
                Err(e) => rpc_err(id, -32000, &e.to_string()),
            }
        }
        m if m.starts_with("notifications/") => Json(json!({})),
        _ => rpc_err(id, -32601, "method not found"),
    }
}

// --- Error plumbing ---

struct AppError(anyhow::Error);

impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(e: E) -> Self {
        AppError(e.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        tracing::error!("request error: {:#}", self.0);
        (StatusCode::INTERNAL_SERVER_ERROR, self.0.to_string()).into_response()
    }
}
