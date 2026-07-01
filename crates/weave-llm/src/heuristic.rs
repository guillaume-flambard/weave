//! Offline, rule-based gateway. Deterministic and network-free so tests and the
//! demo run without an API key. It reads optional `topic` / `entities` /
//! `relationships` hint fields from an event payload when present, and otherwise
//! infers a best-effort classification. Claude (see `claude.rs`) replaces this
//! with real inference when `ANTHROPIC_API_KEY` is set.

use crate::{ExtractedEntity, ExtractedFact, ExtractedRelationship, Extraction, LlmGateway};
use async_trait::async_trait;
use weave_core::Event;

const DECISION_MARKERS: &[&str] = &[
    "décidé", "decidé", "sera ", "va être", "on part sur", "on utilise",
    "validé", "valide", "let's go", "we'll use", "we will use", "decided",
    "choisi", "final:", "on garde", "we chose",
];

pub struct HeuristicLlm;

impl HeuristicLlm {
    pub fn new() -> Self {
        HeuristicLlm
    }

    fn classify(event: &Event, text: &str) -> (String, f32) {
        let lower = text.to_lowercase();
        if lower.contains('?') || event.kind == "question" {
            return ("question".into(), 0.85);
        }
        if DECISION_MARKERS.iter().any(|m| lower.contains(m)) {
            return ("decision".into(), 0.92);
        }
        if event.kind == "answer" || event.payload.get("reply_to").is_some() {
            return ("answer".into(), 0.8);
        }
        ("fact".into(), 0.72)
    }

    fn topic(event: &Event, text: &str) -> String {
        if let Some(t) = event.payload.get("topic").and_then(|v| v.as_str()) {
            return t.to_string();
        }
        // Fall back to the leading clause of the text.
        let clause = text.split(['.', '\n', '!']).next().unwrap_or(text);
        clause.chars().take(80).collect::<String>().trim().to_string()
    }

    fn hinted_entities(event: &Event) -> Vec<ExtractedEntity> {
        event
            .payload
            .get("entities")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|e| {
                        Some(ExtractedEntity {
                            name: e.get("name")?.as_str()?.to_string(),
                            kind: e
                                .get("kind")
                                .and_then(|k| k.as_str())
                                .unwrap_or("concept")
                                .to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn hinted_relationships(event: &Event) -> Vec<ExtractedRelationship> {
        event
            .payload
            .get("relationships")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|r| {
                        Some(ExtractedRelationship {
                            src: r.get("src")?.as_str()?.to_string(),
                            dst: r.get("dst")?.as_str()?.to_string(),
                            rel: r
                                .get("rel")
                                .and_then(|k| k.as_str())
                                .unwrap_or("related_to")
                                .to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }
}

impl Default for HeuristicLlm {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LlmGateway for HeuristicLlm {
    async fn extract(&self, event: &Event) -> anyhow::Result<Extraction> {
        let text = event.text();
        if text.trim().is_empty() {
            return Ok(Extraction::default());
        }
        let (ftype, confidence) = Self::classify(event, &text);
        let topic = Self::topic(event, &text);

        let mut entities = Self::hinted_entities(event);
        // The actor is always a person entity.
        entities.push(ExtractedEntity {
            name: event.actor.clone(),
            kind: "person".into(),
        });

        Ok(Extraction {
            facts: vec![ExtractedFact {
                ftype,
                author: event.actor.clone(),
                topic,
                content: text,
                confidence,
            }],
            entities,
            relationships: Self::hinted_relationships(event),
        })
    }

    async fn synthesize_skill(
        &self,
        _signature: &str,
        question: &str,
        answers: &[String],
    ) -> anyhow::Result<String> {
        let mut seen = Vec::new();
        for a in answers {
            let a = a.trim();
            if !a.is_empty() && !seen.iter().any(|s: &String| s.eq_ignore_ascii_case(a)) {
                seen.push(a.to_string());
            }
        }
        let steps = seen
            .iter()
            .enumerate()
            .map(|(i, a)| format!("{}. {}", i + 1, a))
            .collect::<Vec<_>>()
            .join("\n");
        Ok(format!(
            "## {question}\n\nThis skill emerged from {n} recurring answers across the team.\n\n{steps}",
            n = answers.len()
        ))
    }

    async fn answer(&self, question: &str, context: &str) -> anyhow::Result<String> {
        Ok(format!(
            "Based on the team's shared memory:\n\n{context}\n\n(Answer to: {question})"
        ))
    }

    fn name(&self) -> &'static str {
        "heuristic-offline"
    }
}
