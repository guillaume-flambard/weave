//! Single-Postgres adapter implementing every storage port.

use crate::ports::*;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::postgres::{PgPoolOptions, PgRow};
use sqlx::{PgPool, Row};
use uuid::Uuid;
use weave_core::{
    Agent, AgentStatus, Entity, Event, Fact, FactType, MemoryLevel, Relationship, Skill,
};

#[derive(Clone)]
pub struct PgStore {
    pool: PgPool,
}

impl PgStore {
    pub async fn connect(database_url: &str) -> anyhow::Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(database_url)
            .await?;
        Ok(PgStore { pool })
    }

    pub fn from_pool(pool: PgPool) -> Self {
        PgStore { pool }
    }

    /// Borrow the underlying pool (used by sibling modules like `connections`).
    pub fn pool(&self) -> &sqlx::PgPool {
        &self.pool
    }

    /// Run embedded migrations. Idempotent.
    pub async fn migrate(&self) -> anyhow::Result<()> {
        sqlx::migrate!("../../migrations").run(&self.pool).await?;
        Ok(())
    }

    /// The project's canonical topics, most frequent first (bounds the
    /// canonicalization prompt vocabulary). Empty topics excluded.
    pub async fn distinct_canonical_topics(&self, project: &str, limit: i64) -> anyhow::Result<Vec<String>> {
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT canonical_topic FROM facts
             WHERE project = $1 AND canonical_topic <> ''
             GROUP BY canonical_topic
             ORDER BY count(*) DESC
             LIMIT $2",
        )
        .bind(project)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Wipe all data for one project so a demo can be replayed from scratch.
    pub async fn reset(&self, project: &str) -> anyhow::Result<()> {
        for table in ["agents", "skills", "patterns", "facts", "relationships", "entities", "events"] {
            sqlx::query(&format!("DELETE FROM {table} WHERE project = $1"))
                .bind(project)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }
}

/// pgvector accepts a text literal like `[0.1,0.2,...]` cast to `::vector`.
fn to_pgvector(v: &[f32]) -> String {
    let mut s = String::with_capacity(v.len() * 8 + 2);
    s.push('[');
    for (i, x) in v.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!("{x}"));
    }
    s.push(']');
    s
}

fn row_to_fact(row: &PgRow) -> Fact {
    Fact {
        id: row.get("id"),
        event_id: row.try_get("event_id").ok(),
        project: row.get("project"),
        team: row.try_get("team").unwrap_or_default(),
        workstream: row.try_get("workstream").unwrap_or_default(),
        ftype: FactType::from_str_lossy(row.get::<String, _>("ftype").as_str()),
        author: row.get("author"),
        topic: row.get("topic"),
        content: row.get("content"),
        confidence: row.get("confidence"),
        memory_level: MemoryLevel::from_str_lossy(row.get::<String, _>("memory_level").as_str()),
        content_sig: row.try_get("content_sig").unwrap_or_default(),
        canonical_topic: row.try_get("canonical_topic").unwrap_or_default(),
        embedding: None, // not read back; only used for storage/search
        created_at: row.get::<DateTime<Utc>, _>("created_at"),
    }
}

const FACT_COLS: &str =
    "id, event_id, project, team, workstream, ftype, author, topic, content, confidence, memory_level, canonical_topic, created_at";

#[async_trait]
impl EventStore for PgStore {
    async fn insert_event(&self, event: &Event) -> anyhow::Result<bool> {
        let res = sqlx::query(
            "INSERT INTO events (id, source, ts, actor, project, kind, payload, confidence, content_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (content_hash) DO NOTHING",
        )
        .bind(event.id)
        .bind(&event.source)
        .bind(event.ts)
        .bind(&event.actor)
        .bind(&event.project)
        .bind(&event.kind)
        .bind(&event.payload)
        .bind(event.confidence)
        .bind(event.content_hash())
        .execute(&self.pool)
        .await?;
        Ok(res.rows_affected() > 0)
    }

