//! Weave HTTP surface: REST + SSE live feed + a minimal MCP endpoint so external
//! agents (e.g. Claude) can query the shared memory over the Model Context Protocol.

use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::{Stream, StreamExt};
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

use weave_ingest::{
    generate_events, preset_by_org, presets, scope_from_ids, seed_events, notion_seed_events,
    Connector, DiscordConnector, NotionConnector, SlackConnector,
};
use weave_llm::{
    ClaudeLlm, EmbeddingGateway, HashEmbedder, HeuristicLlm, LlmGateway, OllamaEmbedder, OllamaLlm,
    OpenaiLlm,
};
use weave_pipeline::{PipelineEvent, Runtime};
use weave_store::{PgStore, Store};

mod discord_oauth;
mod notion_oauth;
mod oauth;

const DEFAULT_PROJECT: &str = "pennylane";

#[derive(Clone)]
struct AppState {
    runtime: Arc<Runtime>,
    store: Arc<PgStore>,
    api_key: Option<String>,
    cipher: Arc<weave_store::Cipher>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load `.env` from the repo root when present (local dev).
    let _ = dotenvy::dotenv();

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
    let api_key = std::env::var("WEAVE_API_KEY")
        .ok()
        .filter(|s| !s.trim().is_empty());

    // Storage: one Postgres behind all ports.
    let store = Arc::new(PgStore::connect(&database_url).await?);
    store.migrate().await?;
    let dyn_store: Arc<dyn Store> = store.clone();

    // LLM gateway — multi-provider, pluggable. Default: Ollama (local, no key).
    // WEAVE_LLM_PROVIDER = ollama | claude | heuristic | auto | groq | grok | openai
    // Ingestion (extraction, synthesis) provider.
    let provider = std::env::var("WEAVE_LLM_PROVIDER").unwrap_or_else(|_| "ollama".into());
    let llm: Arc<dyn LlmGateway> = build_llm(&provider);
    // Answering provider — decoupled so ingestion can be fast/deterministic while
    // answers stay conversational (e.g. extraction=heuristic, answers=groq). Defaults
    // to the ingestion provider when WEAVE_ANSWER_PROVIDER is unset.
    let answer_provider =
        std::env::var("WEAVE_ANSWER_PROVIDER").unwrap_or_else(|_| provider.clone());
    let answer_llm: Arc<dyn LlmGateway> = build_llm(&answer_provider);
    tracing::info!(extraction = %provider, answering = %answer_provider, "LLM providers");
    // Embeddings — real semantic (Ollama nomic) by default, hash fallback.
    // WEAVE_EMBED_PROVIDER = ollama | hash  (groq: use hash — no Groq embeddings wired)
    let embedder: Arc<dyn EmbeddingGateway> =
        match std::env::var("WEAVE_EMBED_PROVIDER").unwrap_or_else(|_| {
            if provider == "groq" {
                "hash".into()
            } else {
                "ollama".into()
            }
        }).as_str() {
            "hash" => Arc::new(HashEmbedder::new()),
            _ => Arc::new(OllamaEmbedder::new(ollama_url(), embed_model())),
        };

    let runtime =
        Arc::new(Runtime::new(dyn_store, llm, embedder, threshold).with_answer_llm(answer_llm));
    tracing::info!("LLM gateway: {}", runtime.llm_name());
    runtime.seed_predefined_agents(DEFAULT_PROJECT).await?;

    let cipher = Arc::new(
        weave_store::Cipher::from_env()
            .map_err(|e| anyhow::anyhow!("WEAVE_ENC_KEY: {e}"))?,
    );

    let state = AppState {
        runtime,
        store,
        api_key,
        cipher,
    };

    let app = build_app(state);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Weave API listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

fn build_app(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/openapi.yaml", get(serve_openapi))
        .route("/replay", post(replay))
        .route("/ingest/slack", post(ingest_slack))
        .route("/ingest/notion", post(ingest_notion))
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
        .route("/connections", get(get_connections))
        .route("/connections/:provider", axum::routing::delete(disconnect_provider))
        .route("/oauth/slack/authorize", get(oauth::authorize))
        .route("/oauth/slack/callback", get(oauth::callback))
        .route("/connections/slack/import", post(oauth::import_from_env))
        .route("/oauth/notion/authorize", get(notion_oauth::authorize))
        .route("/oauth/notion/callback", get(notion_oauth::callback))
        .route("/ingest/discord", post(ingest_discord))
        .route("/respond/discord", post(respond_discord))
        .route("/oauth/discord/authorize", get(discord_oauth::authorize))
        .route("/oauth/discord/callback", get(discord_oauth::callback))
        .layer(cors_layer())
        .with_state(state)
}

fn cors_layer() -> CorsLayer {
    let allow_any = std::env::var("WEAVE_CORS_ALLOW_ANY")
        .ok()
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    if allow_any {
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }

    let origins: Vec<HeaderValue> = match std::env::var("WEAVE_CORS_ORIGIN") {
        Ok(raw) if !raw.trim().is_empty() => raw
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .filter_map(|origin| HeaderValue::from_str(origin).ok())
            .collect(),
        _ => vec![
            HeaderValue::from_static("http://127.0.0.1:3200"),
            HeaderValue::from_static("http://localhost:3200"),
        ],
    };

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any)
}

