# Slack OAuth + Encrypted Token Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static env Slack token with a real OAuth flow whose tokens are encrypted at rest in Postgres, refreshed automatically when they expire.

**Architecture:** New `crypto` module in `weave-store` (ChaCha20-Poly1305 AEAD, key from `WEAVE_ENC_KEY`). New `connections` table + store methods. New `oauth` module in `weave-api` (stateless HMAC-signed CSRF state, authorize redirect, callback token exchange, refresh). `ingest_slack` reads the stored connection (refreshing on demand) and falls back to the existing env token so the offline demo stays intact. A `POST /connections/slack/import` bridge seeds the DB from `.env` tokens for live testing before the connect UI (chantier 5) exists.

**Tech Stack:** Rust, axum 0.7, sqlx 0.8 (Postgres), reqwest 0.12, chacha20poly1305 0.10, hmac 0.12 + sha2 0.10, base64 0.22, wiremock 0.6 (test).

## Global Constraints

- Edition 2021; use `.workspace = true` deps where a workspace entry exists.
- **Zero compiler warnings.** Gate: `cargo test --workspace -- --test-threads=1` on a clean DB.
- Postgres integration tests gate on `TEST_DATABASE_URL`; return early (skip) when unset — mirror the existing `test_app()` pattern (`let url = std::env::var("TEST_DATABASE_URL").ok()?;`).
- **No plaintext token ever touches disk, a log line, or a client response.** Encrypted columns are `bytea` = 12-byte nonce ‖ AEAD ciphertext.
- Slack API base URL is read from `SLACK_API_BASE` (default `https://slack.com/api`) so tests point it at a wiremock server.
- Single-tenant: one active connection per provider; `team_id` stored but callers use `get_active_connection(provider)`.
- Follow existing patterns: `anyhow::Result`, `tracing` for logs, sqlx `query`/`Row` style from `postgres.rs`.

---

## File Structure

- `crates/weave-store/src/crypto.rs` — **create**. `Cipher` (AEAD encrypt/decrypt), key loading. One responsibility: symmetric encryption of secrets.
- `crates/weave-store/src/connections.rs` — **create**. `NewConnection`, `Connection` types + `PgStore` connection methods. One responsibility: connection persistence.
- `crates/weave-store/src/lib.rs` — **modify**. Export `crypto`, `connections`.
- `crates/weave-store/Cargo.toml` — **modify**. Add `chacha20poly1305`, `base64`.
- `migrations/0005_connections.sql` — **create**. `connections` table.
- `crates/weave-api/src/oauth.rs` — **create**. State CSRF sign/verify, `parse_oauth_response`, authorize/callback/refresh/import handlers, `ensure_fresh`. One responsibility: the Slack OAuth flow.
- `crates/weave-api/src/main.rs` — **modify**. `mod oauth;`, add `cipher` to `AppState`, register routes, rewire `ingest_slack`.
- `crates/weave-api/Cargo.toml` — **modify**. Add `reqwest`, `hmac`, `sha2`, `base64`; dev-dep `wiremock`.
- `.env` — **manual, out of plan** (secrets). See Appendix.

---

## Task 1: Crypto module (`weave-store`)

**Files:**
- Create: `crates/weave-store/src/crypto.rs`
- Modify: `crates/weave-store/Cargo.toml`, `crates/weave-store/src/lib.rs`

**Interfaces:**
- Produces: `weave_store::Cipher` with `Cipher::from_base64(&str) -> anyhow::Result<Cipher>`, `Cipher::from_env() -> anyhow::Result<Cipher>`, `Cipher::encrypt(&self, &str) -> anyhow::Result<Vec<u8>>`, `Cipher::decrypt(&self, &[u8]) -> anyhow::Result<String>`.

- [ ] **Step 1: Add dependencies**

In `crates/weave-store/Cargo.toml` under `[dependencies]` add:

```toml
chacha20poly1305 = "0.10"
base64 = "0.22"
```

- [ ] **Step 2: Write the failing test**

Create `crates/weave-store/src/crypto.rs`:

```rust
//! Symmetric encryption of secrets at rest (ChaCha20-Poly1305 AEAD).
//! Storage layout per value: 12-byte random nonce ‖ ciphertext+tag.

use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};

const NONCE_LEN: usize = 12;

/// An AEAD cipher keyed by a 32-byte master key.
pub struct Cipher {
    inner: ChaCha20Poly1305,
}

impl Cipher {
    /// Build from a base64-encoded 32-byte key.
    pub fn from_base64(b64: &str) -> anyhow::Result<Self> {
        let bytes = STANDARD
            .decode(b64.trim())
            .map_err(|e| anyhow::anyhow!("WEAVE_ENC_KEY not valid base64: {e}"))?;
        if bytes.len() != 32 {
            anyhow::bail!("WEAVE_ENC_KEY must decode to 32 bytes, got {}", bytes.len());
        }
        let inner = ChaCha20Poly1305::new_from_slice(&bytes)
            .map_err(|e| anyhow::anyhow!("bad key: {e}"))?;
        Ok(Cipher { inner })
    }

    /// Build from the `WEAVE_ENC_KEY` environment variable.
    pub fn from_env() -> anyhow::Result<Self> {
        let b64 = std::env::var("WEAVE_ENC_KEY")
            .map_err(|_| anyhow::anyhow!("WEAVE_ENC_KEY not set"))?;
        Self::from_base64(&b64)
    }

    /// Encrypt to `nonce ‖ ciphertext`.
    pub fn encrypt(&self, plaintext: &str) -> anyhow::Result<Vec<u8>> {
        let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
        let ct = self
            .inner
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|e| anyhow::anyhow!("encrypt failed: {e}"))?;
        let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
        out.extend_from_slice(nonce.as_slice());
        out.extend_from_slice(&ct);
        Ok(out)
    }

    /// Decrypt a `nonce ‖ ciphertext` blob. Errors on a bad tag (tamper) or truncation.
    pub fn decrypt(&self, blob: &[u8]) -> anyhow::Result<String> {
        if blob.len() < NONCE_LEN {
            anyhow::bail!("ciphertext too short");
        }
        let (nonce_bytes, ct) = blob.split_at(NONCE_LEN);
        let nonce = Nonce::from_slice(nonce_bytes);
        let pt = self
            .inner
            .decrypt(nonce, ct)
            .map_err(|e| anyhow::anyhow!("decrypt failed: {e}"))?;
        Ok(String::from_utf8(pt)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 32 zero bytes, base64.
    const TEST_KEY: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    #[test]
    fn round_trip() {
        let c = Cipher::from_base64(TEST_KEY).unwrap();
        let blob = c.encrypt("xoxe.xoxp-secret").unwrap();
        assert_eq!(c.decrypt(&blob).unwrap(), "xoxe.xoxp-secret");
    }

    #[test]
    fn nonce_is_unique_per_encrypt() {
        let c = Cipher::from_base64(TEST_KEY).unwrap();
        let a = c.encrypt("same").unwrap();
        let b = c.encrypt("same").unwrap();
        assert_ne!(a, b, "two encryptions of the same plaintext must differ");
    }

    #[test]
    fn tamper_fails() {
        let c = Cipher::from_base64(TEST_KEY).unwrap();
        let mut blob = c.encrypt("secret").unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xff; // flip a ciphertext byte
        assert!(c.decrypt(&blob).is_err());
    }

    #[test]
    fn bad_key_length_rejected() {
        assert!(Cipher::from_base64("AAAA").is_err());
    }
}
```

- [ ] **Step 3: Wire the module**

