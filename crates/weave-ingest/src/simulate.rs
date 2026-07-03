//! Bring-your-own-org sandbox: presets + a deterministic activity generator.
//!
//! Given an [`OrgConfig`] (teams → projects → people), it fabricates a realistic
//! multi-project activity stream where recurring needs make skills emerge per
//! project, a shared convention becomes an org-level skill, and each team grows a
//! specialist agent. Deterministic (fast, reproducible); an optional LLM pass can
//! naturalize the phrasing.

use chrono::{Duration, Utc};
use serde_json::json;
use uuid::Uuid;
use weave_core::{Event, OrgConfig, Project, Team};

/// Ready-made organizations the tester can load and tweak in the dashboard.
pub fn presets() -> Vec<OrgConfig> {
    vec![
        OrgConfig {
            org: "pennylane".into(),
            name: "PennyLane (fintech / compta)".into(),
            teams: vec![
                Team {
                    name: "Data".into(),
                    members: vec!["nicolas".into(), "lea".into(), "camille".into(), "sarah".into()],
                    projects: vec![
                        Project { name: "Synchro bancaire".into(), theme: "relancer la synchro bancaire d'un client".into(), domain: "finance-ops".into() },
                        Project { name: "Réconciliation".into(), theme: "lancer la réconciliation des écritures".into(), domain: "finance-ops".into() },
                    ],
                },
                Team {
                    name: "Produit".into(),
                    members: vec!["arthur".into(), "julie".into(), "tom".into(), "nina".into()],
                    projects: vec![
                        Project { name: "Checkout".into(), theme: "déployer le checkout en staging".into(), domain: "engineering".into() },
                        Project { name: "App mobile".into(), theme: "publier une build mobile en staging".into(), domain: "engineering".into() },
                    ],
                },
                Team {
                    name: "Growth".into(),
                    members: vec!["marc".into(), "sophie".into(), "alex".into()],
                    projects: vec![
                        Project { name: "Acquisition".into(), theme: "lancer une campagne d'acquisition".into(), domain: "growth".into() },
                        Project { name: "Onboarding".into(), theme: "optimiser le funnel d'onboarding".into(), domain: "growth".into() },
                    ],
                },
            ],
        },
        OrgConfig {
            org: "acme".into(),
            name: "Acme (startup SaaS)".into(),
            teams: vec![
                Team {
                    name: "Engineering".into(),
                    members: vec!["sam".into(), "lou".into(), "kim".into(), "raj".into()],
                    projects: vec![
                        Project { name: "API".into(), theme: "déployer l'API en staging".into(), domain: "engineering".into() },
                        Project { name: "Web".into(), theme: "faire un hotfix en production".into(), domain: "engineering".into() },
                    ],
                },
                Team {
                    name: "Data".into(),
                    members: vec!["mira".into(), "eli".into(), "noa".into()],
                    projects: vec![
                        Project { name: "Analytics".into(), theme: "relancer le pipeline data".into(), domain: "data".into() },
                        Project { name: "Modèles".into(), theme: "réentraîner le modèle de scoring".into(), domain: "data".into() },
                    ],
                },
            ],
        },
    ]
}

pub fn preset_by_org(org: &str) -> Option<OrgConfig> {
    presets().into_iter().find(|p| p.org == org)
}