/// Build an LLM gateway for a provider name. Used for both the ingestion provider
/// (WEAVE_LLM_PROVIDER) and the answering provider (WEAVE_ANSWER_PROVIDER).
fn build_llm(provider: &str) -> Arc<dyn LlmGateway> {
    let anthropic_key = std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|k| !k.trim().is_empty());
    match provider {
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
        "groq" => match groq_api_key() {
            Some(key) => Arc::new(OpenaiLlm::named(groq_base_url(), groq_model(), key, "groq")),
            None => {
                tracing::warn!("provider=groq but GROQ_API_KEY unset; using heuristic");
                Arc::new(HeuristicLlm::new())
            }
        },
        "grok" | "openai" => {
            let openai_key = std::env::var("OPENAI_API_KEY")
                .ok()
                .filter(|k| !k.trim().is_empty());
            match openai_key {
                Some(key) => {
                    let base_url = std::env::var("OPENAI_BASE_URL")
                        .unwrap_or_else(|_| "https://api.openai.com/v1".into());
                    let model = std::env::var("OPENAI_MODEL")
                        .unwrap_or_else(|_| "gpt-4o-mini".into());
                    Arc::new(OpenaiLlm::new(base_url, model, key))
                }
                None => {
                    tracing::warn!("provider={provider} but OPENAI_API_KEY unset; using heuristic");
                    Arc::new(HeuristicLlm::new())
                }
            }
        }
        _ => Arc::new(OllamaLlm::new(ollama_url(), ollama_model())),
    }
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
fn groq_api_key() -> Option<String> {
    std::env::var("GROQ_API_KEY")
        .ok()
        .filter(|k| !k.trim().is_empty())
        .or_else(|| {
            std::env::var("OPENAI_API_KEY")
                .ok()
                .filter(|k| !k.trim().is_empty())
        })
}
fn groq_base_url() -> String {
    std::env::var("GROQ_BASE_URL")
        .or_else(|_| std::env::var("OPENAI_BASE_URL"))
        .unwrap_or_else(|_| "https://api.groq.com/openai/v1".into())
}
fn groq_model() -> String {
    std::env::var("GROQ_MODEL")
        .or_else(|_| std::env::var("OPENAI_MODEL"))
        .unwrap_or_else(|_| "llama-3.1-8b-instant".into())
}
fn embed_model() -> String {
    std::env::var("WEAVE_EMBED_MODEL").unwrap_or_else(|_| "nomic-embed-text".into())
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    use weave_store::EventStore;
    let db = state.store.count_events(DEFAULT_PROJECT).await.is_ok();
    Json(json!({
        "status": if db { "ok" } else { "degraded" },
        "service": "weave",
        "llm": state.runtime.llm_name(),
        "database": if db { "ok" } else { "error" },
    }))
}

async fn serve_openapi() -> impl IntoResponse {
    (
        [(axum::http::header::CONTENT_TYPE, "application/yaml")],
        include_str!("../../../docs/api/openapi.yaml"),
    )
}

pub(crate) fn require_api_key(state: &AppState, headers: &HeaderMap) -> Result<(), AppError> {
    require_api_key_from(state, headers, None)
}

fn require_api_key_from(
    state: &AppState,
    headers: &HeaderMap,
    query_key: Option<&str>,
) -> Result<(), AppError> {
    let Some(expected) = &state.api_key else {
        return Ok(());
    };

    let provided = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .or_else(|| headers.get("x-api-key").and_then(|h| h.to_str().ok()))
        .or(query_key.filter(|k| !k.is_empty()));

    // Constant-time compare so a wrong key can't be recovered via response timing.
    use subtle::ConstantTimeEq;
    match provided {
        Some(value) if bool::from(value.as_bytes().ct_eq(expected.as_bytes())) => Ok(()),
        _ => Err(AppError::unauthorized("missing or invalid API key")),
    }
}

#[derive(Deserialize)]
struct ProjectQ {
    project: Option<String>,
}

fn project_of(q: &ProjectQ) -> String {
    q.project.clone().unwrap_or_else(|| DEFAULT_PROJECT.into())
}

/// Kick off a live replay of the seed stream in the background.
async fn replay(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let project = project_of(&q);
    let runtime = state.runtime.clone();
    tracing::info!(project = %project, "replay requested");
    tokio::spawn(async move {
        for mut event in seed_events() {
            event.project = project.clone();
            if let Err(e) = runtime.ingest(&event).await {
                tracing::error!(project = %project, "replay ingest failed: {e}");
            }
            tokio::time::sleep(Duration::from_millis(750)).await;
        }
        tracing::info!(project = %project, "replay complete");
    });
    Ok(Json(json!({ "status": "replaying", "project": project_of(&q) })))
}

// --- Sandbox: bring-your-own-org ---

/// Current org config for a tenant (stored, else the matching preset).
async fn get_org(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
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
    headers: HeaderMap,
    Json(req): Json<LoadReq>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    use weave_store::OrgStore;
    let cfg = preset_by_org(&req.org)
        .ok_or_else(|| anyhow::anyhow!("unknown preset: {}", req.org))?;
    let value = json!(cfg);
    tracing::info!(org = %req.org, "load_org requested");
    state.store.save_org_config(&req.org, &value).await?;
    state.store.reset(&req.org).await?;
    state.runtime.seed_predefined_agents(&req.org).await?;
    Ok(Json(value))
}

