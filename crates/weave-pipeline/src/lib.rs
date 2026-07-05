//! The cognitive pipeline: turns each event into durable memory and lets skills
//! emerge from recurring patterns.
//!
//! Conceptual stages (Blueprint): Classifier -> EntityExtractor -> FactExtractor
//! -> RelationshipExtractor -> Summarizer -> PatternDetector -> MemoryUpdater.
//! In the MVP the extraction stages are fused into a single `LlmGateway::extract`
//! call (one round-trip per event); the pattern/skill logic lives in
//! [`Runtime::ingest`]. Everything runs over an in-process broadcast bus; swap it
//! for NATS JetStream later without touching this logic.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use serde::Serialize;
use tokio::sync::broadcast;
use uuid::Uuid;
use weave_core::{
    normalize_signature, Agent, AgentStatus, Entity, Event, Fact, FactType, MemoryLevel,
    Relationship, Skill,
};
use weave_llm::{EmbeddingGateway, LlmGateway};
use weave_store::Store;

/// Notifications emitted as an event flows through the pipeline. Streamed to the
/// dashboard over SSE.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PipelineEvent {
    EventIngested {
        id: Uuid,
        source: String,
        actor: String,
        kind: String,
        text: String,
    },
    FactExtracted {
        id: Uuid,
        ftype: String,
        author: String,
        topic: String,
        content: String,
        confidence: f32,
        memory_level: String,
    },
    EntityUpserted {
        name: String,
        kind: String,
    },
    RelationshipUpserted {
        src: String,
        dst: String,
        rel: String,
    },
    PatternObserved {
        signature: String,
        occurrences: i32,
        threshold: i32,
    },
    SkillEmerged {
        id: Uuid,
        name: String,
        trigger: String,
        referents: Vec<String>,
        sources_count: usize,
        body: String,
    },
    AgentEmerged {
        name: String,
        domain: String,
        skills: Vec<String>,
        status: String,
    },
    /// Emitted when a `/simulate` batch finishes (ingest may be partial on dedup).
    SimulationComplete {
        project: String,
        batch_size: usize,
        inserted: usize,
    },
}

/// One step in an orchestrated agent run (for the trace UI).
#[derive(Debug, Clone, Serialize)]
pub struct TraceStep {
    pub agent: String,
    pub action: String,
    pub note: String,
    pub depth: usize,
}

/// The result of running an agent on a task.
#[derive(Debug, Clone, Serialize)]
pub struct AgentRun {
    pub answer: String,
    pub trace: Vec<TraceStep>,
}

/// Orchestration guardrails.
const AGENT_MAX_DEPTH: usize = 2;
const AGENT_MAX_COUNT: usize = 8;
const AGENT_DEADLINE_SECS: u64 = 180;
/// A non-general domain needs this many skills before a specialist emerges.
const AGENT_EMERGE_THRESHOLD: usize = 2;

struct Budget {
    spent: usize,
    deadline: std::time::Instant,
}
impl Budget {
    fn new() -> Self {
        Budget {
            spent: 0,
            deadline: std::time::Instant::now()
                + std::time::Duration::from_secs(AGENT_DEADLINE_SECS),
        }
    }
    /// Consume one agent slot. Returns false if the count cap is hit.
    fn take_agent(&mut self) -> bool {
        if self.spent >= AGENT_MAX_COUNT {
            return false;
        }
        self.spent += 1;
        true
    }
    fn time_left(&self) -> bool {
        std::time::Instant::now() < self.deadline
    }
}

/// A slice of retrieved memory at one level, for provenance display.
#[derive(Debug, Clone, Serialize)]
pub struct LayerContext {
    pub level: String,
    pub facts: Vec<FactBrief>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FactBrief {
    pub topic: String,
    pub content: String,
    pub author: String,
    pub ftype: String,
}

/// The agent's answer plus the memory layers it drew on.
#[derive(Debug, Clone, Serialize)]
pub struct AnswerResult {
    pub answer: String,
    pub skill_used: Option<String>,
    pub layers: Vec<LayerContext>,
}

pub struct Runtime {
    store: Arc<dyn Store>,
    llm: Arc<dyn LlmGateway>,
    embedder: Arc<dyn EmbeddingGateway>,
    threshold: i32,
    tx: broadcast::Sender<PipelineEvent>,
}

impl Runtime {
    pub fn new(
        store: Arc<dyn Store>,
        llm: Arc<dyn LlmGateway>,
        embedder: Arc<dyn EmbeddingGateway>,
        threshold: i32,
    ) -> Self {
        let (tx, _) = broadcast::channel(1024);
        Runtime {
            store,
            llm,
            embedder,
            threshold,
            tx,
        }
    }

