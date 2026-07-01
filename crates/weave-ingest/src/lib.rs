//! Ingestion: a `Connector` port + the scripted seed dataset.
//!
//! Real connectors (Slack, GitHub, Notion, Linear) will implement [`Connector`]
//! later. For the MVP we replay a hand-authored stream modeled on a fintech /
//! accounting product team (PennyLane-style): bank-sync via aggregators
//! (Bridge, Budget Insight), Stripe subscriptions, FEC export, with Notion
//! runbooks referenced. Crucially, the same "relancer la synchro bancaire"
//! question is asked repeatedly, so a skill visibly emerges.

use async_trait::async_trait;
use chrono::{Duration, Utc};
use serde_json::json;
use uuid::Uuid;
use weave_core::Event;

mod slack;
mod simulate;
pub use simulate::{generate_events, preset_by_org, presets};
pub use slack::{parse_history as parse_slack_history, SlackConnector};

/// A source of events. The seam where a real Slack/GitHub/Notion connector plugs in.
#[async_trait]
pub trait Connector: Send + Sync {
    fn source(&self) -> &str;
    /// Pull the next batch of events. Seed connector returns everything once.
    async fn poll(&self) -> anyhow::Result<Vec<Event>>;
}

/// Replays the scripted seed dataset.
pub struct SeedConnector;

#[async_trait]
impl Connector for SeedConnector {
    fn source(&self) -> &str {
        "seed"
    }
    async fn poll(&self) -> anyhow::Result<Vec<Event>> {
        Ok(seed_events())
    }
}

const PROJECT: &str = "pennylane";

/// The full seed stream, oldest first.
pub fn seed_events() -> Vec<Event> {
    let base = Utc::now() - Duration::minutes(120);
    let mut i = 0i64;
    let mut mk = |source: &str, actor: &str, kind: &str, payload: serde_json::Value| {
        i += 1;
        Event {
            id: Uuid::new_v4(),
            source: source.to_string(),
            ts: base + Duration::minutes(i),
            actor: actor.to_string(),
            project: PROJECT.to_string(),
            kind: kind.to_string(),
            payload,
            confidence: 1.0,
        }
    };

    // The recurring bank-sync question/answers share one canonical topic so they
    // collapse to a single pattern signature regardless of phrasing.
    let sync_topic = "relancer la synchro bancaire";
    let q = |text: &str| json!({ "text": text, "topic": sync_topic });
    let a = |text: &str| {
        json!({ "text": text, "topic": sync_topic, "reply_to": "banksync-thread" })
    };

    // A second recurring finance thread (Stripe webhooks) → a second skill, so
    // the "finance-ops" domain reaches the threshold and a specialist emerges.
    let wh_topic = "rejouer un webhook stripe";
    let wq = |text: &str| json!({ "text": text, "topic": wh_topic });
    let wa = |text: &str| json!({ "text": text, "topic": wh_topic, "reply_to": "webhook-thread" });

    vec![
        // --- Decision trail + entity graph (fintech domain) ---
        mk("slack", "arthur", "message", json!({
            "text": "Décision: on migre l'agrégation bancaire de Budget Insight vers Bridge.",
            "topic": "Agrégation bancaire",
            "entities": [
                {"name": "Bridge", "kind": "service"},
                {"name": "Budget Insight", "kind": "service"},
                {"name": "Bank Sync", "kind": "component"}
            ],
            "relationships": [{"src": "Bank Sync", "dst": "Bridge", "rel": "depends_on"}]
        })),
        mk("notion", "lea", "doc_edit", json!({
            "text": "RFC Réconciliation bancaire rédigée (matching écritures ↔ transactions Bridge).",
            "topic": "Réconciliation bancaire",
            "entities": [{"name": "Réconciliation", "kind": "component"}]
        })),
        mk("slack", "lea", "message", json!({
            "text": "On utilise Stripe pour les abonnements PennyLane.",
            "topic": "Abonnements",
            "entities": [
                {"name": "Stripe", "kind": "service"},
                {"name": "Subscriptions", "kind": "component"}
            ],
            "relationships": [{"src": "Subscriptions", "dst": "Stripe", "rel": "depends_on"}]
        })),
        mk("github", "nicolas", "pr", json!({
            "text": "Merged PR #128: Bridge webhook handler pour les transactions bancaires.",
            "topic": "Agrégation bancaire",
            "entities": [{"name": "Bridge", "kind": "service"}]
        })),
        mk("slack", "sophie", "message", json!({
            "text": "Convention: toute écriture comptable doit être idempotente (clé d'idempotence obligatoire).",
            "topic": "Convention comptable",
            "entities": [{"name": "Écriture comptable", "kind": "concept"}]
        })),
        mk("notion", "camille", "doc_edit", json!({
            "text": "L'export FEC doit rester conforme à l'arrêté A47 A-1.",
            "topic": "Export FEC",
            "entities": [{"name": "FEC Export", "kind": "component"}]
        })),
        mk("linear", "nicolas", "issue", json!({
            "text": "LEDG-231: mapping des catégories Bridge vers le plan comptable.",
            "topic": "Agrégation bancaire"
        })),

        // --- The recurring "relancer la synchro bancaire" thread (the pattern) ---
        mk("slack", "sarah", "message", q("Comment relancer la synchro bancaire d'un client ?")),
        mk("slack", "nicolas", "message", a(
            "Pour relancer la synchro bancaire: rails runner 'BankSync.rerun(client_id)', puis vérifie le dashboard Bridge sur Grafana. Runbook Notion: 'Resync bancaire'.",
        )),
        mk("slack", "tom", "message", q("Comment on force une resynchro bancaire déjà ?")),
        mk("slack", "nicolas", "message", a(
            "Lance BankSync.rerun(client_id) en console, et check les webhooks Bridge.",
        )),
        mk("slack", "camille", "message", q("Comment je relance la synchro bancaire en staging ?")),
        mk("slack", "nicolas", "message", a(
            "Rappel: BankSync.rerun(client_id), puis regarde les logs Grafana pour les erreurs de mapping.",
        )),
        mk("slack", "alex", "message", q("comment relancer synchro bancaire")),
        mk("slack", "lea", "message", q("Comment refaire tourner la synchro banque pour un client ?")),

        // --- Second recurring finance thread: replay a Stripe webhook ---
        mk("slack", "tom", "message", wq("Comment rejouer un webhook Stripe échoué ?")),
        mk("slack", "camille", "message", wa(
            "Pour rejouer un webhook Stripe: va dans le dashboard Stripe > Webhooks, sélectionne l'événement, clique 'Resend'. Ou en console: StripeWebhook.replay(event_id).",
        )),
        mk("slack", "sarah", "message", wq("Comment on relance un webhook Stripe déjà ?")),
        mk("slack", "camille", "message", wa(
            "StripeWebhook.replay(event_id) en console, puis vérifie l'abonnement côté PennyLane.",
        )),
        mk("slack", "alex", "message", wq("Comment rejouer un webhook stripe")),
        mk("slack", "nina", "message", wq("Comment refaire passer un webhook de paiement Stripe ?")),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_has_the_recurring_pattern() {
        let evs = seed_events();
        let sync = evs
            .iter()
            .filter(|e| {
                let t = e.text().to_lowercase();
                t.contains("synchro") || t.contains("resync") || t.contains("banksync")
            })
            .count();
        assert!(sync >= 6, "expected the bank-sync pattern to recur, got {sync}");
        assert!(evs.iter().all(|e| e.project == PROJECT));
    }
}