/// Save an edited org config.
async fn put_org(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(cfg): Json<Value>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    use weave_store::OrgStore;
    let org = cfg.get("org").and_then(Value::as_str).unwrap_or(DEFAULT_PROJECT).to_string();
    tracing::info!(org = %org, "org config saved");
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
    headers: HeaderMap,
    Json(req): Json<SimReq>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    use weave_core::OrgConfig;
    use weave_store::OrgStore;
    let org = req.project.unwrap_or_else(|| DEFAULT_PROJECT.into());
    let cfg: OrgConfig = match state.store.get_org_config(&org).await? {
        Some(v) => serde_json::from_value(v)?,
        None => preset_by_org(&org).ok_or_else(|| anyhow::anyhow!("no org config for {org}"))?,
    };
    tracing::info!(project = %org, "simulation requested");
    let events = generate_events(&cfg);
    let n = events.len();
    let batch_id = uuid::Uuid::new_v4().to_string();
    let runtime = state.runtime.clone();
    let store = state.store.clone();
    tokio::spawn(async move {
        use weave_store::EventStore;
        let before = store.count_events(&org).await.unwrap_or(0);
        for mut event in events {
            if let serde_json::Value::Object(ref mut map) = event.payload {
                map.insert("_weave_sim_batch".into(), json!(batch_id));
            }
            if let Err(e) = runtime.ingest(&event).await {
                tracing::error!("simulate ingest failed: {e}");
            }
            tokio::time::sleep(Duration::from_millis(80)).await;
        }
        let after = store.count_events(&org).await.unwrap_or(before);
        let inserted = (after - before).max(0) as usize;
        runtime.publish(PipelineEvent::SimulationComplete {
            project: org.clone(),
            batch_size: n,
            inserted,
        });
        tracing::info!("simulation complete ({n} events, {inserted} inserted)");
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
    headers: HeaderMap,
    Json(req): Json<InjectReq>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
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
    tracing::info!(project = %event.project, actor = %event.actor, "manual inject requested");
    state.runtime.ingest(&event).await?;
    Ok(Json(json!({ "status": "injected" })))
}

/// Pull a Slack channel (read-only) and ingest it through the same pipeline.
/// Configured via SLACK_BOT_TOKEN + SLACK_CHANNEL. This is the Phase 0 "real on a
/// wire" path: same emergence, but on real messages.
async fn ingest_slack(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let project = project_of(&q);
    let channel = std::env::var("SLACK_CHANNEL").ok().filter(|c| !c.trim().is_empty());

    // 1. Prefer a stored OAuth connection (refresh if expiring).
    let token = match state.store.get_active_connection(&state.cipher, "slack").await? {
        Some(conn) => match oauth::SlackConfig::from_env() {
            Some(cfg) => Some(oauth::ensure_fresh(&state, &cfg, conn).await?.access_token),
            None => Some(conn.access_token), // static token, no refresh possible
        },
        None => None,
    };
    // 2. Fall back to the legacy env token (keeps the offline demo working).
    let token = token.or_else(|| {
        std::env::var("SLACK_BOT_TOKEN").ok().filter(|t| !t.trim().is_empty())
    });

    let Some(token) = token else {
        return Ok(Json(json!({
            "status": "not_configured",
            "hint": "connect Slack via /oauth/slack/authorize (grants a user token to read your channels)"
        })));
    };

    tracing::info!(project = %project, source = "slack", "slack ingest requested");
    // A fixed SLACK_CHANNEL overrides discovery (single channel); otherwise the
    // connected user token drives multi-channel discovery of the user's own channels.
    let events = if let Some(channel) = channel {
        SlackConnector::new(token, channel, &project).poll().await?
    } else {
        let max_channels = std::env::var("SLACK_MAX_CHANNELS").ok().and_then(|v| v.parse().ok()).unwrap_or(15);
        let max_messages = std::env::var("SLACK_MAX_MESSAGES").ok().and_then(|v| v.parse().ok()).unwrap_or(50);
        SlackConnector::for_user(token, &project, max_channels, max_messages)
            .poll_all()
            .await?
    };
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
    Ok(Json(json!({ "status": "ingesting", "source": "slack", "events": n, "project": project })))
}

/// Pull a Discord guild (read-only) and ingest it through the same pipeline.
/// The stored connection records the installed guild id in `team_id`; reads
/// always use the global bot token from env (never the token on the row).
async fn ingest_discord(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let project = project_of(&q);

    let Some(conn) = state.store.get_active_connection(&state.cipher, "discord").await? else {
        return Ok(Json(json!({
            "status": "not_configured",
            "hint": "connect Discord via /oauth/discord/authorize (installs the bot into your guild)"
        })));
    };
    let Some(cfg) = discord_oauth::DiscordConfig::from_env() else {
        return Ok(Json(json!({
            "status": "not_configured",
            "hint": "DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID not set on the API"
        })));
    };

    let guild_id = conn.team_id;
    let max_channels = std::env::var("DISCORD_MAX_CHANNELS").ok().and_then(|v| v.parse().ok()).unwrap_or(15);
    let max_messages = std::env::var("DISCORD_MAX_MESSAGES").ok().and_then(|v| v.parse().ok()).unwrap_or(50);

    tracing::info!(project = %project, source = "discord", guild = %guild_id, "discord ingest requested");
    let events = DiscordConnector::for_guild(cfg.bot_token, guild_id, &project, max_channels, max_messages)
        .poll_all()
        .await?;

    let n = events.len();
    let runtime = state.runtime.clone();
    tokio::spawn(async move {
        for event in events {
            if let Err(e) = runtime.ingest(&event).await {
                tracing::error!("discord ingest failed: {e}");
            }
        }
        tracing::info!("discord ingest complete ({n} events)");
    });
    Ok(Json(json!({ "status": "ingesting", "source": "discord", "events": n, "project": project })))
}

/// Discover unanswered @mentions in the connected Discord guild, answer them via
/// the memory-grounded pipeline, and post each reply back in-thread. Already-answered
/// messages (tracked in the `answered_mentions` ledger) are skipped.
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
        // Atomic claim: only the cycle that wins the claim answers. Prevents overlapping
        // cron cycles from double-replying the same mention.
        if !state.store.claim_mention("discord", &m.message_id).await? {
            continue;
        }
        let (a, agent) = state.runtime.answer_for_chat(&project, &m.text).await?;
        let reply = match agent {
            Some(name) => format!("{}\n\n↳ via {name}", a.answer),
            None => a.answer,
        };
        match conn_client.post_reply(&m.channel_id, &reply, &m.message_id).await {
            Ok(_) => answered += 1,
            Err(e) => {
                tracing::warn!("discord reply failed for {}: {e}", m.message_id);
                // release the claim so the next cycle retries this mention
                let _ = state.store.release_mention("discord", &m.message_id).await;
            }
        }
    }
    Ok(Json(json!({ "status": "responded", "answered": answered, "project": project })))
}