    /// Subscribe to the live pipeline feed.
    pub fn subscribe(&self) -> broadcast::Receiver<PipelineEvent> {
        self.tx.subscribe()
    }

    pub fn llm_name(&self) -> &'static str {
        self.llm.name()
    }

    /// Publish an out-of-band pipeline notification (e.g. simulation batch done).
    pub fn publish(&self, ev: PipelineEvent) {
        self.emit(ev);
    }

    fn emit(&self, ev: PipelineEvent) {
        let _ = self.tx.send(ev); // ok if no subscribers
    }

    /// Ingest one event end-to-end. Idempotent: duplicates are dropped.
    pub async fn ingest(&self, event: &Event) -> anyhow::Result<()> {
        // Stage 0 — dedup + persist the immutable event.
        if !self.store.insert_event(event).await? {
            return Ok(()); // already seen
        }
        self.emit(PipelineEvent::EventIngested {
            id: event.id,
            source: event.source.clone(),
            actor: event.actor.clone(),
            kind: event.kind.clone(),
            text: event.text(),
        });

        // Stages 1-4 — classify + extract facts, entities, relationships.
        let extraction = self.llm.extract(event).await?;

        // Entities (graph nodes).
        let mut name_to_id: HashMap<String, Uuid> = HashMap::new();
        for e in &extraction.entities {
            let name = weave_core::normalize_entity_name(&e.name);
            if name.is_empty() {
                continue;
            }
            let entity = Entity {
                id: Uuid::new_v4(),
                project: event.project.clone(),
                name: name.clone(),
                kind: e.kind.clone(),
            };
            let id = self.store.upsert_entity(&entity).await?;
            name_to_id.insert(name.clone(), id);
            self.emit(PipelineEvent::EntityUpserted {
                name,
                kind: e.kind.clone(),
            });
        }

        // Relationships (graph edges). Upsert unknown endpoints as concepts.
        for r in &extraction.relationships {
            let src = self.ensure_entity(&event.project, &r.src, &mut name_to_id).await?;
            let dst = self.ensure_entity(&event.project, &r.dst, &mut name_to_id).await?;
            let rel = Relationship {
                id: Uuid::new_v4(),
                project: event.project.clone(),
                src,
                dst,
                rel: r.rel.clone(),
            };
            self.store.upsert_relationship(&rel).await?;
            self.emit(PipelineEvent::RelationshipUpserted {
                src: r.src.clone(),
                dst: r.dst.clone(),
                rel: r.rel.clone(),
            });
        }

        // Facts.
        // Canonicalization vocabulary is fetched once per event (not per fact) —
        // it's a full-table aggregate and every fact in this event shares the
        // same project, so re-fetching inside the loop was a redundant N+1.
        let canonical_vocab = self
            .store
            .distinct_canonical_topics(&event.project, 50)
            .await
            .unwrap_or_default();
        for ef in &extraction.facts {
            let mut ftype = FactType::from_str_lossy(&ef.ftype);
            // Source-grounded correction: a reply in a thread is an answer, even
            // if the LLM labeled it otherwise. Provider-independent.
            if event.payload.get("reply_to").is_some() && !matches!(ftype, FactType::Question) {
                ftype = FactType::Answer;
            }
            // Clean fields on the way in, and derive a deterministic dedup key.
            let topic = ef.topic.trim().to_string();
            let content = ef.content.trim().to_string();
            let author = ef.author.trim().to_string();
            if topic.is_empty() || content.is_empty() {
                continue;
            }
            let content_sig = weave_core::fact_dedup_key(&topic, &content);
            let embedding = self.embedder.embed(&format!("{topic} {content}")).await?;
            // Stable clustering anchor: payload topic is a hard override (seed/thread);
            // otherwise canonicalize the LLM topic against the project's vocabulary so
            // rewordings collapse onto one signature.
            let canonical_topic = match event.payload.get("topic").and_then(|v| v.as_str()) {
                Some(t) => t.to_string(),
                None => self
                    .llm
                    .canonicalize_topic(&topic, &canonical_vocab)
                    .await
                    .unwrap_or_else(|_| weave_llm::normalize_theme(&topic)),
            };
            let fact = Fact {
                id: Uuid::new_v4(),
                event_id: Some(event.id),
                project: event.project.clone(),
                team: payload_str(event, "team"),
                workstream: payload_str(event, "workstream"),
                ftype,
                author,
                topic,
                content,
                confidence: ef.confidence,
                memory_level: infer_memory_level(event, ftype),
                content_sig,
                canonical_topic,
                embedding: Some(embedding),
                created_at: Utc::now(),
            };
            // Dedup: a content-signature duplicate is dropped — don't emit or
            // detect patterns for it (keeps memory and emergence clean).
            if !self.store.insert_fact(&fact).await? {
                continue;
            }
            self.emit(PipelineEvent::FactExtracted {
                id: fact.id,
                ftype: ftype.as_str().into(),
                author: fact.author.clone(),
                topic: fact.topic.clone(),
                content: fact.content.clone(),
                confidence: fact.confidence,
                memory_level: fact.memory_level.as_str().into(),
            });

            // Stages 5-6 — pattern detection. Observe when the event belongs to a
            // tracked thread (stable `topic` hint — the prod analog of a Slack
            // thread_ts or PR number), or when it's a Q/A. This makes emergence
            // robust to how any given LLM labels the fact type.
            let tracked_thread = event.payload.get("topic").is_some();
            if tracked_thread
                || !fact.canonical_topic.is_empty()
                || matches!(ftype, FactType::Question | FactType::Answer)
            {
                self.detect_pattern_and_maybe_emerge(event, &fact).await?;
            }
        }

        Ok(())
    }

