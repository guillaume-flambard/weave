use chrono::Utc;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use std::sync::atomic::{AtomicU64, Ordering};
use uuid::Uuid;
use weave_core::{Agent, AgentStatus, Event, Fact, FactType, MemoryLevel, Skill};
use weave_store::{AgentStore, EventStore, FactStore, OrgStore, PatternStore, PgStore, SkillStore};

static TEST_COUNTER: AtomicU64 = AtomicU64::new(1);

fn unique_project(prefix: &str) -> String {
    format!("{prefix}-{}", TEST_COUNTER.fetch_add(1, Ordering::Relaxed))
}

async fn test_store() -> Option<PgStore> {
    let url = std::env::var("TEST_DATABASE_URL").ok()?;
    let pool = PgPoolOptions::new().max_connections(1).connect(&url).await.ok()?;
    let store = PgStore::from_pool(pool);
    store.migrate().await.ok()?;
    Some(store)
}

fn sample_event(project: &str) -> Event {
    Event {
        id: Uuid::new_v4(),
        source: "slack".into(),
        ts: Utc::now(),
        actor: "memo".into(),
        project: project.into(),
        kind: "message".into(),
        payload: json!({"text": "Comment relancer la synchro bancaire ?"}),
        confidence: 1.0,
    }
}

fn sample_fact(project: &str) -> Fact {
    Fact {
        id: Uuid::new_v4(),
        event_id: None,
        project: project.into(),
        team: "ops".into(),
        workstream: "banking".into(),
        ftype: FactType::Answer,
        author: "nicolas".into(),
        topic: "relancer synchro bancaire".into(),
        content: "Utiliser BankSync.rerun(client_id)".into(),
        confidence: 0.95,
        memory_level: MemoryLevel::Project,
        embedding: None,
        created_at: Utc::now(),
    }
}

fn sample_skill(project: &str, name: &str) -> Skill {
    Skill {
        id: Uuid::new_v4(),
        project: project.into(),
        team: "ops".into(),
        workstream: "banking".into(),
        name: name.into(),
        trigger: "Comment relancer la synchro bancaire ?".into(),
        body: "1. Lancer BankSync.rerun(client_id)".into(),
        theme: "synchro bancaire".into(),
        sources: vec![Uuid::new_v4()],
        referents: vec!["nicolas".into()],
        derived_from_pattern: None,
        memory_level: MemoryLevel::Project,
        created_at: Utc::now(),
    }
}

fn sample_agent(project: &str, name: &str) -> Agent {
    Agent {
        id: Uuid::new_v4(),
        project: project.into(),
        team: "ops".into(),
        name: name.into(),
        role: "Tu aides l'équipe ops.".into(),
        domain: "finance-ops".into(),
        description: "Spécialiste des opérations financières.".into(),
        skills: vec!["banking/relancer-synchro".into()],
        scope: MemoryLevel::Team,
        status: AgentStatus::Pending,
        derived_from: "test".into(),
        created_at: Utc::now(),
    }
}

#[tokio::test]
async fn event_dedup_and_reset_are_project_scoped() {
    let Some(store) = test_store().await else {
        eprintln!("skipping postgres integration test: TEST_DATABASE_URL not set or unavailable");
        return;
    };

    let project_a = unique_project("store-a");
    let project_b = unique_project("store-b");

    let event = sample_event(&project_a);
    assert!(store.insert_event(&event).await.unwrap());
    assert!(!store.insert_event(&event).await.unwrap());

    let event_b = sample_event(&project_b);
    assert!(store.insert_event(&event_b).await.unwrap());

    assert_eq!(store.count_events(&project_a).await.unwrap(), 1);
    assert_eq!(store.count_events(&project_b).await.unwrap(), 1);

    store.reset(&project_a).await.unwrap();

    assert_eq!(store.count_events(&project_a).await.unwrap(), 0);
    assert_eq!(store.count_events(&project_b).await.unwrap(), 1);
}

#[tokio::test]
async fn fact_roundtrip_recent_facts_and_scoping_work() {
    let Some(store) = test_store().await else {
        eprintln!("skipping postgres integration test: TEST_DATABASE_URL not set or unavailable");
        return;
    };

    let project = unique_project("store-fact");
    let other_project = unique_project("store-fact-other");
    let fact = sample_fact(&project);
    let other_fact = sample_fact(&other_project);

    store.insert_fact(&fact).await.unwrap();
    store.insert_fact(&other_fact).await.unwrap();

    let recent = store.recent_facts(&project, 10).await.unwrap();
    assert_eq!(recent.len(), 1);
    assert_eq!(recent[0].project, project);
    assert_eq!(recent[0].content, fact.content);
    assert_eq!(recent[0].team, "ops");
    assert_eq!(recent[0].workstream, "banking");

    let other_recent = store.recent_facts(&other_project, 10).await.unwrap();
    assert_eq!(other_recent.len(), 1);
    assert_eq!(other_recent[0].project, other_project);

    let limited = store.recent_facts(&project, 1).await.unwrap();
    assert_eq!(limited.len(), 1);
}

#[tokio::test]
async fn skill_uniqueness_pattern_tracking_and_org_config_roundtrip_work() {
    let Some(store) = test_store().await else {
        eprintln!("skipping postgres integration test: TEST_DATABASE_URL not set or unavailable");
        return;
    };

    let project = unique_project("store-skill");
    let fact = sample_fact(&project);
    store.insert_fact(&fact).await.unwrap();

    let hit1 = store
        .observe(&project, "banking::relancer-synchro", "recurring_question", fact.id)
        .await
        .unwrap();
    let hit2 = store
        .observe(&project, "banking::relancer-synchro", "recurring_question", fact.id)
        .await
        .unwrap();

    assert_eq!(hit1.occurrences, 1);
    assert_eq!(hit2.occurrences, 2);
    assert_eq!(hit2.fact_ids.len(), 2);

    let skill = sample_skill(&project, "banking/relancer-synchro");
    assert!(store.insert_skill(&skill).await.unwrap());
    assert!(!store.insert_skill(&skill).await.unwrap());

    let loaded = store
        .skill_by_name(&project, "banking/relancer-synchro")
        .await
        .unwrap()
        .expect("skill should exist");
    assert_eq!(loaded.team, "ops");
    assert_eq!(loaded.workstream, "banking");

    let cfg = json!({
        "org": project,
        "name": "Test Org",
        "teams": [{"name": "Ops", "members": ["memo"], "projects": []}]
    });
    store.save_org_config(&project, &cfg).await.unwrap();
    let roundtrip = store.get_org_config(&project).await.unwrap().unwrap();
    assert_eq!(roundtrip, cfg);
}

#[tokio::test]
async fn agent_lifecycle_is_scoped_to_project() {
    let Some(store) = test_store().await else {
        eprintln!("skipping postgres integration test: TEST_DATABASE_URL not set or unavailable");
        return;
    };

    let project = unique_project("store-agent");
    let other_project = unique_project("store-agent-other");
    let agent_name = "specialiste-ops-finance-ops";

    let agent = sample_agent(&project, agent_name);
    assert!(store.insert_agent(&agent).await.unwrap());
    store
        .set_agent_status(&project, agent_name, AgentStatus::Active)
        .await
        .unwrap();

    let loaded = store
        .agent_by_name(&project, agent_name)
        .await
        .unwrap()
        .expect("agent should exist");
    assert_eq!(loaded.status, AgentStatus::Active);

    assert!(store.agent_by_name(&other_project, agent_name).await.unwrap().is_none());
}
