//! The storage ports. Each is a narrow, testable capability.

use async_trait::async_trait;
use uuid::Uuid;
use weave_core::{Agent, AgentStatus, Entity, Event, Fact, Relationship, Skill};

/// A fact returned from a search, with its relevance score.
#[derive(Debug, Clone)]
pub struct ScoredFact {
    pub fact: Fact,
    pub score: f32,
}

/// The immutable event log.
#[async_trait]
pub trait EventStore: Send + Sync {
    /// Insert an event. Returns `false` if it was a duplicate (by content hash).
    async fn insert_event(&self, event: &Event) -> anyhow::Result<bool>;
    async fn recent_events(&self, project: &str, limit: i64) -> anyhow::Result<Vec<Event>>;
    async fn count_events(&self, project: &str) -> anyhow::Result<i64>;
}

/// Atomic facts, with vector + full-text retrieval.
#[async_trait]
pub trait FactStore: Send + Sync {
    /// Insert a fact; returns `false` if it was a content-signature duplicate.
    async fn insert_fact(&self, fact: &Fact) -> anyhow::Result<bool>;
    async fn recent_facts(&self, project: &str, limit: i64) -> anyhow::Result<Vec<Fact>>;
    /// Vector similarity search (pgvector `<=>`).
    async fn similar_facts(
        &self,
        project: &str,
        embedding: &[f32],
        limit: i64,
    ) -> anyhow::Result<Vec<ScoredFact>>;
    /// Full-text (BM25-ish) search (tsvector).
    async fn search_facts(
        &self,
        project: &str,
        query: &str,
        limit: i64,
    ) -> anyhow::Result<Vec<ScoredFact>>;
}

/// The knowledge graph.
#[async_trait]
pub trait GraphStore: Send + Sync {
    /// Insert or fetch an entity; returns its id.
    async fn upsert_entity(&self, entity: &Entity) -> anyhow::Result<Uuid>;
    async fn upsert_relationship(&self, rel: &Relationship) -> anyhow::Result<()>;
    async fn entities(&self, project: &str) -> anyhow::Result<Vec<Entity>>;
    async fn relationships(&self, project: &str) -> anyhow::Result<Vec<Relationship>>;
}

/// The outcome of recording one observation of a pattern.
#[derive(Debug, Clone)]
pub struct PatternHit {
    pub id: Uuid,
    pub occurrences: i32,
    pub fact_ids: Vec<Uuid>,
}

/// Recurring-signature tracking. The trigger for skill emergence.
#[async_trait]
pub trait PatternStore: Send + Sync {
    /// Record one occurrence of `signature`, appending `fact_id`. Returns the
    /// current tally so the caller can decide whether the threshold is crossed.
    async fn observe(
        &self,
        project: &str,
        signature: &str,
        kind: &str,
        fact_id: Uuid,
    ) -> anyhow::Result<PatternHit>;
}

/// Materialized skills.
#[async_trait]
pub trait SkillStore: Send + Sync {
    /// Insert a skill. Returns `false` if one with that name already exists.
    async fn insert_skill(&self, skill: &Skill) -> anyhow::Result<bool>;
    async fn skills(&self, project: &str) -> anyhow::Result<Vec<Skill>>;
    async fn skill_by_name(&self, project: &str, name: &str) -> anyhow::Result<Option<Skill>>;
}

/// Agents: predefined or emergent roles.
#[async_trait]
pub trait AgentStore: Send + Sync {
    /// Insert an agent. Returns `false` if one with that name already exists.
    async fn insert_agent(&self, agent: &Agent) -> anyhow::Result<bool>;
    async fn agents(&self, project: &str) -> anyhow::Result<Vec<Agent>>;
    async fn agent_by_name(&self, project: &str, name: &str) -> anyhow::Result<Option<Agent>>;
    async fn set_agent_status(
        &self,
        project: &str,
        name: &str,
        status: AgentStatus,
    ) -> anyhow::Result<()>;
}

/// Per-tenant org configuration (teams, projects, people).
#[async_trait]
pub trait OrgStore: Send + Sync {
    async fn get_org_config(&self, org: &str) -> anyhow::Result<Option<serde_json::Value>>;
    async fn save_org_config(&self, org: &str, config: &serde_json::Value) -> anyhow::Result<()>;
}

/// Convenience umbrella so callers can pass one `Arc<dyn Store>` around.
pub trait Store:
    EventStore + FactStore + GraphStore + PatternStore + SkillStore + AgentStore + OrgStore
{
}
impl<T> Store for T where
    T: EventStore + FactStore + GraphStore + PatternStore + SkillStore + AgentStore + OrgStore
{
}