    async fn ensure_entity(
        &self,
        project: &str,
        name: &str,
        cache: &mut HashMap<String, Uuid>,
    ) -> anyhow::Result<Uuid> {
        let name = weave_core::normalize_entity_name(name);
        if let Some(id) = cache.get(&name) {
            return Ok(*id);
        }
        let entity = Entity {
            id: Uuid::new_v4(),
            project: project.to_string(),
            name: name.clone(),
            kind: "concept".into(),
        };
        let id = self.store.upsert_entity(&entity).await?;
        cache.insert(name.to_string(), id);
        Ok(id)
    }

    /// Stage 6-7 — record the pattern; if it crosses the threshold and no skill
    /// exists yet, synthesize one. This is the "skill is born" moment.
    async fn detect_pattern_and_maybe_emerge(
        &self,
        event: &Event,
        fact: &Fact,
    ) -> anyhow::Result<()> {
        // Anchor the signature on a stable source hint (e.g. a Slack thread key,
        // carried as payload `topic`) when present, so clustering is robust to an
        // LLM rephrasing the fact topic. Falls back to the fact topic otherwise.
        let hint = event
            .payload
            .get("topic")
            .and_then(|v| v.as_str())
            .unwrap_or(&fact.canonical_topic); // was: &fact.topic
        let base_sig = normalize_signature(hint);
        if base_sig.is_empty() {
            return Ok(());
        }
        // Namespace the pattern per workstream so a "deploy" question in project A
        // and project B don't merge — each project grows its own skill.
        let signature = if fact.workstream.is_empty() {
            base_sig.clone()
        } else {
            format!("{}::{}", fact.workstream, base_sig)
        };
        let hit = self
            .store
            .observe(&event.project, &signature, "recurring_question", fact.id)
            .await?;
        self.emit(PipelineEvent::PatternObserved {
            signature: base_sig.clone(),
            occurrences: hit.occurrences,
            threshold: self.threshold,
        });

        if hit.occurrences < self.threshold {
            return Ok(());
        }

        // Skill name reads as "<workstream>/<slug>" so it's unique per project.
        let slug = skill_name(&base_sig);
        let name = if fact.workstream.is_empty() {
            slug.clone()
        } else {
            format!("{}/{}", fact.workstream, slug)
        };
        if self
            .store
            .skill_by_name(&event.project, &name)
            .await?
            .is_some()
        {
            return Ok(()); // already emerged
        }

        // Gather the answers the team has given to this recurring question.
        let related = self
            .store
            .search_facts(&event.project, &base_sig, 12)
            .await?;
        let answers: Vec<String> = related
            .iter()
            .filter(|s| !matches!(s.fact.ftype, FactType::Question))
            .map(|s| s.fact.content.clone())
            .collect();
        let referents: Vec<String> = dedup(
            related
                .iter()
                .filter(|s| !matches!(s.fact.ftype, FactType::Question))
                .map(|s| s.fact.author.clone()),
        );
        let sources: Vec<Uuid> = related.iter().map(|s| s.fact.id).collect();

        let body = self
            .llm
            .synthesize_skill(&signature, &fact.topic, &answers)
            .await?;

        // Assign a canonical domain theme so this skill can cluster into a
        // specialist. The model reuses an existing project domain when it fits
        // (controlled vocabulary → consolidated data). Best-effort: on failure the
        // skill stays un-themed (not clustered).
        let existing_themes: Vec<String> = dedup(
            self.store
                .skills(&event.project)
                .await?
                .into_iter()
                .map(|s| s.theme)
                .filter(|t| !t.trim().is_empty()),
        );
        let theme = self
            .llm
            .assign_theme(&fact.topic, &body, &existing_themes)
            .await
            .unwrap_or_default();

        let skill = Skill {
            id: Uuid::new_v4(),
            project: event.project.clone(),
            team: fact.team.clone(),
            workstream: fact.workstream.clone(),
            name: name.clone(),
            trigger: fact.topic.clone(),
            body: body.clone(),
            theme,
            sources: sources.clone(),
            referents: referents.clone(),
            derived_from_pattern: Some(hit.id),
            memory_level: MemoryLevel::Project,
            created_at: Utc::now(),
        };
        if self.store.insert_skill(&skill).await? {
            self.emit(PipelineEvent::SkillEmerged {
                id: skill.id,
                name: skill.name,
                trigger: skill.trigger,
                referents,
                sources_count: sources.len(),
                body,
            });
            // The same need recurring across ≥2 projects becomes an org skill.
            self.maybe_promote_org_skill(&event.project, &slug).await?;
            // A new skill may tip a team's domain over the threshold → agent.
            self.maybe_emerge_agent(&event.project).await?;
        }
        Ok(())
    }