In `crates/weave-store/src/lib.rs` add `pub mod crypto;` and re-export: `pub use crypto::Cipher;`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p weave-store crypto:: -- --nocapture`
Expected: 4 tests pass, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add crates/weave-store/src/crypto.rs crates/weave-store/src/lib.rs crates/weave-store/Cargo.toml
git commit -m "feat(store): ChaCha20-Poly1305 cipher for secrets at rest"
```

---

## Task 2: `connections` table + store methods (`weave-store`)

**Files:**
- Create: `migrations/0005_connections.sql`, `crates/weave-store/src/connections.rs`
- Modify: `crates/weave-store/src/lib.rs`

**Interfaces:**
- Consumes: `weave_store::Cipher` (Task 1).
- Produces:
  - `weave_store::NewConnection { provider: String, team_id: String, access_token: String, refresh_token: Option<String>, expires_at: Option<DateTime<Utc>>, scopes: String }`
  - `weave_store::Connection { provider: String, team_id: String, access_token: String, refresh_token: Option<String>, expires_at: Option<DateTime<Utc>>, scopes: String, updated_at: DateTime<Utc> }`
  - `PgStore::upsert_connection(&self, cipher: &Cipher, conn: &NewConnection) -> anyhow::Result<()>`
  - `PgStore::get_active_connection(&self, cipher: &Cipher, provider: &str) -> anyhow::Result<Option<Connection>>`

- [ ] **Step 1: Write the migration**

Create `migrations/0005_connections.sql`:

```sql
CREATE TABLE IF NOT EXISTS connections (
    provider      text        NOT NULL,
    team_id       text        NOT NULL,
    access_token  bytea       NOT NULL,
    refresh_token bytea,
    expires_at    timestamptz,
    scopes        text        NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, team_id)
);
```

- [ ] **Step 2: Write the failing test**

Create `crates/weave-store/src/connections.rs`:

```rust
//! Encrypted OAuth connection storage. Tokens are encrypted with `Cipher`
//! before they touch the row and decrypted on read; the DB never sees plaintext.

use crate::crypto::Cipher;
use crate::PgStore;
use chrono::{DateTime, Utc};
use sqlx::Row;

/// A connection to persist (plaintext tokens on the way in).
#[derive(Debug, Clone)]
pub struct NewConnection {
    pub provider: String,
    pub team_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub scopes: String,
}

/// A connection read back (plaintext tokens after decryption). Never serialized to a client.
#[derive(Debug, Clone)]
pub struct Connection {
    pub provider: String,
    pub team_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub scopes: String,
    pub updated_at: DateTime<Utc>,
}

impl PgStore {
    /// Insert or replace the connection for `(provider, team_id)`, encrypting tokens.
    pub async fn upsert_connection(
        &self,
        cipher: &Cipher,
        conn: &NewConnection,
    ) -> anyhow::Result<()> {
        let access = cipher.encrypt(&conn.access_token)?;
        let refresh = match &conn.refresh_token {
            Some(r) => Some(cipher.encrypt(r)?),
            None => None,
        };
        sqlx::query(
            "INSERT INTO connections
                (provider, team_id, access_token, refresh_token, expires_at, scopes, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6, now())
             ON CONFLICT (provider, team_id) DO UPDATE SET
                access_token = EXCLUDED.access_token,
                refresh_token = EXCLUDED.refresh_token,
                expires_at = EXCLUDED.expires_at,
                scopes = EXCLUDED.scopes,
                updated_at = now()",
        )
        .bind(&conn.provider)
        .bind(&conn.team_id)
        .bind(access)
        .bind(refresh)
        .bind(conn.expires_at)
        .bind(&conn.scopes)
        .execute(self.pool())
        .await?;
        Ok(())
    }

    /// The most recently updated connection for `provider`, tokens decrypted.
    pub async fn get_active_connection(
        &self,
        cipher: &Cipher,
        provider: &str,
    ) -> anyhow::Result<Option<Connection>> {
        let row = sqlx::query(
            "SELECT provider, team_id, access_token, refresh_token, expires_at, scopes, updated_at
             FROM connections WHERE provider = $1 ORDER BY updated_at DESC LIMIT 1",
        )
        .bind(provider)
        .fetch_optional(self.pool())
        .await?;

        let Some(row) = row else { return Ok(None) };
        let access_enc: Vec<u8> = row.get("access_token");
        let refresh_enc: Option<Vec<u8>> = row.try_get("refresh_token").ok().flatten();
        let refresh_token = match refresh_enc {
            Some(b) => Some(cipher.decrypt(&b)?),
            None => None,
        };
        Ok(Some(Connection {
            provider: row.get("provider"),
            team_id: row.get("team_id"),
            access_token: cipher.decrypt(&access_enc)?,
            refresh_token,
            expires_at: row.try_get("expires_at").ok().flatten(),
            scopes: row.get("scopes"),
            updated_at: row.get("updated_at"),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::Cipher;
    use sqlx::postgres::PgPoolOptions;

    const TEST_KEY: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    async fn store() -> Option<PgStore> {
        let url = std::env::var("TEST_DATABASE_URL").ok()?;
        let pool = PgPoolOptions::new().max_connections(1).connect(&url).await.ok()?;
        let store = PgStore::from_pool(pool);
        store.migrate().await.ok()?;
        Some(store)
    }

    #[tokio::test]
    async fn upsert_then_read_round_trips() {
        let Some(store) = store().await else { return };
        let cipher = Cipher::from_base64(TEST_KEY).unwrap();
        let team = format!("T{}", uuid::Uuid::new_v4().simple());
        store
            .upsert_connection(
                &cipher,
                &NewConnection {
                    provider: "slack".into(),
                    team_id: team.clone(),
                    access_token: "xoxe.xoxp-access".into(),
                    refresh_token: Some("xoxe-1-refresh".into()),
                    expires_at: None,
                    scopes: "channels:history".into(),
                },
            )
            .await
            .unwrap();

        let got = store.get_active_connection(&cipher, "slack").await.unwrap().unwrap();
        assert_eq!(got.access_token, "xoxe.xoxp-access");
        assert_eq!(got.refresh_token.as_deref(), Some("xoxe-1-refresh"));

        // Row is opaque: raw bytea must not contain the plaintext.
        let raw: Vec<u8> = sqlx::query("SELECT access_token FROM connections WHERE team_id = $1")
            .bind(&team)
            .fetch_one(store.pool())
            .await
            .unwrap()
            .get("access_token");
        assert!(!raw.windows(5).any(|w| w == b"xoxe."), "token stored in clear");
    }
}
```

- [ ] **Step 3: Expose `pool()` on `PgStore`**

The store methods and test need pool access. In `crates/weave-store/src/postgres.rs`, inside `impl PgStore`, add:

```rust
/// Borrow the underlying pool (used by sibling modules like `connections`).
pub fn pool(&self) -> &sqlx::PgPool {
    &self.pool
}
```

- [ ] **Step 4: Wire the module**

In `crates/weave-store/src/lib.rs` add `pub mod connections;` and `pub use connections::{Connection, NewConnection};`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p weave-store connections:: -- --test-threads=1`
Expected: PASS if `TEST_DATABASE_URL` set (else skips), 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add migrations/0005_connections.sql crates/weave-store/src/connections.rs crates/weave-store/src/lib.rs crates/weave-store/src/postgres.rs
git commit -m "feat(store): encrypted connections table + upsert/get"
```

---

## Task 3: OAuth pure logic — CSRF state + response parsing (`weave-api`)

**Files:**
- Create: `crates/weave-api/src/oauth.rs`
- Modify: `crates/weave-api/src/main.rs` (add `mod oauth;`), `crates/weave-api/Cargo.toml`

