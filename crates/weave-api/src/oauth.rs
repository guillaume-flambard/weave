//! Slack OAuth v2 flow: stateless CSRF state, code exchange, refresh, import.
//! Pure helpers (`sign_state`, `verify_state`, `parse_oauth_response`) are unit
//! tested offline; the network paths are tested against a wiremock server.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

const STATE_TTL_SECS: i64 = 600;

/// `<nonce>.<exp>.<sig>` where sig = HMAC-SHA256(secret, "<nonce>.<exp>"), base64url.
pub fn sign_state(secret: &str, now_unix: i64) -> String {
    let nonce = format!("{now_unix:x}"); // deterministic, non-secret; sig provides the CSRF guarantee
    let exp = now_unix + STATE_TTL_SECS;
    let payload = format!("{nonce}.{exp}");
    let sig = sign(secret, &payload);
    format!("{payload}.{sig}")
}

pub fn verify_state(secret: &str, state: &str, now_unix: i64) -> bool {
    let parts: Vec<&str> = state.split('.').collect();
    if parts.len() != 3 {
        return false;
    }
    let (nonce, exp, sig) = (parts[0], parts[1], parts[2]);
    let Ok(sig_bytes) = URL_SAFE_NO_PAD.decode(sig) else {
        return false;
    };
    let payload = format!("{nonce}.{exp}");
    // Constant-time HMAC verification (avoids a timing side-channel on the CSRF sig).
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac accepts any key len");
    mac.update(payload.as_bytes());
    if mac.verify_slice(&sig_bytes).is_err() {
        return false;
    }
    let Ok(exp) = exp.parse::<i64>() else { return false };
    now_unix <= exp
}

fn sign(secret: &str, payload: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac accepts any key len");
    mac.update(payload.as_bytes());
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

/// Normalized tokens extracted from a Slack `oauth.v2.access` response.
#[derive(Debug, Clone)]
pub struct OauthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub team_id: String,
    pub scopes: String,
}

/// Parse a Slack `oauth.v2.access` JSON body. Errors when `ok` is not true.
pub fn parse_oauth_response(v: &serde_json::Value, now: DateTime<Utc>) -> anyhow::Result<OauthTokens> {
    if v["ok"].as_bool() != Some(true) {
        anyhow::bail!("slack oauth error: {}", v["error"]);
    }
    // Prefer the user token (authed_user) when present — it reads the connected
    // user's own channels without inviting a bot. Fall back to the bot token.
    let user = &v["authed_user"];
    let has_user = user["access_token"].as_str().is_some();
    let pick = |field: &str| -> Option<String> {
        if has_user {
            user[field].as_str().map(str::to_string)
        } else {
            v[field].as_str().map(str::to_string)
        }
    };
    let access_token = pick("access_token")
        .or_else(|| v["access_token"].as_str().map(str::to_string))
        .ok_or_else(|| anyhow::anyhow!("missing access_token"))?;
    let refresh_token = pick("refresh_token");
    let expires_at = if has_user { user["expires_in"].as_i64() } else { v["expires_in"].as_i64() }
        // 1s..10y: reject a malicious/garbage value that would overflow the datetime add.
        .filter(|s| (1..=315_360_000).contains(s))
        .map(|s| now + Duration::seconds(s));
    let team_id = v["team"]["id"].as_str().unwrap_or_default().to_string();
    let scopes = pick("scope")
        .filter(|s| !s.is_empty())
        .or_else(|| v["scope"].as_str().map(str::to_string))
        .unwrap_or_default();
    Ok(OauthTokens { access_token, refresh_token, expires_at, team_id, scopes })
}

use crate::AppState;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use serde::Deserialize;
use weave_store::NewConnection;

/// Slack OAuth app config, sourced from the environment.
#[derive(Clone)]
pub struct SlackConfig {
    pub client_id: String,
    pub client_secret: String,
    pub signing_secret: String,
    pub redirect_uri: String,
    pub scopes: String,
    pub user_scopes: String,
    pub api_base: String,
}

impl SlackConfig {
    /// Present only when the required app credentials are configured.
    pub fn from_env() -> Option<SlackConfig> {
        let nonempty = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
        Some(SlackConfig {
            client_id: nonempty("SLACK_CLIENT_ID")?,
            client_secret: nonempty("SLACK_CLIENT_SECRET")?,
            signing_secret: nonempty("SLACK_SIGNING_SECRET")?,
            redirect_uri: nonempty("SLACK_REDIRECT_URI")
                .unwrap_or_else(|| "http://localhost:8787/oauth/slack/callback".into()),
            scopes: nonempty("SLACK_OAUTH_SCOPES")
                .unwrap_or_else(|| "channels:history,groups:history,users:read".into()),
            user_scopes: nonempty("SLACK_USER_SCOPES")
                .unwrap_or_else(|| "channels:history,channels:read,groups:history,users:read".into()),
            api_base: nonempty("SLACK_API_BASE").unwrap_or_else(|| "https://slack.com/api".into()),
        })
    }
}