    /// When the same base need has produced a skill in ≥2 workstreams, promote it
    /// to an organization-level skill (shared convention).
    async fn maybe_promote_org_skill(&self, project: &str, slug: &str) -> anyhow::Result<()> {
        let suffix = format!("/{slug}");
        let org_name = format!("org/{slug}");
        let all = self.store.skills(project).await?;
        if all.iter().any(|s| s.name == org_name) {
            return Ok(());
        }
        let matches: Vec<&Skill> = all
            .iter()
            .filter(|s| s.name.ends_with(&suffix) && !s.name.starts_with("org/"))
            .collect();
        let workstreams: std::collections::HashSet<&str> =
            matches.iter().map(|s| s.workstream.as_str()).collect();
        if workstreams.len() < 2 {
            return Ok(());
        }
        let referents = dedup(matches.iter().flat_map(|s| s.referents.clone()));
        let sources: Vec<Uuid> = matches.iter().flat_map(|s| s.sources.clone()).collect();
        let trigger = matches.first().map(|s| s.trigger.clone()).unwrap_or_default();
        let body = format!(
            "Convention partagée dans l'organisation — appliquée dans {} projets ({}).\n\n{}",
            workstreams.len(),
            workstreams.into_iter().collect::<Vec<_>>().join(", "),
            matches.first().map(|s| s.body.clone()).unwrap_or_default()
        );
        let skill = Skill {
            id: Uuid::new_v4(),
            project: project.to_string(),
            team: String::new(),
            workstream: String::new(),
            name: org_name.clone(),
            trigger,
            body: body.clone(),
            theme: String::new(), // org-level convention, not a specialist theme
            sources: sources.clone(),
            referents: referents.clone(),
            derived_from_pattern: None,
            memory_level: MemoryLevel::Organization,
            created_at: Utc::now(),
        };
        if self.store.insert_skill(&skill).await? {
            self.emit(PipelineEvent::SkillEmerged {
                id: skill.id,
                name: skill.name,
                trigger: skill.trigger,
                referents,
                sources_count: sources.len(),
                body,
            });
        }
        Ok(())
    }

