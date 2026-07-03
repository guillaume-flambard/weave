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