    async fn recent_events(&self, project: &str, limit: i64) -> anyhow::Result<Vec<Event>> {
        let rows = sqlx::query(
            "SELECT id, source, ts, actor, project, kind, payload, confidence
             FROM events WHERE project = $1 ORDER BY ts DESC LIMIT $2",
        )
        .bind(project)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|r| Event {
                id: r.get("id"),
                source: r.get("source"),
                ts: r.get::<DateTime<Utc>, _>("ts"),
                actor: r.get("actor"),
                project: r.get("project"),
                kind: r.get("kind"),
                payload: r.get("payload"),
                confidence: r.get("confidence"),
            })
            .collect())
    }

    async fn count_events(&self, project: &str) -> anyhow::Result<i64> {
        let n: i64 = sqlx::query_scalar("SELECT count(*) FROM events WHERE project = $1")
            .bind(project)
            .fetch_one(&self.pool)
            .await?;
        Ok(n)
    }
}

#[async_trait]
impl FactStore for PgStore {
    async fn insert_fact(&self, fact: &Fact) -> anyhow::Result<bool> {
        let embedding = fact.embedding.as_ref().map(|e| to_pgvector(e));
        let res = sqlx::query(
            "INSERT INTO facts (id, event_id, project, team, workstream, ftype, author, topic, content, confidence, memory_level, content_sig, canonical_topic, embedding)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, $14::vector)
             ON CONFLICT (project, content_sig) WHERE content_sig <> '' DO NOTHING",
        )
        .bind(fact.id)
        .bind(fact.event_id)
        .bind(&fact.project)
        .bind(&fact.team)
        .bind(&fact.workstream)
        .bind(fact.ftype.as_str())
        .bind(&fact.author)
        .bind(&fact.topic)
        .bind(&fact.content)
        .bind(fact.confidence)
        .bind(fact.memory_level.as_str())
        .bind(&fact.content_sig)
        .bind(&fact.canonical_topic)
        .bind(embedding)
        .execute(&self.pool)
        .await?;
        Ok(res.rows_affected() > 0)
    }

    async fn recent_facts(&self, project: &str, limit: i64) -> anyhow::Result<Vec<Fact>> {
        let sql = format!(
            "SELECT {FACT_COLS} FROM facts WHERE project = $1 AND superseded_by IS NULL
             ORDER BY created_at DESC LIMIT $2"
        );
        let rows = sqlx::query(&sql)
            .bind(project)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.iter().map(row_to_fact).collect())
    }

    async fn similar_facts(
        &self,
        project: &str,
        embedding: &[f32],
        limit: i64,
    ) -> anyhow::Result<Vec<ScoredFact>> {
        let vec = to_pgvector(embedding);
        let sql = format!(
            "SELECT {FACT_COLS}, 1 - (embedding <=> $2::vector) AS score
             FROM facts
             WHERE project = $1 AND embedding IS NOT NULL AND superseded_by IS NULL
             ORDER BY embedding <=> $2::vector LIMIT $3"
        );
        let rows = sqlx::query(&sql)
            .bind(project)
            .bind(vec)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows
            .iter()
            .map(|r| ScoredFact {
                fact: row_to_fact(r),
                score: r.try_get::<f64, _>("score").unwrap_or(0.0) as f32,
            })
            .collect())
    }

    async fn search_facts(
        &self,
        project: &str,
        query: &str,
        limit: i64,
    ) -> anyhow::Result<Vec<ScoredFact>> {
        let sql = format!(
            "SELECT {FACT_COLS}, ts_rank(fts, plainto_tsquery('simple', $2)) AS score
             FROM facts
             WHERE project = $1 AND superseded_by IS NULL
               AND fts @@ plainto_tsquery('simple', $2)
             ORDER BY score DESC LIMIT $3"
        );
        let rows = sqlx::query(&sql)
            .bind(project)
            .bind(query)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows
            .iter()
            .map(|r| ScoredFact {
                fact: row_to_fact(r),
                score: r.try_get::<f32, _>("score").unwrap_or(0.0),
            })
            .collect())
    }
}