    /// Cluster a team's skills by their free-text theme; when a theme reaches the
    /// threshold, an LLM synthesizes a specialist agent's identity (name, role,
    /// description) and the agent is born pending human approval. No keyword domains.
    async fn maybe_emerge_agent(&self, project: &str) -> anyhow::Result<()> {
        let skills = self.store.skills(project).await?;
        let existing = self.store.agents(project).await?;

        let mut by: HashMap<(String, String), Vec<&Skill>> = HashMap::new();
        for s in &skills {
            if s.theme.trim().is_empty() {
                continue; // un-themed skills can't name a specialist
            }
            by.entry((s.team.clone(), s.theme.clone())).or_default().push(s);
        }

        // How many same-theme skills a team needs before a specialist emerges.
        // Env-tunable: with a broad-theme LLM and a thin dataset, 1 lets each
        // mastered competence become a named specialist.
        let emerge_threshold: usize = std::env::var("WEAVE_AGENT_EMERGE_THRESHOLD")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(AGENT_EMERGE_THRESHOLD);

        for ((team, theme), cluster) in by {
            if cluster.len() < emerge_threshold {
                continue;
            }
            // Idempotent by (team, theme): the display name is LLM-rich and can vary.
            if existing.iter().any(|a| a.team == team && a.domain == theme) {
                continue;
            }
            let briefs: Vec<weave_llm::SkillBrief> = cluster
                .iter()
                .map(|s| weave_llm::SkillBrief {
                    name: s.name.clone(),
                    trigger: s.trigger.clone(),
                    body: s.body.clone(),
                })
                .collect();
            let spec = match self.llm.synthesize_agent(&team, &theme, &briefs).await {
                Ok(spec) => spec,
                Err(e) => {
                    tracing::error!("synthesize_agent failed for ({team},{theme}): {e}");
                    continue; // best-effort: skip this round
                }
            };
            let skill_names: Vec<String> = cluster.iter().map(|s| s.name.clone()).collect();
            let agent = Agent {
                id: Uuid::new_v4(),
                project: project.to_string(),
                team: team.clone(),
                name: spec.name.clone(),
                role: spec.role,
                domain: theme.clone(),
                description: spec.description,
                skills: skill_names.clone(),
                scope: MemoryLevel::Team,
                status: AgentStatus::Pending, // requires human approval
                derived_from: format!("équipe {team} · {} skills sur « {theme} »", skill_names.len()),
                created_at: Utc::now(),
            };
            if self.store.insert_agent(&agent).await? {
                self.emit(PipelineEvent::AgentEmerged {
                    name: spec.name,
                    domain: theme,
                    skills: skill_names,
                    status: "pending".into(),
                });
            }
        }
        Ok(())
    }

    /// Ensure predefined agents exist (idempotent). Called at startup.
    pub async fn seed_predefined_agents(&self, project: &str) -> anyhow::Result<()> {
        let generalist = Agent {
            id: Uuid::new_v4(),
            project: project.to_string(),
            team: String::new(),
            name: "assistant".into(),
            role: "Tu es l'assistant généraliste de l'organisation. Tu réponds à partir de la \
                   mémoire partagée et délègues aux agents spécialistes quand une tâche relève de \
                   leur domaine."
                .into(),
            domain: "general".into(),
            description: "Assistant généraliste, point d'entrée de l'organisation.".into(),
            skills: vec![],
            scope: MemoryLevel::Organization,
            status: AgentStatus::Active,
            derived_from: "prédéfini".into(),
            created_at: Utc::now(),
        };
        self.store.insert_agent(&generalist).await?;
        Ok(())
    }

    /// Run an agent on a task with a bounded plan→delegate→verify loop.
    pub async fn run_agent(
        &self,
        project: &str,
        agent_name: &str,
        task: &str,
    ) -> anyhow::Result<AgentRun> {
        let root = self
            .store
            .agent_by_name(project, agent_name)
            .await?
            .ok_or_else(|| anyhow::anyhow!("unknown agent: {agent_name}"))?;
        let mut trace = Vec::new();
        let mut budget = Budget::new();
        let answer = self
            .run_node(project, &root, task, 0, &mut trace, &mut budget)
            .await?;
        Ok(AgentRun { answer, trace })
    }

