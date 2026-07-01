//! Deterministic, dependency-free embedder for the MVP.
//!
//! It hashes word unigrams and bigrams into a fixed-width vector and
//! L2-normalizes. This is not a semantic model, but it is *real* — cosine
//! similarity clusters lexically-related text well enough to drive pattern
//! detection in the demo, runs offline, and needs no model download. Swap in
//! `fastembed` / Voyage / Jina later behind the same [`EmbeddingGateway`] trait.

use crate::EmbeddingGateway;
use async_trait::async_trait;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use weave_core::EMBEDDING_DIM;

#[derive(Debug, Clone, Default)]
pub struct HashEmbedder;

impl HashEmbedder {
    pub fn new() -> Self {
        HashEmbedder
    }

    fn bucket(token: &str) -> usize {
        let mut h = DefaultHasher::new();
        token.hash(&mut h);
        (h.finish() as usize) % EMBEDDING_DIM
    }

    pub fn embed_sync(text: &str) -> Vec<f32> {
        let words: Vec<String> = text
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { ' ' })
            .collect::<String>()
            .split_whitespace()
            .filter(|w| w.len() > 1)
            .map(str::to_string)
            .collect();

        let mut v = vec![0.0f32; EMBEDDING_DIM];
        for w in &words {
            v[Self::bucket(w)] += 1.0;
        }
        for pair in words.windows(2) {
            let bigram = format!("{}_{}", pair[0], pair[1]);
            v[Self::bucket(&bigram)] += 1.0;
        }

        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for x in &mut v {
                *x /= norm;
            }
        }
        v
    }
}

#[async_trait]
impl EmbeddingGateway for HashEmbedder {
    async fn embed(&self, text: &str) -> anyhow::Result<Vec<f32>> {
        Ok(Self::embed_sync(text))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cosine;

    #[test]
    fn similar_text_is_close() {
        let a = HashEmbedder::embed_sync("how do I deploy to staging");
        let b = HashEmbedder::embed_sync("how to deploy staging environment");
        let c = HashEmbedder::embed_sync("what colour should the logo be");
        assert!(cosine(&a, &b) > cosine(&a, &c));
        assert_eq!(a.len(), EMBEDDING_DIM);
    }
}