**Interfaces:**
- Produces:
  - `oauth::sign_state(secret: &str, now_unix: i64) -> String`
  - `oauth::verify_state(secret: &str, state: &str, now_unix: i64) -> bool` (rejects tamper + expiry > 600s)
  - `oauth::OauthTokens { access_token: String, refresh_token: Option<String>, expires_at: Option<DateTime<Utc>>, team_id: String, scopes: String }`
  - `oauth::parse_oauth_response(v: &serde_json::Value, now: DateTime<Utc>) -> anyhow::Result<OauthTokens>`

- [ ] **Step 1: Add dependencies**

In `crates/weave-api/Cargo.toml` under `[dependencies]` add:

```toml
reqwest.workspace = true
hmac = "0.12"
sha2 = "0.10"
base64 = "0.22"
```

And under `[dev-dependencies]` add:

```toml
wiremock = "0.6"
```

- [ ] **Step 2: Write the failing test**

Create `crates/weave-api/src/oauth.rs`:

```rust
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
```

- [ ] **Step 3: Register the module**

In `crates/weave-api/src/main.rs`, near the top with the other module declarations (or just after the `use` block), add:

```rust
mod oauth;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p weave-api oauth::tests -- --nocapture`
Expected: 7 tests pass, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add crates/weave-api/src/oauth.rs crates/weave-api/src/main.rs crates/weave-api/Cargo.toml
git commit -m "feat(api): OAuth CSRF state + response parsing (pure, tested)"
```

---

## Task 4: `AppState.cipher` + Slack config + authorize/callback routes (`weave-api`)

**Files:**
- Modify: `crates/weave-api/src/main.rs`, `crates/weave-api/src/oauth.rs`

**Interfaces:**
- Consumes: `parse_oauth_response`, `sign_state`, `verify_state` (Task 3); `PgStore::upsert_connection`, `NewConnection` (Task 2); `Cipher` (Task 1).
- Produces:
  - `AppState.cipher: std::sync::Arc<weave_store::Cipher>`
  - `oauth::SlackConfig { client_id, client_secret, signing_secret, redirect_uri, scopes, api_base }` with `SlackConfig::from_env() -> Option<SlackConfig>`
  - route `GET /oauth/slack/authorize` → `oauth::authorize`
  - route `GET /oauth/slack/callback` → `oauth::callback`
  - `oauth::exchange_code(cfg: &SlackConfig, code: &str) -> anyhow::Result<OauthTokens>`

- [ ] **Step 1: Add `cipher` to `AppState`**

In `crates/weave-api/src/main.rs`, extend the struct (around line 33):

```rust
#[derive(Clone)]
struct AppState {
    runtime: Arc<Runtime>,
    store: Arc<PgStore>,
    api_key: Option<String>,
    cipher: Arc<weave_store::Cipher>,
}
```

- [ ] **Step 2: Construct the cipher in `main`**

In `main()`, after the store is built and before `AppState` is constructed, add (fail fast if the key is missing/bad):

```rust
let cipher = Arc::new(
    weave_store::Cipher::from_env()
        .map_err(|e| anyhow::anyhow!("WEAVE_ENC_KEY: {e}"))?,
);
```

Add `cipher` to the `AppState { .. }` literal used for `build_app`.

- [ ] **Step 3: Update the test harness**

In `crates/weave-api/src/main.rs` `test_app()` (around line 839), set a fixed key before constructing the cipher and add it to `AppState`:

```rust
let cipher = Arc::new(
    weave_store::Cipher::from_base64("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=").unwrap(),
);
Some(build_app(AppState {
    runtime,
    store,
    api_key: None,
    cipher,
}))
```

- [ ] **Step 4: Add `SlackConfig` and `exchange_code` to `oauth.rs`**

Append to `crates/weave-api/src/oauth.rs`:

```rust
use crate::AppState;
use axum::extract::{Query, State};
use axum::http::StatusCode;
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
        return (StatusCode::SERVICE_UNAVAILABLE, "slack oauth not configured").into_response();
    };
    let _ = state; // AppState kept for a uniform handler signature
    let csrf = sign_state(&cfg.signing_secret, Utc::now().timestamp());
    let url = format!(
        "https://slack.com/oauth/v2/authorize?client_id={}&scope={}&redirect_uri={}&state={}",
        urlencode(&cfg.client_id),
        urlencode(&cfg.scopes),
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
        return (StatusCode::BAD_REQUEST, "invalid state").into_response();
    }
    let tokens = match exchange_code(&cfg, &q.code).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("slack code exchange failed: {e}");
            return (StatusCode::BAD_GATEWAY, "slack code exchange failed").into_response();
        }
    };
    if let Err(e) = store_tokens(&state, tokens).await {
        tracing::error!("store slack connection failed: {e}");
        return (StatusCode::INTERNAL_SERVER_ERROR, "could not store connection").into_response();
    }
    (StatusCode::OK, "Slack connected. You can close this tab.").into_response()
}