    async fn run_node(
        &self,
        project: &str,
        agent: &Agent,
        task: &str,
        depth: usize,
        trace: &mut Vec<TraceStep>,
        budget: &mut Budget,
    ) -> anyhow::Result<String> {
        if !budget.take_agent() {
            trace.push(TraceStep {
                agent: agent.name.clone(),
                action: "stop".into(),
                note: "budget agents épuisé".into(),
                depth,
            });
            return self.llm.answer(task, "").await;
        }

        let context = self.agent_context(project, task, agent).await?;

        // Delegate to a more specialized ACTIVE agent when the task fits its
        // domain and guardrails allow it.
        if depth < AGENT_MAX_DEPTH && budget.time_left() {
            if let Some(spec) = self.find_specialist(project, task, &agent.name).await? {
                trace.push(TraceStep {
                    agent: agent.name.clone(),
                    action: "delegate".into(),
                    note: format!("→ {} ({})", spec.name, spec.domain),
                    depth,
                });
                let sub = Box::pin(self.run_node(project, &spec, task, depth + 1, trace, budget))
                    .await?;
                let ok = verify(task, &sub);
                trace.push(TraceStep {
                    agent: agent.name.clone(),
                    action: "verify".into(),
                    note: if ok { "résultat accepté".into() } else { "à revoir → je réponds".into() },
                    depth,
                });
                if ok {
                    return Ok(sub);
                }
            }
        }

        let scoped = format!("[RÔLE: {}]\n\n{}", agent.role, context);
        let answer = self.llm.answer(task, &scoped).await?;
        trace.push(TraceStep {
            agent: agent.name.clone(),
            action: "answer".into(),
            note: format!("domaine {}", agent.domain),
            depth,
        });
        Ok(answer)
    }

    /// Find the active specialist (≠ `exclude`) whose identity best matches the
    /// task by embedding similarity. No keyword domains.
    async fn find_specialist(
        &self,
        project: &str,
        task: &str,
        exclude: &str,
    ) -> anyhow::Result<Option<Agent>> {
        const ROUTE_MIN_SIMILARITY: f32 = 0.35;
        let candidates: Vec<Agent> = self
            .store
            .agents(project)
            .await?
            .into_iter()
            .filter(|a| a.status == AgentStatus::Active && a.name != exclude && !a.skills.is_empty())
            .collect();
        if candidates.is_empty() {
            return Ok(None);
        }
        let task_emb = self.embedder.embed(task).await?;
        let mut best: Option<(f32, Agent)> = None;
        for a in candidates {
            let text = format!("{} {} {}", a.domain, a.role, a.description);
            let emb = self.embedder.embed(&text).await?;
            let sim = cosine(&task_emb, &emb);
            if best.as_ref().map(|(b, _)| sim > *b).unwrap_or(true) {
                best = Some((sim, a));
            }
        }
        Ok(best.filter(|(s, _)| *s >= ROUTE_MIN_SIMILARITY).map(|(_, a)| a))
    }

    /// Build an agent's working context: its skills' bodies + retrieved facts.
    async fn agent_context(&self, project: &str, task: &str, agent: &Agent) -> anyhow::Result<String> {
        let mut ctx = String::new();
        for name in &agent.skills {
            if let Some(s) = self.store.skill_by_name(project, name).await? {
                ctx.push_str(&format!("[SKILL {}]\n{}\n\n", s.name, s.body));
            }
        }
        let emb = self.embedder.embed(task).await?;
        for sf in self.store.similar_facts(project, &emb, 6).await? {
            ctx.push_str(&format!("- ({}) {}: {}\n", sf.fact.ftype.as_str(), sf.fact.author, sf.fact.content));
        }
        Ok(ctx)
    }

