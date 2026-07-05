//! Discord OAuth (bot-install flow), mirroring `notion_oauth`. The tenant
//! authorizes the Weave bot into their guild; we persist the returned `guild.id`
//! as the connection's `team_id`. Message reads later use the global bot token,
//! not the token stored here. Access tokens are not refreshed (bot reads don't
//! need them), so `expires_at` is left `None`.

use crate::oauth::{sign_state, store_tokens, urlencode, verify_state, web_redirect, OauthTokens};
use crate::AppState;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use serde::Deserialize;

// VIEW_CHANNEL (1024) | READ_MESSAGE_HISTORY (65536)
const READ_PERMISSIONS: &str = "66560";

/// Discord OAuth app config from env. `client_secret` doubles as the HMAC key
/// for the CSRF state (mirrors Notion). Absent creds => feature disabled.
#[derive(Clone)]
pub struct DiscordConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub bot_token: String,
    pub api_base: String,
}

impl DiscordConfig {
    pub fn from_env() -> Option<DiscordConfig> {
        let nonempty = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
        Some(DiscordConfig {
            client_id: nonempty("DISCORD_CLIENT_ID")?,
            client_secret: nonempty("DISCORD_CLIENT_SECRET")?,
            redirect_uri: nonempty("DISCORD_REDIRECT_URI")
                .unwrap_or_else(|| "http://localhost:8787/oauth/discord/callback".into()),
            bot_token: nonempty("DISCORD_BOT_TOKEN")?,
            api_base: nonempty("DISCORD_API_BASE").unwrap_or_else(|| "https://discord.com/api/v10".into()),
        })
    }
}

/// Parse Discord's `/oauth2/token` response. `team_id` = installed `guild.id`.
/// Tokens are not refreshed here, so `expires_at` stays `None`.
pub fn parse_discord_response(v: &serde_json::Value) -> anyhow::Result<OauthTokens> {
    if let Some(err) = v["error"].as_str() {
        anyhow::bail!("discord oauth error: {err}");
    }
    let access_token = v["access_token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing access_token"))?
        .to_string();
    let team_id = v["guild"]["id"].as_str().unwrap_or_default().to_string();
    let scopes = v["scope"].as_str().unwrap_or_default().to_string();
    Ok(OauthTokens {
        access_token,
        refresh_token: v["refresh_token"].as_str().map(str::to_string),
        expires_at: None,
        team_id,
        scopes,
    })
}

/// Exchange an auth code for tokens via `/oauth2/token` (HTTP Basic client auth).
pub async fn exchange_code(cfg: &DiscordConfig, code: &str) -> anyhow::Result<OauthTokens> {
    let v: serde_json::Value = reqwest::Client::new()
        .post(format!("{}/oauth2/token", cfg.api_base))
        .basic_auth(&cfg.client_id, Some(&cfg.client_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", cfg.redirect_uri.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    parse_discord_response(&v)
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: String,
    pub state: String,
}

/// Redirect to Discord's "Add to Server" consent with a signed CSRF state.
pub async fn authorize(State(state): State<AppState>) -> Response {
    let Some(cfg) = DiscordConfig::from_env() else {
        return web_redirect("connect_error=discord");
    };
    let _ = state; // uniform handler signature
    let csrf = sign_state(&cfg.client_secret, chrono::Utc::now().timestamp());
    let url = format!(
        "https://discord.com/oauth2/authorize?client_id={}&scope={}&permissions={}&response_type=code&redirect_uri={}&state={}",
        urlencode(&cfg.client_id),
        urlencode("bot applications.commands"),
        READ_PERMISSIONS,
        urlencode(&cfg.redirect_uri),
        urlencode(&csrf),
    );
    Redirect::temporary(&url).into_response()
}

/// Discord's redirect back: verify state, exchange code, persist the guild.
pub async fn callback(State(state): State<AppState>, Query(q): Query<CallbackQuery>) -> Response {
    let Some(cfg) = DiscordConfig::from_env() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "discord oauth not configured").into_response();
    };
    if !verify_state(&cfg.client_secret, &q.state, chrono::Utc::now().timestamp()) {
        return web_redirect("connect_error=discord");
    }
    let tokens = match exchange_code(&cfg, &q.code).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("discord code exchange failed: {e}");
            return web_redirect("connect_error=discord");
        }
    };
    if let Err(e) = store_tokens(&state, "discord", tokens).await {
        tracing::error!("store discord connection failed: {e}");
        return web_redirect("connect_error=discord");
    }
    web_redirect("connected=discord")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ok_takes_guild_id_as_team() {
        let v = serde_json::json!({
            "access_token": "disc_abc",
            "scope": "bot applications.commands",
            "guild": { "id": "G123", "name": "Blue Owl" }
        });
        let t = parse_discord_response(&v).unwrap();
        assert_eq!(t.access_token, "disc_abc");
        assert_eq!(t.team_id, "G123");
        assert_eq!(t.scopes, "bot applications.commands");
        assert!(t.expires_at.is_none());
    }

    #[test]
    fn parse_error_bails() {
        let v = serde_json::json!({ "error": "invalid_grant" });
        assert!(parse_discord_response(&v).is_err());
    }
}