/// Exchange an authorization code for tokens via `oauth.v2.access`.
pub async fn exchange_code(cfg: &SlackConfig, code: &str) -> anyhow::Result<OauthTokens> {
    let v: serde_json::Value = reqwest::Client::new()
        .post(format!("{}/oauth.v2.access", cfg.api_base))
        .form(&[
            ("client_id", cfg.client_id.as_str()),
            ("client_secret", cfg.client_secret.as_str()),
            ("code", code),
            ("redirect_uri", cfg.redirect_uri.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    parse_oauth_response(&v, Utc::now())
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: String,
    pub state: String,
}

/// Redirect the browser to Slack's consent screen with a signed CSRF state.
pub async fn authorize(State(state): State<AppState>) -> Response {
    let Some(cfg) = SlackConfig::from_env() else {
        return web_redirect("connect_error=slack");
    };
    let _ = state; // AppState kept for a uniform handler signature
    let csrf = sign_state(&cfg.signing_secret, Utc::now().timestamp());
    let url = format!(
        "https://slack.com/oauth/v2/authorize?client_id={}&scope={}&user_scope={}&redirect_uri={}&state={}",
        urlencode(&cfg.client_id),
        urlencode(&cfg.scopes),
        urlencode(&cfg.user_scopes),
        urlencode(&cfg.redirect_uri),
        urlencode(&csrf),
    );
    Redirect::temporary(&url).into_response()
}

/// Handle Slack's redirect back: verify state, exchange the code, store tokens.
pub async fn callback(State(state): State<AppState>, Query(q): Query<CallbackQuery>) -> Response {
    let Some(cfg) = SlackConfig::from_env() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "slack oauth not configured").into_response();
    };
    if !verify_state(&cfg.signing_secret, &q.state, Utc::now().timestamp()) {
        return web_redirect("connect_error=slack");
    }
    let tokens = match exchange_code(&cfg, &q.code).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("slack code exchange failed: {e}");
            return web_redirect("connect_error=slack");
        }
    };
    if let Err(e) = store_tokens(&state, "slack", tokens).await {
        tracing::error!("store slack connection failed: {e}");
        return web_redirect("connect_error=slack");
    }
    web_redirect("connected=slack")
}

/// Redirect the browser back to the web app's sources view after an OAuth attempt.
pub(crate) fn web_redirect(param: &str) -> Response {
    let web = std::env::var("WEAVE_WEB_URL").unwrap_or_else(|_| "http://localhost:3200".into());
    Redirect::to(&format!("{web}/?cmd=sources&{param}")).into_response()
}

/// Persist normalized tokens as the active connection for `provider`.
pub(crate) async fn store_tokens(
    state: &AppState,
    provider: &str,
    t: OauthTokens,
) -> anyhow::Result<()> {
    state
        .store
        .upsert_connection(
            &state.cipher,
            &NewConnection {
                provider: provider.into(),
                team_id: if t.team_id.is_empty() { "default".into() } else { t.team_id },
                access_token: t.access_token,
                refresh_token: t.refresh_token,
                expires_at: t.expires_at,
                scopes: t.scopes,
            },
        )
        .await
}

use weave_store::Connection;

const REFRESH_MARGIN_SECS: i64 = 60;