    /// Agent query: hybrid retrieval across memory layers + skill lookup, then
    /// an answer with visible provenance.
    pub async fn answer(&self, project: &str, question: &str) -> anyhow::Result<AnswerResult> {
        let signature = normalize_signature(question);
        let q_tokens: std::collections::HashSet<&str> = signature.split(' ').collect();

        // Did a skill emerge for this? Match by token subset so extra words in
        // the question (e.g. "d'un client") don't prevent a hit.
        let skill = self
            .store
            .skills(project)
            .await?
            .into_iter()
            .find(|s| {
                let name_tokens: Vec<&str> = s.name.split('-').collect();
                !name_tokens.is_empty() && name_tokens.iter().all(|t| q_tokens.contains(t))
            });

        // Hybrid retrieval: vector + full-text, merged.
        let q_emb = self.embedder.embed(question).await?;
        let mut hits = self.store.similar_facts(project, &q_emb, 8).await?;
        hits.extend(self.store.search_facts(project, question, 8).await?);
        let facts = dedup_facts(hits);

        // Group by memory level for provenance.
        let mut by_level: HashMap<&'static str, Vec<FactBrief>> = HashMap::new();
        for f in &facts {
            by_level
                .entry(f.memory_level.as_str())
                .or_default()
                .push(FactBrief {
                    topic: f.topic.clone(),
                    content: f.content.clone(),
                    author: f.author.clone(),
                    ftype: f.ftype.as_str().into(),
                });
        }
        let order = ["personal", "team", "project", "organization"];
        let layers: Vec<LayerContext> = order
            .iter()
            .filter_map(|lvl| {
                by_level.remove(*lvl).map(|facts| LayerContext {
                    level: (*lvl).to_string(),
                    facts,
                })
            })
            .collect();

        // Build the context string (with skill if present) and ask the LLM.
        let mut context = String::new();
        if let Some(s) = &skill {
            context.push_str(&format!("[SKILL: {}]\n{}\n\n", s.name, s.body));
        }
        for layer in &layers {
            context.push_str(&format!("[{} memory]\n", layer.level));
            for fb in &layer.facts {
                context.push_str(&format!("- ({}) {}: {}\n", fb.ftype, fb.author, fb.content));
            }
            context.push('\n');
        }

        let answer = self.llm.answer(question, &context).await?;
        Ok(AnswerResult {
            answer,
            skill_used: skill.map(|s| s.name),
            layers,
        })
    }
}

/// Heuristic verifier for the orchestration loop: accept a delegated result if
/// it is substantive and on-topic. (A v1 upgrade would use an adversarial LLM
/// check; kept deterministic here to bound cost/latency.)
fn verify(task: &str, answer: &str) -> bool {
    if answer.trim().len() < 40 {
        return false;
    }
    let a = answer.to_lowercase();
    let sig = normalize_signature(task);
    let hits = sig.split(' ').filter(|t| !t.is_empty() && a.contains(*t)).count();
    hits >= 1
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 {
        0.0
    } else {
        dot / (na * nb)
    }
}

#[cfg(test)]
mod tests {
    use super::cosine;
    use super::*;
    use weave_store::{AgentStore, SkillStore};

    #[test]
    fn cosine_scores_similarity() {
        // Identical direction → 1.0; orthogonal → 0.0; opposite → -1.0.
        assert!((cosine(&[1.0, 0.0], &[2.0, 0.0]) - 1.0).abs() < 1e-6);
        assert!(cosine(&[1.0, 0.0], &[0.0, 1.0]).abs() < 1e-6);
        assert!((cosine(&[1.0, 0.0], &[-1.0, 0.0]) + 1.0).abs() < 1e-6);
        // Zero vector is safe (no NaN).
        assert_eq!(cosine(&[0.0, 0.0], &[1.0, 1.0]), 0.0);
    }

    struct ZeroEmbedder;

    #[async_trait::async_trait]
    impl EmbeddingGateway for ZeroEmbedder {
        async fn embed(&self, _text: &str) -> anyhow::Result<Vec<f32>> {
            Ok(vec![0.0; weave_core::EMBEDDING_DIM])
        }
    }

    async fn test_store() -> Option<Arc<weave_store::PgStore>> {
        let url = std::env::var("TEST_DATABASE_URL").ok()?;
        let store = Arc::new(weave_store::PgStore::connect(&url).await.ok()?);
        store.migrate().await.ok()?;
        Some(store)
    }

