//! Real semantic embeddings via Ollama (`nomic-embed-text`, 768-dim). Local, no
//! API key. Falls back to the deterministic hash embedder if Ollama is
//! unreachable so the pipeline never stalls.

use crate::{EmbeddingGateway, HashEmbedder};
use async_trait::async_trait;
use serde_json::json;
use std::time::Duration;
use weave_core::EMBEDDING_DIM;

pub struct OllamaEmbedder {
    client: reqwest::Client,
    base_url: String,
    model: String,
}

impl OllamaEmbedder {
    pub fn new(base_url: impl Into<String>, model: impl Into<String>) -> Self {
        OllamaEmbedder {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(60))
                .build()
                .unwrap_or_default(),
            base_url: base_url.into(),
            model: model.into(),
        }
    }
}

#[async_trait]
impl EmbeddingGateway for OllamaEmbedder {
    async fn embed(&self, text: &str) -> anyhow::Result<Vec<f32>> {
        let res = self
            .client
            .post(format!("{}/api/embeddings", self.base_url))
            .json(&json!({ "model": self.model, "prompt": text }))
            .send()
            .await
            .and_then(|r| r.error_for_status());

        match res {
            Ok(resp) => {
                let v: serde_json::Value = resp.json().await?;
                let emb: Vec<f32> = v["embedding"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|x| x.as_f64().map(|f| f as f32)).collect())
                    .unwrap_or_default();
                if emb.len() == EMBEDDING_DIM {
                    Ok(emb)
                } else {
                    tracing::warn!(
                        "Ollama embed returned {} dims (want {EMBEDDING_DIM}); using hash",
                        emb.len()
                    );
                    Ok(HashEmbedder::embed_sync(text))
                }
            }
            Err(e) => {
                tracing::warn!("Ollama embed failed ({e}); using hash");
                Ok(HashEmbedder::embed_sync(text))
            }
        }
    }
}