/// Return `conn` unchanged when its token is static or still valid; otherwise
/// refresh via `oauth.v2.access` (grant_type=refresh_token), persist, and return it.
pub async fn ensure_fresh(
    state: &AppState,
    cfg: &SlackConfig,
    conn: Connection,
) -> anyhow::Result<Connection> {
    let needs_refresh = match conn.expires_at {
        None => false, // static token: never expires
        Some(exp) => exp <= Utc::now() + chrono::Duration::seconds(REFRESH_MARGIN_SECS),
    };
    if !needs_refresh {
        return Ok(conn);
    }
    let refresh = conn
        .refresh_token
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("token expired but no refresh_token stored"))?;

    let v: serde_json::Value = reqwest::Client::new()
        .post(format!("{}/oauth.v2.access", cfg.api_base))
        .form(&[
            ("client_id", cfg.client_id.as_str()),
            ("client_secret", cfg.client_secret.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let mut tokens = parse_oauth_response(&v, Utc::now())?;
    if tokens.team_id.is_empty() {
        tokens.team_id = conn.team_id.clone();
    }
    // Slack may omit a new refresh_token; keep the old one.
    if tokens.refresh_token.is_none() {
        tokens.refresh_token = conn.refresh_token.clone();
    }
    store_tokens(state, "slack", tokens.clone()).await?;

    Ok(Connection {
        provider: conn.provider,
        team_id: if tokens.team_id.is_empty() { conn.team_id } else { tokens.team_id },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
        scopes: if tokens.scopes.is_empty() { conn.scopes } else { tokens.scopes },
        updated_at: Utc::now(),
    })
}

pub(crate) fn urlencode(s: &str) -> String {
    // Minimal application/x-www-form-urlencoded for query values.
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

use axum::Json;

#[derive(Deserialize, Default)]
pub struct ImportBody {
    /// Optional lifetime in seconds; when set, forces the refresh path to be exercised.
    #[serde(default)]
    pub expires_in: Option<i64>,
}

/// Seed the Slack connection from `SLACK_ACCESS_TOKEN`/`SLACK_REFRESH_TOKEN` in the
/// environment, validating the token with `auth.test`. Bridges live testing before
/// the connect UI exists.
pub async fn import_from_env(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Option<Json<ImportBody>>,
) -> Response {
    if let Err(err) = crate::require_api_key(&state, &headers) {
        return err.into_response();
    }
    let Some(cfg) = SlackConfig::from_env() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "slack oauth not configured").into_response();
    };
    let nonempty = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
    let Some(access) = nonempty("SLACK_ACCESS_TOKEN") else {
        return (StatusCode::BAD_REQUEST, "SLACK_ACCESS_TOKEN not set").into_response();
    };
    let refresh = nonempty("SLACK_REFRESH_TOKEN");
    let expires_in = body.and_then(|b| b.0.expires_in);

    // Validate + resolve team_id via auth.test.
    let team_id = match auth_test(&cfg, &access).await {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("slack auth.test failed: {e}");
            return (StatusCode::BAD_GATEWAY, "slack token rejected by auth.test").into_response();
        }
    };

    let tokens = OauthTokens {
        access_token: access,
        refresh_token: refresh,
        expires_at: expires_in.map(|s| Utc::now() + chrono::Duration::seconds(s)),
        team_id,
        scopes: cfg.scopes.clone(),
    };
    if let Err(e) = store_tokens(&state, "slack", tokens).await {
        tracing::error!("store imported slack connection failed: {e}");
        return (StatusCode::INTERNAL_SERVER_ERROR, "could not store connection").into_response();
    }
    (StatusCode::OK, axum::Json(serde_json::json!({"status": "imported"}))).into_response()
}

/// Resolve the workspace id for a token; also validates the token is live.
pub(crate) async fn auth_test(cfg: &SlackConfig, token: &str) -> anyhow::Result<String> {
    let v: serde_json::Value = reqwest::Client::new()
        .post(format!("{}/auth.test", cfg.api_base))
        .bearer_auth(token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if v["ok"].as_bool() != Some(true) {
        anyhow::bail!("auth.test error: {}", v["error"]);
    }
    Ok(v["team_id"].as_str().unwrap_or("default").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn state_round_trips() {
        let s = sign_state("signing-secret", 1_000);
        assert!(verify_state("signing-secret", &s, 1_100));
    }

    #[test]
    fn state_rejects_wrong_secret() {
        let s = sign_state("signing-secret", 1_000);
        assert!(!verify_state("other-secret", &s, 1_100));
    }

    #[test]
    fn state_rejects_expired() {
        let s = sign_state("signing-secret", 1_000);
        assert!(!verify_state("signing-secret", &s, 1_000 + STATE_TTL_SECS + 1));
    }

    #[test]
    fn state_rejects_tamper() {
        let mut s = sign_state("signing-secret", 1_000);
        s.push('x');
        assert!(!verify_state("signing-secret", &s, 1_100));
    }

    #[test]
    fn parse_full_response() {
        let now = Utc::now();
        let v = json!({
            "ok": true,
            "access_token": "xoxe.xoxp-a",
            "refresh_token": "xoxe-1-r",
            "expires_in": 43200,
            "team": {"id": "T123"},
            "scope": "channels:history,users:read"
        });
        let t = parse_oauth_response(&v, now).unwrap();
        assert_eq!(t.access_token, "xoxe.xoxp-a");
        assert_eq!(t.refresh_token.as_deref(), Some("xoxe-1-r"));
        assert_eq!(t.team_id, "T123");
        assert!(t.expires_at.is_some());
    }

    #[test]
    fn parse_prefers_user_token_when_present() {
        let now = Utc::now();
        let v = json!({
            "ok": true,
            "access_token": "xoxb-bot",
            "scope": "incoming-webhook",
            "team": {"id": "T9"},
            "authed_user": { "access_token": "xoxp-user", "scope": "channels:history,channels:read" }
        });
        let t = parse_oauth_response(&v, now).unwrap();
        assert_eq!(t.access_token, "xoxp-user"); // user token wins
        assert_eq!(t.scopes, "channels:history,channels:read");
        assert_eq!(t.team_id, "T9");
    }

    #[test]
    fn parse_static_token_no_expiry() {
        let v = json!({"ok": true, "access_token": "xoxb-s", "team": {"id": "T1"}, "scope": ""});
        let t = parse_oauth_response(&v, Utc::now()).unwrap();
        assert!(t.expires_at.is_none());
        assert!(t.refresh_token.is_none());
    }

    #[test]
    fn parse_error_response() {
        let v = json!({"ok": false, "error": "invalid_code"});
        assert!(parse_oauth_response(&v, Utc::now()).is_err());
    }
}