    #[tokio::test]
    async fn free_text_messages_emerge_skill_and_agent() {
        let Some(store) = test_store().await else {
            eprintln!("skipping pipeline test: TEST_DATABASE_URL not set or unavailable");
            return;
        };
        // Named agents need cluster-size 1 for a single team-less theme in this test.
        std::env::set_var("WEAVE_AGENT_EMERGE_THRESHOLD", "1");
        let rt = Runtime::new(
            store.clone(),
            Arc::new(weave_llm::HeuristicLlm),
            Arc::new(ZeroEmbedder),
            3, // WEAVE_SKILL_THRESHOLD equivalent
        );
        let project = format!("canon-emerge-{}", uuid::Uuid::new_v4());
        // Reworded, free-text: NO payload "topic" and NO "team" — like real Discord.
        // All lead with the shared token "minerva" so the heuristic canonical
        // topic collapses onto one signature.
        let msgs = [
            "minerva plante souvent, comment on relance",
            "minerva a crashé, comment je relance",
            "minerva redémarrage impossible, le runbook",
            "minerva relancer après un crash",
        ];
        for (i, text) in msgs.iter().enumerate() {
            let ev = Event {
                id: uuid::Uuid::new_v4(),
                source: "discord".into(),
                ts: chrono::Utc::now(),
                actor: format!("user{i}"),
                project: project.clone(),
                kind: "message".into(),
                payload: serde_json::json!({ "text": text, "channel": "général" }),
                confidence: 1.0,
            };
            rt.ingest(&ev).await.unwrap();
        }
        let skills = store.skills(&project).await.unwrap();
        assert!(!skills.is_empty(), "a skill should emerge from recurring free-text");
        let agents = store.agents(&project).await.unwrap();
        assert!(!agents.is_empty(), "a team-less themed skill should seed an org-level agent");
    }

    #[tokio::test]
    async fn payload_topic_events_still_emerge_skill() {
        let Some(store) = test_store().await else {
            eprintln!("skipping pipeline test: TEST_DATABASE_URL not set or unavailable");
            return;
        };
        let rt = Runtime::new(
            store.clone(),
            Arc::new(weave_llm::HeuristicLlm),
            Arc::new(ZeroEmbedder),
            3, // WEAVE_SKILL_THRESHOLD equivalent
        );
        let project = format!("canon-seed-{}", uuid::Uuid::new_v4());
        // All events carry the SAME hardcoded payload "topic" (hard-override
        // anchor), but different free text — proving the override path bypasses
        // canonicalization entirely and still clusters/emerges a skill.
        let topic = "relancer la synchro bancaire";
        let msgs = [
            "comment relancer la synchro bancaire d'un client",
            "comment on force une resynchro bancaire",
            "je relance la synchro banque comment",
            "resynchro bancaire staging, le runbook",
        ];
        for (i, text) in msgs.iter().enumerate() {
            let ev = Event {
                id: uuid::Uuid::new_v4(),
                source: "discord".into(),
                ts: chrono::Utc::now(),
                actor: format!("user{i}"),
                project: project.clone(),
                kind: "message".into(),
                payload: serde_json::json!({ "text": text, "topic": topic }),
                confidence: 1.0,
            };
            rt.ingest(&ev).await.unwrap();
        }
        let skills = store.skills(&project).await.unwrap();
        assert!(
            !skills.is_empty(),
            "a skill should emerge via the payload-topic hard-override anchor"
        );
    }
}

fn payload_str(event: &Event, key: &str) -> String {
    event.payload.get(key).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn infer_memory_level(event: &Event, ftype: FactType) -> MemoryLevel {
    // Simple MVP heuristic: naming/convention decisions read as org-level;
    // personal notes stay personal; everything else is project memory.
    let text = event.text().to_lowercase();
    if text.contains("convention") || text.contains("policy") || text.contains("standard") {
        MemoryLevel::Organization
    } else if matches!(ftype, FactType::Question) {
        MemoryLevel::Personal
    } else {
        MemoryLevel::Project
    }
}

fn skill_name(signature: &str) -> String {
    let slug: String = signature.replace(' ', "-");
    if slug.is_empty() {
        "emergent-skill".into()
    } else {
        slug
    }
}

fn dedup(iter: impl Iterator<Item = String>) -> Vec<String> {
    let mut out = Vec::new();
    for s in iter {
        if !out.contains(&s) {
            out.push(s);
        }
    }
    out
}

fn dedup_facts(hits: Vec<weave_store::ScoredFact>) -> Vec<Fact> {
    let mut out: Vec<Fact> = Vec::new();
    for h in hits {
        if !out.iter().any(|f| f.id == h.fact.id) {
            out.push(h.fact);
        }
    }
    out
}