/// Persist normalized tokens as the active Slack connection.
pub(crate) async fn store_tokens(state: &AppState, t: OauthTokens) -> anyhow::Result<()> {
    state
        .store
        .upsert_connection(
            &state.cipher,
            &NewConnection {
                provider: "slack".into(),
                team_id: if t.team_id.is_empty() { "default".into() } else { t.team_id },
                access_token: t.access_token,
                refresh_token: t.refresh_token,
                expires_at: t.expires_at,
                scopes: t.scopes,
            },
        )
        .await
}

fn urlencode(s: &str) -> String {
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
```

- [ ] **Step 5: Register the routes**

In `crates/weave-api/src/main.rs` `build_app` router chain (near line 156), add:

```rust
        .route("/oauth/slack/authorize", get(oauth::authorize))
        .route("/oauth/slack/callback", get(oauth::callback))
```

- [ ] **Step 6: Write the callback integration test**

Add to the `tests` module in `crates/weave-api/src/main.rs` (uses wiremock to stand in for Slack). Requires `TEST_DATABASE_URL`:

```rust
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

    let state = crate::oauth::sign_state("ssecret", chrono::Utc::now().timestamp());
    let uri = format!("/oauth/slack/callback?code=abc&state={state}");
    let resp = app
        .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
}
```

- [ ] **Step 7: Run tests**

Run: `cargo test -p weave-api -- --test-threads=1`
Expected: PASS (callback test skips without `TEST_DATABASE_URL`), 0 warnings.

- [ ] **Step 8: Commit**

```bash
git add crates/weave-api/src/oauth.rs crates/weave-api/src/main.rs
git commit -m "feat(api): Slack OAuth authorize + callback with encrypted storage"
```

---

## Task 5: Token refresh (`ensure_fresh`) (`weave-api`)

**Files:**
- Modify: `crates/weave-api/src/oauth.rs`, `crates/weave-api/src/main.rs` (test)

**Interfaces:**
- Consumes: `SlackConfig`, `store_tokens`, `parse_oauth_response` (Task 4); `Connection` (Task 2).
- Produces: `oauth::ensure_fresh(state: &AppState, cfg: &SlackConfig, conn: Connection) -> anyhow::Result<Connection>`

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `main.rs`:

```rust
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
```

Add a small test helper near `test_app` in the `tests` module (reuses the stubs):

```rust
fn dummy_runtime(store: Arc<PgStore>) -> Arc<Runtime> {
    Arc::new(Runtime::new(store, Arc::new(StubLlm), Arc::new(StubEmbedder), 5))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p weave-api ensure_fresh_refreshes_expired_token -- --test-threads=1`
Expected: FAIL — `ensure_fresh` not found.

- [ ] **Step 3: Implement `ensure_fresh` + `refresh_token` call**

Append to `crates/weave-api/src/oauth.rs`:

```rust
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
    store_tokens(state, tokens.clone()).await?;

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
```

Make `OauthTokens` cloneable — it is already `#[derive(Debug, Clone)]` from Task 3.

- [ ] **Step 4: Run tests**

Run: `cargo test -p weave-api -- --test-threads=1`
Expected: PASS (refresh test skips without `TEST_DATABASE_URL`), 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add crates/weave-api/src/oauth.rs crates/weave-api/src/main.rs
git commit -m "feat(api): refresh expired Slack tokens on demand"
```

---

## Task 6: Import bridge route (`weave-api`)

**Files:**
- Modify: `crates/weave-api/src/oauth.rs`, `crates/weave-api/src/main.rs`

**Interfaces:**
- Consumes: `store_tokens`, `SlackConfig` (Task 4).
- Produces: route `POST /connections/slack/import` → `oauth::import_from_env`.

- [ ] **Step 1: Implement the import handler**

Append to `crates/weave-api/src/oauth.rs`:

```rust
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
    body: Option<Json<ImportBody>>,
) -> Response {
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
    if let Err(e) = store_tokens(&state, tokens).await {
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
```

- [ ] **Step 2: Register the route**

In `build_app` (near the other routes), add:

```rust
        .route("/connections/slack/import", post(oauth::import_from_env))
```

- [ ] **Step 3: Write the integration test**

Add to the `tests` module in `main.rs`:

```rust
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
```

- [ ] **Step 4: Run tests**

Run: `cargo test -p weave-api -- --test-threads=1`
Expected: PASS (skips without `TEST_DATABASE_URL`), 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add crates/weave-api/src/oauth.rs crates/weave-api/src/main.rs
git commit -m "feat(api): import Slack tokens from env for live testing"
```

---

## Task 7: Wire `ingest_slack` to stored connection (`weave-api`)

**Files:**
- Modify: `crates/weave-api/src/main.rs`

**Interfaces:**
- Consumes: `PgStore::get_active_connection` (Task 2), `oauth::SlackConfig`, `oauth::ensure_fresh` (Tasks 4–5).

- [ ] **Step 1: Rewrite the token resolution in `ingest_slack`**

Replace the token/channel resolution block at the top of `ingest_slack` (currently the `SLACK_BOT_TOKEN`/`SLACK_CHANNEL` lookup, `crates/weave-api/src/main.rs:454-460`) with a stored-connection-first resolution:

```rust
    let project = project_of(&q);
    let channel = std::env::var("SLACK_CHANNEL").ok().filter(|c| !c.trim().is_empty());

    // 1. Prefer a stored OAuth connection (refresh if expiring).
    let token = match state.store.get_active_connection(&state.cipher, "slack").await {
        Ok(Some(conn)) => match oauth::SlackConfig::from_env() {
            Some(cfg) => match oauth::ensure_fresh(&state, &cfg, conn).await {
                Ok(fresh) => Some(fresh.access_token),
                Err(e) => return Err(AppError::from(e)),
            },
            None => Some(conn.access_token), // static token, no refresh possible
        },
        Ok(None) => None,
        Err(e) => return Err(AppError::from(e)),
    };
    // 2. Fall back to the legacy env token (keeps the offline demo working).
    let token = token.or_else(|| {
        std::env::var("SLACK_BOT_TOKEN").ok().filter(|t| !t.trim().is_empty())
    });

    let (Some(token), Some(channel)) = (token, channel) else {
        return Ok(Json(json!({
            "status": "not_configured",
            "hint": "connect Slack (POST /connections/slack/import or /oauth/slack/authorize) and set SLACK_CHANNEL"
        })));
    };
```

Leave the rest of `ingest_slack` (the `SlackConnector::new(...).poll()` and spawn) unchanged. Note `project` is now bound earlier — delete the later duplicate `let project = project_of(&q);` line further down in the handler.

- [ ] **Step 2: Confirm `AppError: From<anyhow::Error>` exists**

Check `crates/weave-api/src/main.rs` for the existing `AppError` and its `From<anyhow::Error>` impl (the handler already returns `Result<_, AppError>` and uses `?` on `connector.poll()`). If `AppError::from(e)` does not compile, use `?` on the calls instead (e.g. `let conn = state.store.get_active_connection(...).await?;`). Prefer `?` where the surrounding code already uses it.

- [ ] **Step 3: Build + run the full suite**

Run: `cargo test --workspace -- --test-threads=1`
Expected: all tests pass on a clean DB, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add crates/weave-api/src/main.rs
git commit -m "feat(api): ingest_slack uses stored connection, refreshes on demand"
```

---

## Task 8: Live smoke test + docs

**Files:**
- Modify: `docs/RESUME-connecteur-notion.md` (or a fresh resume), connector config docs if present.

- [ ] **Step 1: Configure `.env`** (see Appendix — manual, secrets). Generate the key:

```bash
openssl rand -base64 32   # paste as WEAVE_ENC_KEY
```

- [ ] **Step 2: Run the API + live import + ingest**

```bash
cargo run -p weave-api &
curl -sX POST localhost:8787/connections/slack/import -H 'content-type: application/json' -d '{}'   # -> {"status":"imported"}
curl -sX POST localhost:8787/ingest/slack                                                            # -> {"status":"ingesting",...}
```

Expected: import returns `imported`; ingest returns `ingesting` with a non-zero event count (requires `SLACK_CHANNEL` set and the bot in that channel).

- [ ] **Step 3: Verify tokens are encrypted at rest**

```bash
psql "$DATABASE_URL" -c "SELECT provider, team_id, length(access_token) FROM connections;"
```

Expected: a `slack` row; `access_token` is bytea (no readable `xoxe.` prefix).

- [ ] **Step 4: Update the arc resume**

Mark chantier 4 done, note chantier 5 (connect UI) next. Commit:

```bash
git add docs/
git commit -m "docs: chantier 4 done — Slack OAuth + encrypted tokens live"
```

---

## Self-Review

**Spec coverage:**
- §1 migration → Task 2 ✓
- §2 crypto → Task 1 ✓
- §3 store methods → Task 2 ✓
- §4 authorize/callback + state CSRF → Tasks 3, 4 ✓
- §5 refresh → Task 5 ✓
- §6 import bridge → Task 6 ✓
- §7 ingest wiring + fallback → Task 7 ✓
- Tests (crypto, parse, state, callback, refresh, store) → Tasks 1–6 ✓
- Live smoke + encrypted-at-rest proof → Task 8 ✓

**Type consistency:** `Cipher`, `NewConnection`, `Connection`, `OauthTokens`, `SlackConfig`, `sign_state`/`verify_state`, `parse_oauth_response`, `exchange_code`, `ensure_fresh`, `store_tokens`, `auth_test` — names and signatures consistent across tasks. `PgStore::pool()` added in Task 2 for sibling-module access.

**Known debt carried:** Postgres tests are not parallel-safe → `--test-threads=1` + clean DB (documented). `poll()` live branch still untested by automation (network) — Task 8 covers it manually.

---

## Appendix — `.env` keys (manual, secrets; never commit)

```
WEAVE_ENC_KEY=<openssl rand -base64 32>
SLACK_CLIENT_ID=<from api.slack.com Basic Information>
SLACK_CLIENT_SECRET=<Basic Information>
SLACK_SIGNING_SECRET=<Basic Information>
SLACK_REDIRECT_URI=http://localhost:8787/oauth/slack/callback
SLACK_OAUTH_SCOPES=channels:history,groups:history,users:read
SLACK_CHANNEL=<channel id the bot is in>
SLACK_ACCESS_TOKEN=<xoxe.xoxp-… for import bridge>
SLACK_REFRESH_TOKEN=<xoxe-1-… for import bridge>
```

Regenerate all Slack secrets after the demo — they were exposed in a chat transcript.
