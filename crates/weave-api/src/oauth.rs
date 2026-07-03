//! Slack OAuth v2 flow: stateless CSRF state, code exchange, refresh, import.
//! Pure helpers (`sign_state`, `verify_state`, `parse_oauth_response`) are unit
//! tested offline; the network paths are tested against a wiremock server.

#![allow(dead_code)] // items are consumed by Tasks 4-6 (authorize/callback/refresh/import); remove when wired

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
    let payload = format!("{nonce}.{exp}");
    if sign(secret, &payload) != sig {
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
    let access_token = v["access_token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing access_token"))?
        .to_string();
    let refresh_token = v["refresh_token"].as_str().map(|s| s.to_string());
    let expires_at = v["expires_in"]
        .as_i64()
        .filter(|s| *s > 0)
        .map(|s| now + Duration::seconds(s));
    let team_id = v["team"]["id"].as_str().unwrap_or_default().to_string();
    let scopes = v["scope"].as_str().unwrap_or_default().to_string();
    Ok(OauthTokens { access_token, refresh_token, expires_at, team_id, scopes })
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