/// Ingest a real Notion workspace when NOTION_TOKEN is set; otherwise replay the
/// Notion-tagged seed events (keeps the offline demo working with no secrets).
async fn ingest_notion(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let project = project_of(&q);
    // Prefer a stored OAuth connection (Notion tokens don't expire → no refresh),
    // then fall back to the legacy env token (keeps the offline demo working).
    let token = match state.store.get_active_connection(&state.cipher, "notion").await? {
        Some(conn) => Some(conn.access_token),
        None => std::env::var("NOTION_TOKEN").ok().filter(|t| !t.trim().is_empty()),
    };

    let events = match token {
        Some(token) => {
            let scope = scope_from_ids(
                std::env::var("NOTION_PAGE_IDS").ok().as_deref(),
                std::env::var("NOTION_DATABASE_IDS").ok().as_deref(),
            );
            tracing::info!(project = %project, source = "notion", "notion live ingest requested");
            let connector = NotionConnector::new(token, project.clone(), scope);
            connector.poll().await? // surface auth/permission errors now
        }
        None => {
            let mut events = notion_seed_events();
            for event in &mut events {
                event.project = project.clone();
            }
            tracing::info!(project = %project, source = "notion", events = events.len(), "notion seed replay (no token)");
            events
        }
    };

    let n = events.len();
    let runtime = state.runtime.clone();
    tokio::spawn(async move {
        for event in events {
            if let Err(e) = runtime.ingest(&event).await {
                tracing::error!("notion ingest failed: {e}");
            }
        }
        tracing::info!("notion ingest complete ({n} events)");
    });
    Ok(Json(json!({ "status": "ingesting", "source": "notion", "events": n, "project": project })))
}

/// Wipe one project so a replay can be rehearsed from scratch.
async fn reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let project = project_of(&q);
    tracing::info!(project = %project, "reset requested");
    state.store.reset(&project).await?;
    state.runtime.seed_predefined_agents(&project).await?;
    Ok(Json(json!({ "status": "reset", "project": project })))
}

#[derive(Deserialize)]
struct ApiKeyQ {
    api_key: Option<String>,
}

/// SSE live feed of pipeline events. When `WEAVE_API_KEY` is set, pass `?api_key=` (EventSource cannot send headers).
async fn sse_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ApiKeyQ>,
) -> Result<Sse<impl Stream<Item = Result<SseEvent, Infallible>>>, AppError> {
    require_api_key_from(&state, &headers, q.api_key.as_deref())?;
    let rx = state.runtime.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|msg| match msg {
        Ok(ev) => Some(Ok(SseEvent::default().json_data(ev).unwrap_or_default())),
        Err(_) => None, // lagged; skip
    });
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))))
}

async fn get_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
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
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    use weave_store::FactStore;
    let facts = state.store.recent_facts(&project_of(&q), 100).await?;
    Ok(Json(json!(facts)))
}

async fn get_skills(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    use weave_store::SkillStore;
    let skills = state.store.skills(&project_of(&q)).await?;
    Ok(Json(json!(skills)))
}

async fn get_graph(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
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
    headers: HeaderMap,
    Json(req): Json<AskReq>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let project = req.project.unwrap_or_else(|| DEFAULT_PROJECT.into());
    tracing::info!(project = %project, question = %req.question, "ask requested");
    let result = state.runtime.answer(&project, &req.question).await?;
    Ok(Json(json!(result)))
}

async fn get_agents(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ProjectQ>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    use weave_store::AgentStore;
    let agents = state.store.agents(&project_of(&q)).await?;
    Ok(Json(json!(agents)))
}

/// Disconnect a provider: remove its stored connection(s) so the user can
/// reconnect (e.g. to re-grant scopes). Static-token providers stay reflected
/// via env, so this only clears OAuth-stored rows.
async fn disconnect_provider(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(provider): axum::extract::Path<String>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let removed = state.store.delete_connections(&provider).await?;
    Ok(Json(json!({ "status": "disconnected", "provider": provider, "removed": removed })))
}

/// Non-sensitive list of stored connections, so the UI can show real connect state.
async fn get_connections(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let conns = state.store.list_connections().await?;
    let mut out: Vec<Value> = conns
        .iter()
        .map(|c| {
            json!({
                "provider": c.provider,
                "team_id": c.team_id,
                "scopes": c.scopes,
                "expires_at": c.expires_at,
                "updated_at": c.updated_at,
            })
        })
        .collect();
    // Reflect static-token connections (e.g. a Notion internal integration) so the
    // UI shows them connected instead of offering a Connect button that dead-ends.
    let has = |p: &str| conns.iter().any(|c| c.provider == p);
    let token_set = |k: &str| std::env::var(k).ok().is_some_and(|v| !v.trim().is_empty());
    if !has("notion") && token_set("NOTION_TOKEN") {
        out.push(json!({ "provider": "notion", "team_id": "token", "scopes": "", "expires_at": null, "updated_at": null }));
    }
    Ok(Json(json!(out)))
}

#[derive(Deserialize)]
struct ApproveReq {
    project: Option<String>,
    name: String,
}

/// Human-in-the-loop governance: activate an emergent (pending) agent.
async fn approve_agent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ApproveReq>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    use weave_core::AgentStatus;
    use weave_store::AgentStore;
    let project = req.project.unwrap_or_else(|| DEFAULT_PROJECT.into());
    tracing::info!(project = %project, agent = %req.name, "approve_agent requested");
    state
        .store
        .set_agent_status(&project, &req.name, AgentStatus::Active)
        .await?;

    // Best-effort: write the approved agent into Notion. Never fails approval.
    let notion = push_agent_to_notion(&state, &project, &req.name).await;

    Ok(Json(json!({ "status": "active", "name": req.name, "project": project, "notion": notion })))
}

