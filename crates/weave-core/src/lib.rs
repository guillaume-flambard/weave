//! Pure domain types for the Weave Cognitive Runtime.
//!
//! This crate has no I/O and no infrastructure dependencies. Everything that
//! touches Postgres, the LLM, or the network lives behind traits in other
//! crates and speaks in terms of the types defined here.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use uuid::Uuid;

/// Dimension of fact embeddings. Kept in sync with the `facts.embedding` column
/// (see migration 0003). 768 matches `nomic-embed-text`; the local hash embedder
/// also emits this width so the two are interchangeable.
pub const EMBEDDING_DIM: usize = 768;

/// The memory hierarchy an agent draws from when answering.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MemoryLevel {
    Personal,
    Team,
    Project,
    Organization,
}

impl MemoryLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            MemoryLevel::Personal => "personal",
            MemoryLevel::Team => "team",
            MemoryLevel::Project => "project",
            MemoryLevel::Organization => "organization",
        }
    }

    pub fn from_str_lossy(s: &str) -> MemoryLevel {
        match s {
            "personal" => MemoryLevel::Personal,
            "team" => MemoryLevel::Team,
            "organization" => MemoryLevel::Organization,
            _ => MemoryLevel::Project,
        }
    }
}

/// An immutable observation from a source tool. The unit of ingestion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub id: Uuid,
    pub source: String,
    pub ts: DateTime<Utc>,
    pub actor: String,
    pub project: String,
    /// message | pr | doc_edit | commit | meeting | ...
    pub kind: String,
    pub payload: serde_json::Value,
    pub confidence: f32,
}

impl Event {
    /// Stable hash over the semantically-identifying fields. Used for idempotent
    /// dedup so replaying the same seed twice does not double-ingest.
    pub fn content_hash(&self) -> String {
        let mut h = DefaultHasher::new();
        self.source.hash(&mut h);
        self.actor.hash(&mut h);
        self.project.hash(&mut h);
        self.kind.hash(&mut h);
        self.payload.to_string().hash(&mut h);
        format!("{:016x}", h.finish())
    }

    /// Best-effort plain-text view of the payload for extraction/embedding.
    pub fn text(&self) -> String {
        match &self.payload {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Object(map) => map
                .get("text")
                .or_else(|| map.get("body"))
                .or_else(|| map.get("title"))
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .unwrap_or_else(|| self.payload.to_string()),
            other => other.to_string(),
        }
    }
}

/// What kind of knowledge a fact carries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FactType {
    Decision,
    Question,
    Answer,
    Fact,
}

impl FactType {
    pub fn as_str(self) -> &'static str {
        match self {
            FactType::Decision => "decision",
            FactType::Question => "question",
            FactType::Answer => "answer",
            FactType::Fact => "fact",
        }
    }

    pub fn from_str_lossy(s: &str) -> FactType {
        match s {
            "decision" => FactType::Decision,
            "question" => FactType::Question,
            "answer" => FactType::Answer,
            _ => FactType::Fact,
        }
    }
}

/// An atomic, durable piece of knowledge distilled from an event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fact {
    pub id: Uuid,
    pub event_id: Option<Uuid>,
    pub project: String,
    #[serde(default)]
    pub team: String,
    #[serde(default)]
    pub workstream: String,
    pub ftype: FactType,
    pub author: String,
    pub topic: String,
    pub content: String,
    pub confidence: f32,
    pub memory_level: MemoryLevel,
    /// Deterministic dedup signature over (topic, content); duplicates are dropped.
    #[serde(default)]
    pub content_sig: String,
    /// Stable canonical topic (LLM-canonicalized at ingest); the pattern
    /// signature anchor. Empty when not computed.
    #[serde(default)]
    pub canonical_topic: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub embedding: Option<Vec<f32>>,
    pub created_at: DateTime<Utc>,
}

/// A graph node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub id: Uuid,
    pub project: String,
    pub name: String,
    pub kind: String,
}

/// A graph edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relationship {
    pub id: Uuid,
    pub project: String,
    pub src: Uuid,
    pub dst: Uuid,
    pub rel: String,
}

/// A recurring signature detected across many facts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern {
    pub id: Uuid,
    pub project: String,
    pub signature: String,
    pub kind: String,
    pub occurrences: i32,
    pub fact_ids: Vec<Uuid>,
}

/// A reusable competence that emerged from a pattern — nobody wrote it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: Uuid,
    pub project: String,
    #[serde(default)]
    pub team: String,
    #[serde(default)]
    pub workstream: String,
    pub name: String,
    pub trigger: String,
    pub body: String,
    /// Free-text LLM theme used to cluster skills into a specialist agent.
    #[serde(default)]
    pub theme: String,
    pub sources: Vec<Uuid>,
    pub referents: Vec<String>,
    pub derived_from_pattern: Option<Uuid>,
    pub memory_level: MemoryLevel,
    pub created_at: DateTime<Utc>,
}

