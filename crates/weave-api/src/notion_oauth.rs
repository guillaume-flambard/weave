//! Notion OAuth flow, mirroring the Slack module but simpler: Notion access
//! tokens don't expire and have no refresh token. Reuses the shared CSRF state
//! signing, `web_redirect`, and encrypted `store_tokens` from [`crate::oauth`].

use crate::oauth::{sign_state, store_tokens, urlencode, verify_state, web_redirect, OauthTokens};
use crate::AppState;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use serde::Deserialize;

/// Notion OAuth app config, sourced from the environment. The client secret
/// doubles as the HMAC key for the CSRF state (Notion has no signing secret).
#[derive(Clone)]
pub struct NotionConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub api_base: String,
}

impl NotionConfig {
    pub fn from_env() -> Option<NotionConfig> {
        let nonempty = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
        Some(NotionConfig {
            client_id: nonempty("NOTION_CLIENT_ID")?,
            client_secret: nonempty("NOTION_CLIENT_SECRET")?,
            redirect_uri: nonempty("NOTION_REDIRECT_URI")
                .unwrap_or_else(|| "http://localhost:8787/oauth/notion/callback".into()),
            api_base: nonempty("NOTION_API_BASE").unwrap_or_else(|| "https://api.notion.com".into()),
        })
    }
}

/// Parse a Notion `/v1/oauth/token` response into normalized tokens.
/// Notion tokens never expire and carry no refresh token.
pub fn parse_notion_response(v: &serde_json::Value) -> anyhow::Result<OauthTokens> {
    if let Some(err) = v["error"].as_str() {
        anyhow::bail!("notion oauth error: {err}");
    }
    let access_token = v["access_token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing access_token"))?
        .to_string();
    let team_id = v["workspace_id"].as_str().unwrap_or_default().to_string();
    let scopes = v["workspace_name"].as_str().unwrap_or_default().to_string();
    Ok(OauthTokens {
        access_token,
        refresh_token: None,
        expires_at: None,
        team_id,
        scopes,
    })
}

/// Exchange an authorization code for a token via `/v1/oauth/token` (HTTP Basic auth).
pub async fn exchange_code(cfg: &NotionConfig, code: &str) -> anyhow::Result<OauthTokens> {
    let v: serde_json::Value = reqwest::Client::new()
        .post(format!("{}/v1/oauth/token", cfg.api_base))
        .basic_auth(&cfg.client_id, Some(&cfg.client_secret))
        .json(&serde_json::json!({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": cfg.redirect_uri,
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    parse_notion_response(&v)
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: String,
    pub state: String,
}

/// Redirect the browser to Notion's consent screen with a signed CSRF state.
pub async fn authorize(State(state): State<AppState>) -> Response {
    let Some(cfg) = NotionConfig::from_env() else {
        // Not configured (e.g. connected via static token): bounce back to the UI
        // with an error flash instead of a dead-end page.
        return web_redirect("connect_error=notion");
    };
    let _ = state; // uniform handler signature
    let csrf = sign_state(&cfg.client_secret, chrono::Utc::now().timestamp());
    let url = format!(
        "https://api.notion.com/v1/oauth/authorize?client_id={}&response_type=code&owner=user&redirect_uri={}&state={}",
        urlencode(&cfg.client_id),
        urlencode(&cfg.redirect_uri),
        urlencode(&csrf),
    );
    Redirect::temporary(&url).into_response()
}

/// Handle Notion's redirect back: verify state, exchange the code, store the token.
pub async fn callback(State(state): State<AppState>, Query(q): Query<CallbackQuery>) -> Response {
    let Some(cfg) = NotionConfig::from_env() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "notion oauth not configured").into_response();
    };
    if !verify_state(&cfg.client_secret, &q.state, chrono::Utc::now().timestamp()) {
        return web_redirect("connect_error=notion");
    }
    let tokens = match exchange_code(&cfg, &q.code).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("notion code exchange failed: {e}");
            return web_redirect("connect_error=notion");
        }
    };
    if let Err(e) = store_tokens(&state, "notion", tokens).await {
        tracing::error!("store notion connection failed: {e}");
        return web_redirect("connect_error=notion");
    }
    web_redirect("connected=notion")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ok() {
        let v = serde_json::json!({
            "access_token": "secret_abc",
            "workspace_id": "ws-1",
            "workspace_name": "PennyLane"
        });
        let t = parse_notion_response(&v).unwrap();
        assert_eq!(t.access_token, "secret_abc");
        assert_eq!(t.team_id, "ws-1");
        assert_eq!(t.scopes, "PennyLane");
        assert!(t.refresh_token.is_none());
        assert!(t.expires_at.is_none());
    }

    #[test]
    fn parse_error() {
        let v = serde_json::json!({ "error": "invalid_grant" });
        assert!(parse_notion_response(&v).is_err());
    }
}