/// Push the just-approved agent into Notion. Returns a status string for the
/// response; any error is logged and downgraded to "failed" (best-effort).
async fn push_agent_to_notion(state: &AppState, project: &str, name: &str) -> &'static str {
    use weave_store::AgentStore;
    // Prefer a stored OAuth connection; fall back to a static NOTION_TOKEN
    // (internal integration) so the loop works without the OAuth dance.
    let token = match state.store.get_active_connection(&state.cipher, "notion").await {
        Ok(Some(c)) => c.access_token,
        Ok(None) => match std::env::var("NOTION_TOKEN").ok().filter(|t| !t.trim().is_empty()) {
            Some(t) => t,
            None => return "not_connected",
        },
        Err(e) => {
            tracing::error!("notion connection lookup failed: {e}");
            return "failed";
        }
    };
    let agent = match state.store.agents(project).await {
        Ok(list) => list.into_iter().find(|a| a.name == name),
        Err(e) => {
            tracing::error!("agent lookup failed: {e}");
            return "failed";
        }
    };
    let Some(agent) = agent else { return "failed" };
    match weave_ingest::NotionWriter::new(token)
        .upsert_agent(&agent)
        .await
    {
        Ok(_) => "written",
        Err(e) => {
            tracing::error!("notion write-back failed: {e}");
            "failed"
        }
    }
}

#[derive(Deserialize)]
struct RunReq {
    project: Option<String>,
    agent: Option<String>,
    task: String,
}

async fn run_agent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RunReq>,
) -> Result<Json<Value>, AppError> {
    require_api_key(&state, &headers)?;
    let project = req.project.unwrap_or_else(|| DEFAULT_PROJECT.into());
    let agent = req.agent.unwrap_or_else(|| "assistant".into());
    tracing::info!(project = %project, agent = %agent, task = %req.task, "run_agent requested");
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

async fn mcp(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<Value>,
) -> axum::response::Response {
    if let Err(err) = require_api_key(&state, &headers) {
        return err.into_response();
    }
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
        )
        .into_response(),
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
        )
        .into_response(),
        "tools/call" => {
            let params = req.get("params").cloned().unwrap_or_default();
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            if name != "ask_memory" {
                return rpc_err(id, -32601, "unknown tool").into_response();
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
                )
                .into_response(),
                Err(e) => rpc_err(id, -32000, &e.to_string()).into_response(),
            }
        }
        m if m.starts_with("notifications/") => Json(json!({})).into_response(),
        _ => rpc_err(id, -32601, "method not found").into_response(),
    }
}

// --- Error plumbing ---

struct AppError {
    status: StatusCode,
    error: anyhow::Error,
    client_message: String,
}

impl AppError {
    fn unauthorized(message: impl Into<String>) -> Self {
        AppError {
            status: StatusCode::UNAUTHORIZED,
            error: anyhow::anyhow!("unauthorized"),
            client_message: message.into(),
        }
    }
}

impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(e: E) -> Self {
        AppError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error: e.into(),
            client_message: "internal server error".into(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        tracing::error!("request error: {:#}", self.error);
        (self.status, self.client_message).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use serde_json::Value;
    use sqlx::postgres::PgPoolOptions;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tower::util::ServiceExt;
    use weave_core::{Agent, AgentStatus, Event, Fact, FactType, MemoryLevel, Skill};
    use weave_llm::{EmbeddingGateway, Extraction, LlmGateway};
    use weave_store::{AgentStore, PgStore};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(1);

    // Serializes tests that touch the global `discord` connection row + DISCORD_* env.
    // cargo runs #[tokio::test]s in parallel; these share the connections table
    // (keyed by provider, not project) and process env → they must not overlap.
    static DISCORD_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    /// Guarantee no `discord` connection + no leaked DISCORD_* env for the
    /// "without connection" assertions, regardless of test order.
    async fn clear_discord_state() {
        if let Ok(url) = std::env::var("TEST_DATABASE_URL") {
            if let Ok(pool) = PgPoolOptions::new().max_connections(1).connect(&url).await {
                let store = PgStore::from_pool(pool);
                let _ = store.migrate().await;
                let _ = store.delete_connections("discord").await;
            }
        }
        for k in ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_BOT_TOKEN", "DISCORD_API_BASE"] {
            std::env::remove_var(k);
        }
    }

    #[derive(Default)]
    struct StubLlm;

    #[async_trait::async_trait]
    impl LlmGateway for StubLlm {
        async fn extract(&self, _event: &weave_core::Event) -> anyhow::Result<Extraction> {
            Ok(Extraction::default())
        }

        async fn synthesize_skill(
            &self,
            _signature: &str,
            _question: &str,
            _answers: &[String],
        ) -> anyhow::Result<String> {
            Ok("stub skill".into())
        }

        async fn assign_theme(
            &self,
            trigger: &str,
            _body: &str,
            _existing: &[String],
        ) -> anyhow::Result<String> {
            Ok(weave_llm::normalize_theme(&weave_llm::heuristic_theme(trigger)))
        }

        async fn canonicalize_topic(
            &self,
            raw_topic: &str,
            _existing: &[String],
        ) -> anyhow::Result<String> {
            Ok(weave_llm::normalize_theme(raw_topic))
        }

        async fn synthesize_agent(
            &self,
            team: &str,
            theme: &str,
            skills: &[weave_llm::SkillBrief],
        ) -> anyhow::Result<weave_llm::AgentSpec> {
            Ok(weave_llm::heuristic_agent_spec(team, theme, skills))
        }

        async fn answer(&self, question: &str, _context: &str) -> anyhow::Result<String> {
            Ok(format!("stub answer: {question}"))
        }

        fn name(&self) -> &'static str {
            "stub"
        }
    }

    #[derive(Default)]
    struct StubEmbedder;

    #[async_trait::async_trait]
    impl EmbeddingGateway for StubEmbedder {
        async fn embed(&self, _text: &str) -> anyhow::Result<Vec<f32>> {
            Ok(vec![0.0; weave_core::EMBEDDING_DIM])
        }
    }

    fn unique_project(prefix: &str) -> String {
        format!("{prefix}-{}", TEST_COUNTER.fetch_add(1, Ordering::Relaxed))
    }

    async fn test_app() -> Option<Router> {
        let url = std::env::var("TEST_DATABASE_URL").ok()?;
        let pool = PgPoolOptions::new().max_connections(1).connect(&url).await.ok()?;
        let store = Arc::new(PgStore::from_pool(pool));
        store.migrate().await.ok()?;
        let runtime = Arc::new(Runtime::new(
            store.clone(),
            Arc::new(StubLlm),
            Arc::new(StubEmbedder),
            5,
        ));
        let cipher = Arc::new(
            weave_store::Cipher::from_base64("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=").unwrap(),
        );
        Some(build_app(AppState {
            runtime,
            store,
            api_key: None,
            cipher,
        }))
    }

    fn dummy_runtime(store: Arc<PgStore>) -> Arc<Runtime> {
        Arc::new(Runtime::new(store, Arc::new(StubLlm), Arc::new(StubEmbedder), 5))
    }

    async fn json_body(response: axum::response::Response) -> Value {
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should read");
        serde_json::from_slice(&bytes).expect("body should be json")
    }

    fn sample_event(project: &str) -> Event {
        Event {
            id: uuid::Uuid::new_v4(),
            source: "manual".into(),
            ts: chrono::Utc::now(),
            actor: "memo".into(),
            project: project.into(),
            kind: "message".into(),
            payload: json!({"text": "Comment relancer la synchro bancaire ?", "team": "ops", "workstream": "banking"}),
            confidence: 1.0,
        }
    }

    fn sample_fact(project: &str) -> Fact {
        Fact {
            id: uuid::Uuid::new_v4(),
            event_id: None,
            project: project.into(),
            team: "ops".into(),
            workstream: "banking".into(),
            ftype: FactType::Answer,
            author: "nicolas".into(),
            topic: "relancer synchro bancaire".into(),
            content: "Utiliser BankSync.rerun(client_id)".into(),
            confidence: 0.95,
            memory_level: MemoryLevel::Project,
            content_sig: String::new(),
            canonical_topic: String::new(),
            embedding: None,
            created_at: chrono::Utc::now(),
        }
    }

    fn sample_skill(project: &str, name: &str) -> Skill {
        Skill {
            id: uuid::Uuid::new_v4(),
            project: project.into(),
            team: "ops".into(),
            workstream: "banking".into(),
            name: name.into(),
            trigger: "Comment relancer la synchro bancaire ?".into(),
            body: "1. Lancer BankSync.rerun(client_id)".into(),
            theme: "synchro bancaire".into(),
            sources: vec![uuid::Uuid::new_v4()],
            referents: vec!["nicolas".into()],
            derived_from_pattern: None,
            memory_level: MemoryLevel::Project,
            created_at: chrono::Utc::now(),
        }
    }

    fn sample_agent(project: &str, name: &str) -> Agent {
        Agent {
            id: uuid::Uuid::new_v4(),
            project: project.into(),
            team: "ops".into(),
            name: name.into(),
            role: "Tu aides l'équipe ops.".into(),
            domain: "finance-ops".into(),
            description: "Spécialiste ops.".into(),
            skills: vec!["banking/relancer-synchro".into()],
            scope: MemoryLevel::Team,
            status: AgentStatus::Pending,
            derived_from: "test".into(),
            created_at: chrono::Utc::now(),
        }
    }

    #[tokio::test]
    async fn health_returns_ok() {
        let Some(app) = test_app().await else {
            eprintln!("skipping api test: TEST_DATABASE_URL not set or unavailable");
            return;
        };

        let response = app
            .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_body(response).await;
        assert_eq!(body["status"], "ok");
        assert_eq!(body["llm"], "stub");
    }

    #[tokio::test]
    async fn openapi_yaml_is_served() {
        let Some(app) = test_app().await else {
            eprintln!("skipping api test: TEST_DATABASE_URL not set or unavailable");
            return;
        };

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/openapi.yaml")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let ct = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        assert!(ct.contains("yaml"), "content-type was {ct}");

        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should read");
        let yaml = String::from_utf8(bytes.to_vec()).expect("utf8");
        assert!(yaml.starts_with("openapi: 3.1"));
        assert!(yaml.contains("  /health:"));
        assert!(yaml.contains("  /ask:"));
        assert!(yaml.contains("  /openapi.yaml:"));
        assert!(yaml.contains("Weave Cognitive Runtime API"));
    }

    #[tokio::test]
    async fn ingest_notion_without_token_replays_seed() {
        std::env::remove_var("NOTION_TOKEN");
        let Some(app) = test_app().await else {
            eprintln!("skipping api test: TEST_DATABASE_URL not set or unavailable");
            return;
        };

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/ingest/notion?project=pennylane")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let v = json_body(response).await;
        assert_eq!(v["source"], "notion");
        assert_eq!(v["status"], "ingesting");
        assert_eq!(v["events"], weave_ingest::notion_seed_events().len());
    }

    #[tokio::test]
    async fn ingest_discord_without_connection_is_not_configured() {
        let _guard = DISCORD_TEST_LOCK.lock().await;
        let Some(app) = test_app().await else {
            eprintln!("skipping api test: TEST_DATABASE_URL not set or unavailable");
            return;
        };
        clear_discord_state().await;
        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/ingest/discord")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = json_body(resp).await;
        assert_eq!(body["status"], "not_configured");
    }

    #[tokio::test]
    async fn respond_discord_without_connection_is_not_configured() {
        let _guard = DISCORD_TEST_LOCK.lock().await;
        let Some(app) = test_app().await else { return };
        clear_discord_state().await;
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

        let _guard = DISCORD_TEST_LOCK.lock().await;
        let Some(app) = test_app().await else { return };

        // Unique per run so repeated local runs against the persistent test DB stay isolated.
        let guild = format!("G-{}", uuid::Uuid::new_v4());
        let msg_id = format!("M-{}", uuid::Uuid::new_v4());

        // A stored discord connection (guild id in team_id).
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let pool = PgPoolOptions::new().max_connections(1).connect(&url).await.unwrap();
        let store = PgStore::from_pool(pool);
        store.migrate().await.unwrap();
        let cipher = weave_store::Cipher::from_base64("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=").unwrap();
        store.upsert_connection(&cipher, &weave_store::NewConnection {
            provider: "discord".into(), team_id: guild.clone(),
            access_token: "unused".into(), refresh_token: None, expires_at: None, scopes: String::new(),
        }).await.unwrap();

        // Mock the Discord API.
        let mock = MockServer::start().await;
        Mock::given(method("GET")).and(path("/users/@me"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "id": "BOT" }))).mount(&mock).await;
        Mock::given(method("GET")).and(path(format!("/guilds/{guild}/channels")))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([{ "id": "C1", "type": 0 }]))).mount(&mock).await;
        Mock::given(method("GET")).and(path("/channels/C1/messages"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
                { "id": msg_id, "content": "<@BOT> comment relancer minerva ?", "mentions": [{ "id": "BOT" }], "author": { "username": "sarah", "bot": false } }
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

        for k in ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_BOT_TOKEN", "DISCORD_API_BASE"] {
            std::env::remove_var(k);
        }
        store.delete_connections("discord").await.unwrap();
    }

    #[tokio::test]
    async fn reset_is_scoped_to_requested_project() {
        let Some(app) = test_app().await else {
            eprintln!("skipping api test: TEST_DATABASE_URL not set or unavailable");
            return;
        };

        let project = unique_project("api-reset");
        let other_project = unique_project("api-reset-other");

        let inject_a = Request::builder()
            .method("POST")
            .uri("/inject")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({"project": project, "text": "question A"}).to_string(),
            ))
            .unwrap();
        let inject_b = Request::builder()
            .method("POST")
            .uri("/inject")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({"project": other_project, "text": "question B"}).to_string(),
            ))
            .unwrap();
        app.clone().oneshot(inject_a).await.unwrap();
        app.clone().oneshot(inject_b).await.unwrap();

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/reset?project={project}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = json_body(response).await;
        assert_eq!(body["project"], project);

        let stats_a = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/stats?project={project}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let stats_b = app
            .oneshot(
                Request::builder()
                    .uri(format!("/stats?project={other_project}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(json_body(stats_a).await["events"], 0);
        assert_eq!(json_body(stats_b).await["events"], 1);
    }

    #[tokio::test]
    async fn stats_facts_skills_ask_agents_and_inject_work() {
        let Some(app) = test_app().await else {
            eprintln!("skipping api test: TEST_DATABASE_URL not set or unavailable");
            return;
        };

        use weave_store::{AgentStore, EventStore, FactStore, SkillStore};

        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let pool = PgPoolOptions::new().max_connections(1).connect(&url).await.unwrap();
        let store = PgStore::from_pool(pool);
        store.migrate().await.unwrap();

        let project = unique_project("api-main");
        let agent_name = "specialiste-ops-finance-ops";

        store.insert_event(&sample_event(&project)).await.unwrap();
        store.insert_fact(&sample_fact(&project)).await.unwrap();
        store.insert_skill(&sample_skill(&project, "banking/relancer-synchro")).await.unwrap();
        store.insert_agent(&sample_agent(&project, agent_name)).await.unwrap();

        let inject_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/inject")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "project": project,
                            "team": "ops",
                            "workstream": "banking",
                            "text": "Message libre de test",
                            "actor": "memo"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(inject_response.status(), StatusCode::OK);
        let inject_body = json_body(inject_response).await;
        assert_eq!(inject_body["status"], "injected");

        let stats_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/stats?project={project}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(stats_response.status(), StatusCode::OK);
        let stats_body = json_body(stats_response).await;
        assert!(stats_body["events"].as_i64().unwrap_or(0) >= 1);
        assert!(stats_body["facts"].as_i64().unwrap_or(0) >= 1);
        assert!(stats_body["skills"].is_array());
        assert!(stats_body["agents"].is_array());

        let facts_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/facts?project={project}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(facts_response.status(), StatusCode::OK);
        let facts_body = json_body(facts_response).await;
        assert_eq!(facts_body.as_array().unwrap().len(), 1);
        assert_eq!(facts_body[0]["project"], project);

        let skills_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/skills?project={project}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(skills_response.status(), StatusCode::OK);
        let skills_body = json_body(skills_response).await;
        assert!(skills_body.is_array());

        let ask_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/ask")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"project": project, "question": "Comment relancer la synchro bancaire ?"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(ask_response.status(), StatusCode::OK);
        let ask_body = json_body(ask_response).await;
        assert!(ask_body["answer"].is_string());
        assert!(ask_body["layers"].is_array());

        let agents_response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/agents?project={project}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(agents_response.status(), StatusCode::OK);
        let agents_body = json_body(agents_response).await;
        assert!(agents_body.is_array());
    }

    #[tokio::test]
    async fn approve_agent_reports_notion_not_connected() {
        let Some(app) = test_app().await else {
            eprintln!("skipping api test: TEST_DATABASE_URL not set or unavailable");
            return;
        };

        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let pool = PgPoolOptions::new().max_connections(1).connect(&url).await.unwrap();
        let store = PgStore::from_pool(pool);
        store.migrate().await.unwrap();

        std::env::remove_var("NOTION_TOKEN"); // ensure no static fallback for this assertion
        let project = unique_project("api-notion");
        let name = "specialiste-ops-finance-ops";
        store.insert_agent(&sample_agent(&project, name)).await.unwrap();

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/agents/approve")
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"project": project, "name": name}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let j = json_body(response).await;
        assert_eq!(j["status"], "active");
        // No Notion connection stored for this project's DB → best-effort reports not_connected.
        assert_eq!(j["notion"], "not_connected");
    }

    #[tokio::test]
    async fn approve_agent_only_updates_requested_project() {
        let Some(app) = test_app().await else {
            eprintln!("skipping api test: TEST_DATABASE_URL not set or unavailable");
            return;
        };

        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let pool = PgPoolOptions::new().max_connections(1).connect(&url).await.unwrap();
        let store = PgStore::from_pool(pool);
        store.migrate().await.unwrap();

        let project = unique_project("api-agent");
        let other_project = unique_project("api-agent-other");
        let name = "specialiste-ops-finance-ops";
        store.insert_agent(&sample_agent(&project, name)).await.unwrap();
        store
            .insert_agent(&sample_agent(&other_project, name))
            .await
            .unwrap();

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/agents/approve")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"project": project, "name": name}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let agents_a = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/agents?project={project}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let agents_b = app
            .oneshot(
                Request::builder()
                    .uri(format!("/agents?project={other_project}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(json_body(agents_a).await[0]["status"], "active");
        assert_eq!(json_body(agents_b).await[0]["status"], "pending");
    }

    #[tokio::test]
    async fn slack_callback_stores_connection() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let Some(app) = test_app().await else { return };
        let mock = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/oauth.v2.access"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "ok": true,
                "access_token": "xoxe.xoxp-live",
                "refresh_token": "xoxe-1-live",
                "expires_in": 43200,
                "team": {"id": "T-CB"},
                "scope": "channels:history"
            })))
            .mount(&mock)
            .await;

        std::env::set_var("SLACK_CLIENT_ID", "cid");
        std::env::set_var("SLACK_CLIENT_SECRET", "csecret");
        std::env::set_var("SLACK_SIGNING_SECRET", "ssecret");
        std::env::set_var("SLACK_API_BASE", mock.uri());
        std::env::set_var("WEAVE_WEB_URL", "https://web.test");

        let state = crate::oauth::sign_state("ssecret", chrono::Utc::now().timestamp());
        let uri = format!("/oauth/slack/callback?code=abc&state={state}");
        let resp = app
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        // Callback redirects the browser back to the web app's sources view.
        assert_eq!(resp.status(), StatusCode::SEE_OTHER);
        let loc = resp.headers().get("location").unwrap().to_str().unwrap();
        assert!(loc.contains("connected=slack"), "location was {loc}");
    }

    #[tokio::test]
    async fn connections_endpoint_lists_stored() {
        let Some(app) = test_app().await else { return };
        // Empty by default.
        let resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/connections")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = json_body(resp).await;
        assert!(body.is_array(), "expected array, got {body}");
    }

    #[tokio::test]
    async fn import_from_env_stores_connection() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let Some(app) = test_app().await else { return };
        let mock = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth.test"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "ok": true, "team_id": "T-IMP"
            })))
            .mount(&mock)
            .await;

        std::env::set_var("SLACK_CLIENT_ID", "cid");
        std::env::set_var("SLACK_CLIENT_SECRET", "csecret");
        std::env::set_var("SLACK_SIGNING_SECRET", "ssecret");
        std::env::set_var("SLACK_API_BASE", mock.uri());
        std::env::set_var("SLACK_ACCESS_TOKEN", "xoxe.xoxp-imported");
        std::env::set_var("SLACK_REFRESH_TOKEN", "xoxe-1-imported");

        let resp = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/connections/slack/import")
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), 200);
    }

    #[tokio::test]
    async fn ensure_fresh_refreshes_expired_token() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};
        use weave_store::Connection;

        let Some(app) = test_app().await else { return };
        let _ = app;
        let mock = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/oauth.v2.access"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "ok": true,
                "access_token": "xoxe.xoxp-NEW",
                "refresh_token": "xoxe-1-NEW",
                "expires_in": 43200,
                "team": {"id": "T-RF"},
                "scope": "channels:history"
            })))
            .mount(&mock)
            .await;

        std::env::set_var("SLACK_CLIENT_ID", "cid");
        std::env::set_var("SLACK_CLIENT_SECRET", "csecret");
        std::env::set_var("SLACK_SIGNING_SECRET", "ssecret");
        std::env::set_var("SLACK_API_BASE", mock.uri());
        let cfg = crate::oauth::SlackConfig::from_env().unwrap();

        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let pool = sqlx::postgres::PgPoolOptions::new().max_connections(1).connect(&url).await.unwrap();
        let store = std::sync::Arc::new(PgStore::from_pool(pool));
        let cipher = std::sync::Arc::new(weave_store::Cipher::from_base64("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=").unwrap());
        let state = AppState { runtime: dummy_runtime(store.clone()), store: store.clone(), api_key: None, cipher: cipher.clone() };

        let expired = Connection {
            provider: "slack".into(),
            team_id: "T-RF".into(),
            access_token: "xoxe.xoxp-OLD".into(),
            refresh_token: Some("xoxe-1-OLD".into()),
            expires_at: Some(chrono::Utc::now() - chrono::Duration::minutes(5)),
            scopes: "channels:history".into(),
            updated_at: chrono::Utc::now(),
        };
        let fresh = crate::oauth::ensure_fresh(&state, &cfg, expired).await.unwrap();
        assert_eq!(fresh.access_token, "xoxe.xoxp-NEW");
    }
}