struct Kit {
    answers: [&'static str; 2],
    entities: &'static [(&'static str, &'static str)],
}

fn kit(domain: &str) -> Kit {
    match domain {
        "finance-ops" => Kit {
            answers: [
                "rails runner 'BankSync.rerun(client_id)', puis vérifie le dashboard Bridge sur Grafana. Runbook Notion à jour.",
                "en console: BankSync.rerun(client_id), et check les webhooks Bridge côté réconciliation.",
            ],
            entities: &[("Bridge", "service"), ("Grafana", "service")],
        },
        "engineering" => Kit {
            answers: [
                "git push origin staging, puis ./deploy.sh staging. Vérifie le pipeline CI et les logs.",
                "lance ./deploy.sh staging après la CI verte ; en cas de souci, rollback avec ./deploy.sh --rollback.",
            ],
            entities: &[("CI", "service"), ("staging", "environment")],
        },
        "data" => Kit {
            answers: [
                "dbt run --select le modèle concerné, puis vérifie le warehouse et le mapping des colonnes.",
                "relance l'ingestion ETL, contrôle les métriques dans le dashboard data.",
            ],
            entities: &[("dbt", "tool"), ("warehouse", "service")],
        },
        "growth" => Kit {
            answers: [
                "duplique la campagne, ajuste le ciblage, et suis la conversion dans le funnel.",
                "vérifie le budget ads, lance l'acquisition, et regarde le taux d'activation.",
            ],
            entities: &[("funnel", "concept"), ("ads", "channel")],
        },
        _ => Kit {
            answers: [
                "suis la procédure documentée dans le runbook, puis vérifie le résultat.",
                "reprends les étapes standard de l'équipe et valide avec un référent.",
            ],
            entities: &[],
        },
    }
}

/// 5 question phrasings around one action (drives recurrence → a skill).
fn question_variants(action: &str) -> [String; 5] {
    [
        format!("Comment {action} ?"),
        format!("Quelqu'un sait comment {action} ?"),
        format!("Je dois {action}, comment on fait déjà ?"),
        format!("Comment faire pour {action} ?"),
        format!("Rappel : comment {action} ?"),
    ]
}

const CONVENTION: &str = "respecter la convention de nommage des branches (kebab-case)";

/// Deterministically generate the org's activity stream (oldest first).
pub fn generate_events(org: &OrgConfig) -> Vec<Event> {
    let base = Utc::now() - Duration::minutes(180);
    let mut i = 0i64;
    let mut out: Vec<Event> = Vec::new();

    let mut push = |team: &str, ws: &str, actor: &str, text: String, topic: &str, answer: bool, is_decision: bool, entities: serde_json::Value, idx: &mut i64| {
        *idx += 1;
        let source = if answer || is_decision { "notion" } else { "slack" };
        let kind = if answer || is_decision { "doc_edit" } else { "message" };
        let mut payload = json!({
            "text": text, "topic": topic, "team": team, "workstream": ws
        });
        if answer {
            payload["reply_to"] = json!(format!("{ws}:{topic}"));
        }
        if !entities.as_array().map(|a| a.is_empty()).unwrap_or(true) {
            payload["entities"] = entities;
        }
        out.push(Event {
            id: Uuid::new_v4(),
            source: source.into(),
            ts: base + Duration::minutes(*idx),
            actor: actor.to_string(),
            project: org.org.clone(),
            kind: kind.into(),
            payload,
            confidence: 1.0,
        });
    };

    for (ti, team) in org.teams.iter().enumerate() {
        let team_slug = OrgConfig::slug(&team.name);
        let members = if team.members.is_empty() {
            vec!["membre".to_string()]
        } else {
            team.members.clone()
        };
        let referent = members[0].clone();

        for (pi, project) in team.projects.iter().enumerate() {
            let ws = OrgConfig::slug(&project.name);
            let k = kit(&project.domain);
            let ents = json!(k.entities.iter().map(|(n, kind)| json!({"name": n, "kind": kind})).collect::<Vec<_>>());

            // A decision framing the project.
            push(&team_slug, &ws, &referent,
                format!("Décision équipe {} : on avance sur « {} ».", team.name, project.name),
                &format!("{} — cadrage", project.name), false, true, ents.clone(), &mut i);

            // The recurring need → a project skill emerges. Answers are
            // interleaved early so they're in memory before the threshold hits.
            let qs = question_variants(&project.theme);
            for (qi, q) in qs.iter().enumerate() {
                if qi == 2 {
                    for a in k.answers {
                        push(&team_slug, &ws, &referent, a.to_string(), &project.theme, true, false, json!([]), &mut i);
                    }
                }
                let actor = &members[qi % members.len()];
                push(&team_slug, &ws, actor, q.clone(), &project.theme, false, false, json!([]), &mut i);
            }

            // Shared org convention, seeded in the first project of each team →
            // once ≥2 teams have it, an org-level skill is promoted.
            if pi == 0 && ti < 3 {
                let cqs = question_variants(CONVENTION);
                for (qi, q) in cqs.iter().enumerate() {
                    if qi == 2 {
                        push(&team_slug, &ws, &referent,
                            "On préfixe par le type et on met tout en kebab-case, ex: feat/relance-synchro.".into(),
                            CONVENTION, true, false, json!([]), &mut i);
                    }
                    let actor = &members[qi % members.len()];
                    push(&team_slug, &ws, actor, q.clone(), CONVENTION, false, false, json!([]), &mut i);
                }
            }
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_scoped_multiproject_activity() {
        let org = &presets()[0];
        let evs = generate_events(org);
        assert!(evs.len() > 40);
        // Every event is scoped to a team + workstream.
        assert!(evs.iter().all(|e| e.payload.get("team").is_some() && e.payload.get("workstream").is_some()));
        assert!(evs.iter().all(|e| e.source == "slack" || e.source == "notion"));
        // The convention recurs across at least two distinct workstreams.
        let conv_ws: std::collections::HashSet<_> = evs.iter()
            .filter(|e| e.payload["topic"] == CONVENTION)
            .map(|e| e.payload["workstream"].as_str().unwrap_or("").to_string())
            .collect();
        assert!(conv_ws.len() >= 2, "convention should span ≥2 workstreams");
    }
}