#[async_trait]
impl GraphStore for PgStore {
    async fn upsert_entity(&self, entity: &Entity) -> anyhow::Result<Uuid> {
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO entities (id, project, name, kind) VALUES ($1,$2,$3,$4)
             ON CONFLICT (project, name, kind) DO UPDATE SET name = EXCLUDED.name
             RETURNING id",
        )
        .bind(entity.id)
        .bind(&entity.project)
        .bind(&entity.name)
        .bind(&entity.kind)
        .fetch_one(&self.pool)
        .await?;
        Ok(id)
    }

    async fn upsert_relationship(&self, rel: &Relationship) -> anyhow::Result<()> {
        sqlx::query(
            "INSERT INTO relationships (id, project, src, dst, rel) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (project, src, dst, rel) DO NOTHING",
        )
        .bind(rel.id)
        .bind(&rel.project)
        .bind(rel.src)
        .bind(rel.dst)
        .bind(&rel.rel)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn entities(&self, project: &str) -> anyhow::Result<Vec<Entity>> {
        let rows =
            sqlx::query("SELECT id, project, name, kind FROM entities WHERE project = $1")
                .bind(project)
                .fetch_all(&self.pool)
                .await?;
        Ok(rows
            .iter()
            .map(|r| Entity {
                id: r.get("id"),
                project: r.get("project"),
                name: r.get("name"),
                kind: r.get("kind"),
            })
            .collect())
    }

    async fn relationships(&self, project: &str) -> anyhow::Result<Vec<Relationship>> {
        let rows = sqlx::query(
            "SELECT id, project, src, dst, rel FROM relationships WHERE project = $1",
        )
        .bind(project)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|r| Relationship {
                id: r.get("id"),
                project: r.get("project"),
                src: r.get("src"),
                dst: r.get("dst"),
                rel: r.get("rel"),
            })
            .collect())
    }
}

#[async_trait]
impl PatternStore for PgStore {
    async fn observe(
        &self,
        project: &str,
        signature: &str,
        kind: &str,
        fact_id: Uuid,
    ) -> anyhow::Result<PatternHit> {
        let row = sqlx::query(
            "INSERT INTO patterns (id, project, signature, kind, occurrences, fact_ids)
             VALUES ($1,$2,$3,$4,1, ARRAY[$5]::uuid[])
             ON CONFLICT (project, signature) DO UPDATE
               SET occurrences = patterns.occurrences + 1,
                   fact_ids = array_append(patterns.fact_ids, $5),
                   updated_at = now()
             RETURNING id, occurrences, fact_ids",
        )
        .bind(Uuid::new_v4())
        .bind(project)
        .bind(signature)
        .bind(kind)
        .bind(fact_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(PatternHit {
            id: row.get("id"),
            occurrences: row.get("occurrences"),
            fact_ids: row.get("fact_ids"),
        })
    }
}

#[async_trait]
impl SkillStore for PgStore {
    async fn insert_skill(&self, skill: &Skill) -> anyhow::Result<bool> {
        let res = sqlx::query(
            "INSERT INTO skills (id, project, team, workstream, name, trigger, body, sources, referents, derived_from_pattern, memory_level, theme)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (project, name) DO NOTHING",
        )
        .bind(skill.id)
        .bind(&skill.project)
        .bind(&skill.team)
        .bind(&skill.workstream)
        .bind(&skill.name)
        .bind(&skill.trigger)
        .bind(&skill.body)
        .bind(&skill.sources)
        .bind(&skill.referents)
        .bind(skill.derived_from_pattern)
        .bind(skill.memory_level.as_str())
        .bind(&skill.theme)
        .execute(&self.pool)
        .await?;
        Ok(res.rows_affected() > 0)
    }

    async fn skills(&self, project: &str) -> anyhow::Result<Vec<Skill>> {
        let rows = sqlx::query(
            "SELECT id, project, team, workstream, name, trigger, body, sources, referents, derived_from_pattern, memory_level, theme, created_at
             FROM skills WHERE project = $1 ORDER BY created_at DESC",
        )
        .bind(project)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(row_to_skill).collect())
    }

