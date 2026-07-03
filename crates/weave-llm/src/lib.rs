//! Provider-agnostic LLM and embedding gateways.
//!
//! The pipeline depends only on the [`LlmGateway`] and [`EmbeddingGateway`]
//! traits, never on a concrete provider. The default wiring uses Claude when
//! `ANTHROPIC_API_KEY` is set and falls back to the offline [`HeuristicLlm`]
//! otherwise, so the whole demo runs with or without network.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use weave_core::Event;

mod claude;
mod embed;
mod embed_ollama;
mod heuristic;
mod ollama;
mod openai;

pub use claude::ClaudeLlm;
pub use embed::HashEmbedder;
pub use embed_ollama::OllamaEmbedder;
pub use heuristic::HeuristicLlm;
pub use ollama::OllamaLlm;
pub use openai::OpenaiLlm;

/// A fact as proposed by extraction, before it gets an id / embedding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedFact {
    pub ftype: String,
    #[serde(default)]
    pub author: String,
    pub topic: String,
    pub content: String,
    #[serde(default = "default_confidence")]
    pub confidence: f32,
}

fn default_confidence() -> f32 {
    0.75
}

/// A (name, kind) entity proposed by extraction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedEntity {
    pub name: String,
    #[serde(default = "default_entity_kind")]
    pub kind: String,
}

fn default_entity_kind() -> String {
    "concept".into()
}

/// A proposed edge between two entity names.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedRelationship {
    pub src: String,
    pub dst: String,
    #[serde(default = "default_rel")]
    pub rel: String,
}

fn default_rel() -> String {
    "related_to".into()
}

/// Everything one event yields.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Extraction {
    #[serde(default)]
    pub facts: Vec<ExtractedFact>,
    #[serde(default)]
    pub entities: Vec<ExtractedEntity>,
    #[serde(default)]
    pub relationships: Vec<ExtractedRelationship>,
}

/// Turns raw events into structured knowledge and answers questions.
#[async_trait]
pub trait LlmGateway: Send + Sync {
    /// Distill an event into facts, entities and relationships.
    async fn extract(&self, event: &Event) -> anyhow::Result<Extraction>;

    /// Synthesize a reusable skill body from a recurring question and the
    /// answers the team has given to it over time.
    async fn synthesize_skill(
        &self,
        signature: &str,
        question: &str,
        answers: &[String],
    ) -> anyhow::Result<String>;

    /// Answer a question given retrieved memory context (with provenance).
    async fn answer(&self, question: &str, context: &str) -> anyhow::Result<String>;

    /// Human label for observability / the demo UI.
    fn name(&self) -> &'static str;
}

/// Turns text into a vector for similarity search.
#[async_trait]
pub trait EmbeddingGateway: Send + Sync {
    async fn embed(&self, text: &str) -> anyhow::Result<Vec<f32>>;
}

/// Cosine similarity helper shared by the pipeline and stores.
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 {
        0.0
    } else {
        dot / (na * nb)
    }
}