/// The tester's world: an organization with teams, people and projects. Drives
/// both the activity generator and the scoping of emergence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrgConfig {
    /// Tenant id / slug (used as the `project` partition key in storage).
    pub org: String,
    pub name: String,
    pub teams: Vec<Team>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub name: String,
    pub members: Vec<String>,
    pub projects: Vec<Project>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub name: String,
    /// One-line description of what the project is about — steers generation.
    pub theme: String,
    /// The domain family (finance-ops, engineering, growth…) — steers which
    /// specialist agent a team accumulates. Optional; defaults via theme.
    #[serde(default)]
    pub domain: String,
}

impl OrgConfig {
    /// Slugify a team/project name into a stable scope key.
    pub fn slug(name: &str) -> String {
        name.to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-")
    }
}

/// Lifecycle of an agent. Emergent agents start `Pending` and require human
/// approval before they can be delegated to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Active,
    Pending,
}

impl AgentStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            AgentStatus::Active => "active",
            AgentStatus::Pending => "pending",
        }
    }
    pub fn from_str_lossy(s: &str) -> AgentStatus {
        match s {
            "pending" => AgentStatus::Pending,
            _ => AgentStatus::Active,
        }
    }
}

/// A role that *acts* on the shared memory. Predefined or emergent (born from a
/// cluster of related skills, just like skills are born from patterns).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: Uuid,
    pub project: String,
    #[serde(default)]
    pub team: String,
    pub name: String,
    /// System prompt / mandate.
    pub role: String,
    /// Free-text theme this agent specializes in (the cluster it emerged from).
    pub domain: String,
    /// One-line human description synthesized from the agent's skills.
    #[serde(default)]
    pub description: String,
    /// Skills this agent may use, by name.
    pub skills: Vec<String>,
    /// Minimum memory level this agent may read.
    pub scope: MemoryLevel,
    pub status: AgentStatus,
    /// "predefined" or a description of what it emerged from.
    pub derived_from: String,
    pub created_at: DateTime<Utc>,
}

/// Normalize free-form topic text into a stable pattern signature so that
/// "How do I deploy to staging?" and "how to deploy staging" collapse together.
pub fn normalize_signature(topic: &str) -> String {
    const STOP: &[&str] = &[
        "how", "do", "i", "to", "the", "a", "an", "on", "in", "of", "is", "it",
        "can", "we", "you", "what", "comment", "je", "on", "le", "la", "les",
        "un", "une", "des", "pour", "est", "ce", "que", "qui", "faire",
    ];
    let mut words: Vec<String> = topic
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .filter(|w| !STOP.contains(w) && w.len() > 2)
        .map(str::to_string)
        .collect();
    words.sort();
    words.dedup();
    words.join(" ")
}

/// Deterministic dedup key for a fact: normalized topic signature + normalized
/// content. Two near-identical facts (re-worded) collapse to the same key.
pub fn fact_dedup_key(topic: &str, content: &str) -> String {
    let content_norm: String = content
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(200)
        .collect();
    format!("{}|{}", normalize_signature(topic), content_norm)
}

/// Canonical entity name: trimmed with internal whitespace collapsed. Casing is
/// preserved (proper nouns), so only whitespace noise is merged.
pub fn normalize_entity_name(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fact_dedup_key_collapses_near_duplicates() {
        let a = fact_dedup_key("Relancer la synchro ?", "Utiliser BankSync.rerun(client_id)");
        let b = fact_dedup_key("relancer synchro", "utiliser  BankSync.rerun(client_id)");
        assert_eq!(a, b);
        let c = fact_dedup_key("Déployer en staging", "Utiliser BankSync.rerun(client_id)");
        assert_ne!(a, c);
    }

    #[test]
    fn normalize_entity_name_collapses_whitespace() {
        assert_eq!(normalize_entity_name("  Bridge   Sync "), "Bridge Sync");
        assert_eq!(normalize_entity_name("Bridge"), "Bridge");
    }

    #[test]
    fn signature_collapses_equivalent_questions() {
        let a = normalize_signature("How do I deploy to staging?");
        let b = normalize_signature("how to deploy staging");
        let c = normalize_signature("Comment je déploie en staging ?");
        assert_eq!(a, b);
        assert!(a.contains("deploy"));
        assert!(a.contains("staging"));
        // French variant shares the salient tokens.
        assert!(c.contains("staging"));
    }

    #[test]
    fn event_hash_is_stable_and_dedups() {
        let mk = || Event {
            id: Uuid::new_v4(),
            source: "slack".into(),
            ts: Utc::now(),
            actor: "guillaume".into(),
            project: "echo-travel".into(),
            kind: "message".into(),
            payload: serde_json::json!({"text": "hello"}),
            confidence: 1.0,
        };
        // Different ids/timestamps, same semantic content => same hash.
        assert_eq!(mk().content_hash(), mk().content_hash());
    }

    #[test]
    fn event_text_reads_common_fields() {
        let e = Event {
            id: Uuid::new_v4(),
            source: "notion".into(),
            ts: Utc::now(),
            actor: "julie".into(),
            project: "echo-travel".into(),
            kind: "doc_edit".into(),
            payload: serde_json::json!({"title": "Payment RFC"}),
            confidence: 1.0,
        };
        assert_eq!(e.text(), "Payment RFC");
    }
}