    async fn skill_by_name(&self, project: &str, name: &str) -> anyhow::Result<Option<Skill>> {
        let row = sqlx::query(
            "SELECT id, project, team, workstream, name, trigger, body, sources, referents, derived_from_pattern, memory_level, theme, created_at
             FROM skills WHERE project = $1 AND name = $2",
        )
        .bind(project)
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| row_to_skill(&r)))
    }
}

#[async_trait]
impl AgentStore for PgStore {
    async fn insert_agent(&self, a: &Agent) -> anyhow::Result<bool> {
        let res = sqlx::query(
            "INSERT INTO agents (id, project, team, name, role, domain, skills, scope, status, derived_from, description)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (project, name) DO NOTHING",
        )
        .bind(a.id)
        .bind(&a.project)
        .bind(&a.team)
        .bind(&a.name)
        .bind(&a.role)
        .bind(&a.domain)
        .bind(&a.skills)
        .bind(a.scope.as_str())
        .bind(a.status.as_str())
        .bind(&a.derived_from)
        .bind(&a.description)
        .execute(&self.pool)
        .await?;
        Ok(res.rows_affected() > 0)
    }

    async fn agents(&self, project: &str) -> anyhow::Result<Vec<Agent>> {
        let rows = sqlx::query(
            "SELECT id, project, team, name, role, domain, skills, scope, status, derived_from, description, created_at
             FROM agents WHERE project = $1 ORDER BY created_at",
        )
        .bind(project)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(row_to_agent).collect())
    }

    async fn agent_by_name(&self, project: &str, name: &str) -> anyhow::Result<Option<Agent>> {
        let row = sqlx::query(
            "SELECT id, project, team, name, role, domain, skills, scope, status, derived_from, description, created_at
             FROM agents WHERE project = $1 AND name = $2",
        )
        .bind(project)
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| row_to_agent(&r)))
    }

    async fn set_agent_status(
        &self,
        project: &str,
        name: &str,
        status: AgentStatus,
    ) -> anyhow::Result<()> {
        sqlx::query("UPDATE agents SET status = $3 WHERE project = $1 AND name = $2")
            .bind(project)
            .bind(name)
            .bind(status.as_str())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

#[async_trait]
impl OrgStore for PgStore {
    async fn get_org_config(&self, org: &str) -> anyhow::Result<Option<serde_json::Value>> {
        let row: Option<(serde_json::Value,)> =
            sqlx::query_as("SELECT config FROM org_config WHERE org = $1")
                .bind(org)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|r| r.0))
    }

    async fn save_org_config(&self, org: &str, config: &serde_json::Value) -> anyhow::Result<()> {
        sqlx::query(
            "INSERT INTO org_config (org, config, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (org) DO UPDATE SET config = EXCLUDED.config, updated_at = now()",
        )
        .bind(org)
        .bind(config)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

fn row_to_agent(r: &PgRow) -> Agent {
    Agent {
        id: r.get("id"),
        project: r.get("project"),
        team: r.try_get("team").unwrap_or_default(),
        name: r.get("name"),
        role: r.get("role"),
        domain: r.get("domain"),
        description: r.try_get("description").unwrap_or_default(),
        skills: r.get("skills"),
        scope: MemoryLevel::from_str_lossy(r.get::<String, _>("scope").as_str()),
        status: AgentStatus::from_str_lossy(r.get::<String, _>("status").as_str()),
        derived_from: r.get("derived_from"),
        created_at: r.get::<DateTime<Utc>, _>("created_at"),
    }
}

fn row_to_skill(r: &PgRow) -> Skill {
    Skill {
        id: r.get("id"),
        project: r.get("project"),
        team: r.try_get("team").unwrap_or_default(),
        workstream: r.try_get("workstream").unwrap_or_default(),
        name: r.get("name"),
        trigger: r.get("trigger"),
        body: r.get("body"),
        sources: r.get("sources"),
        referents: r.get("referents"),
        derived_from_pattern: r.try_get("derived_from_pattern").ok(),
        memory_level: MemoryLevel::from_str_lossy(r.get::<String, _>("memory_level").as_str()),
        theme: r.try_get("theme").unwrap_or_default(),
        created_at: r.get::<DateTime<Utc>, _>("created_at"),
    }
}
