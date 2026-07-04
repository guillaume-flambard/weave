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
mod clean;
mod embed;
mod embed_ollama;
mod heuristic;
mod ollama;
mod openai;

pub use clean::{normalize_theme, parse_json_lenient, slug};

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

/// A skill passed to agent synthesis.
#[derive(Debug, Clone)]
pub struct SkillBrief {
    pub name: String,
    pub trigger: String,
    pub body: String,
}

/// A synthesized specialist-agent identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSpec {
    pub name: String,
    pub role: String,
    pub description: String,
}

/// Deterministic theme: the two most significant normalized tokens of the trigger.
/// No fixed domain taxonomy — used by the offline mock and as a real-LLM fallback.
pub fn heuristic_theme(trigger: &str) -> String {
    const STOP: &[&str] = &[
        "le", "la", "les", "un", "une", "des", "de", "du", "the", "a", "of", "pour", "sur",
        "que", "qui", "and", "for", "with",
    ];
    trigger
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() > 2 && !STOP.contains(w))
        .take(2)
        .collect::<Vec<_>>()
        .join(" ")
}

/// Shared (system, user) prompt for theme assignment with a controlled vocabulary.
pub(crate) fn theme_prompt(trigger: &str, body: &str, existing: &[String]) -> (String, String) {
    let existing_list = if existing.is_empty() {
        "(aucun pour l'instant)".to_string()
    } else {
        existing.join(", ")
    };
    let system = "Tu classes une compétence d'équipe par domaine métier. Réutilise EXACTEMENT \
        un domaine existant s'il correspond, sinon propose un domaine LARGE et réutilisable \
        (1 à 2 mots). Réponds en JSON strict: {\"theme\": \"...\"}. Minuscules, sans ponctuation."
        .to_string();
    let user = format!("Domaines existants: {existing_list}\nDéclencheur: {trigger}\nProcédure: {body}");
    (system, user)
}

/// Parse + normalize a `{"theme": ...}` response; fall back to the heuristic theme.
pub(crate) fn theme_from_response(js: &str, trigger: &str) -> String {
    #[derive(serde::Deserialize)]
    struct T {
        #[serde(default)]
        theme: String,
    }
    let theme = parse_json_lenient::<T>(js).map(|t| t.theme).unwrap_or_default();
    let norm = normalize_theme(&theme);
    if norm.is_empty() {
        normalize_theme(&heuristic_theme(trigger))
    } else {
        norm
    }
}

/// Shared (system, user) prompt for agent synthesis.
pub(crate) fn agent_prompt(team: &str, theme: &str, skills: &[SkillBrief]) -> (String, String) {
    let list = skills
        .iter()
        .map(|s| format!("- {} : {}", s.trigger, s.body))
        .collect::<Vec<_>>()
        .join("\n");
    let system = "Tu conçois un agent spécialiste d'équipe. Réponds en JSON strict \
        {\"name\":..,\"role\":..,\"description\":..} : name = identifiant court kebab-case ; \
        role = mandat en 2 phrases ; description = une phrase. En français."
        .to_string();
    let user = format!("Équipe: {team}\nThème: {theme}\nCompétences:\n{list}");
    (system, user)
}

/// Parse + validate an agent JSON response; fall back to the heuristic identity,
/// and always normalize the name to a deterministic slug.
pub(crate) fn agent_from_response(
    js: &str,
    team: &str,
    theme: &str,
    skills: &[SkillBrief],
) -> AgentSpec {
    let mut spec =
        parse_json_lenient::<AgentSpec>(js).unwrap_or_else(|_| heuristic_agent_spec(team, theme, skills));
    if spec.name.trim().is_empty() || spec.role.trim().is_empty() || spec.description.trim().is_empty()
    {
        spec = heuristic_agent_spec(team, theme, skills);
    }
    spec.name = slug(&spec.name);
    if spec.name.is_empty() {
        spec.name = slug(&heuristic_agent_spec(team, theme, skills).name);
    }
    spec
}

/// Deterministic agent identity — offline mock and fallback when a real LLM's
/// JSON can't be parsed.
pub fn heuristic_agent_spec(team: &str, theme: &str, skills: &[SkillBrief]) -> AgentSpec {
    let slug: String = theme.split_whitespace().collect::<Vec<_>>().join("-");
    let names: Vec<&str> = skills.iter().map(|s| s.name.as_str()).collect();
    AgentSpec {
        name: if slug.is_empty() { format!("agent-{team}") } else { format!("agent-{slug}") },
        role: format!(
            "Tu es le spécialiste « {theme} » de l'équipe {team}. Tu t'appuies sur les \
             procédures {} et la mémoire partagée.",
            names.join(", ")
        ),
        description: format!("Né de {} procédures récurrentes sur « {theme} ».", skills.len()),
    }
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

    /// Assign a canonical domain theme to a skill. `existing` lists the project's
    /// current domains so the model reuses one when it fits (controlled vocabulary),
    /// keeping the theme space consolidated. The returned theme is normalized.
    async fn assign_theme(
        &self,
        trigger: &str,
        body: &str,
        existing: &[String],
    ) -> anyhow::Result<String>;

    /// Synthesize a specialist agent's identity from a cluster of skills.
    async fn synthesize_agent(
        &self,
        team: &str,
        theme: &str,
        skills: &[SkillBrief],
    ) -> anyhow::Result<AgentSpec>;

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
