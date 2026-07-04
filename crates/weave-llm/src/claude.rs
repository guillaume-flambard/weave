//! Anthropic (Claude) adapter. Used when `ANTHROPIC_API_KEY` is set. Extraction
//! asks Claude for strict JSON; on any transport/parse failure it degrades
//! gracefully to the offline [`HeuristicLlm`] so a demo never hard-fails.

use crate::{Extraction, HeuristicLlm, LlmGateway};
use async_trait::async_trait;
use serde_json::json;
use weave_core::Event;

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

pub struct ClaudeLlm {
    client: reqwest::Client,
    api_key: String,
    model: String,
    fallback: HeuristicLlm,
}

impl ClaudeLlm {
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Self {
        ClaudeLlm {
            client: reqwest::Client::new(),
            api_key: api_key.into(),
            model: model.into(),
            fallback: HeuristicLlm::new(),
        }
    }

    async fn complete(&self, system: &str, user: &str, max_tokens: u32) -> anyhow::Result<String> {
        let resp = self
            .client
            .post(API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&json!({
                "model": self.model,
                "max_tokens": max_tokens,
                "system": system,
                "messages": [{ "role": "user", "content": user }],
            }))
            .send()
            .await?
            .error_for_status()?;

        let body: serde_json::Value = resp.json().await?;
        let text = body["content"][0]["text"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("unexpected Claude response shape"))?
            .to_string();
        Ok(text)
    }
}

/// Strip ```json fences if the model wrapped its output.
fn unfence(s: &str) -> &str {
    let s = s.trim();
    if let Some(rest) = s.strip_prefix("```json") {
        return rest.trim_end_matches("```").trim();
    }
    if let Some(rest) = s.strip_prefix("```") {
        return rest.trim_end_matches("```").trim();
    }
    s
}

#[async_trait]
impl LlmGateway for ClaudeLlm {
    async fn extract(&self, event: &Event) -> anyhow::Result<Extraction> {
        let system = "You extract structured organizational memory from team activity. \
            Return ONLY valid JSON matching this shape: \
            {\"facts\":[{\"ftype\":\"decision|question|answer|fact\",\"author\":str,\"topic\":str,\"content\":str,\"confidence\":0..1}],\
            \"entities\":[{\"name\":str,\"kind\":\"person|component|service|concept\"}],\
            \"relationships\":[{\"src\":str,\"dst\":str,\"rel\":str}]}. \
            Keep facts atomic. topic is a short canonical phrase.";
        let user = format!(
            "Source: {}\nActor: {}\nKind: {}\nProject: {}\nPayload: {}",
            event.source, event.actor, event.kind, event.project, event.payload
        );

        match self.complete(system, &user, 1024).await {
            Ok(text) => match serde_json::from_str::<Extraction>(unfence(&text)) {
                Ok(ext) => Ok(ext),
                Err(e) => {
                    tracing::warn!("Claude extract parse failed ({e}); using heuristic");
                    self.fallback.extract(event).await
                }
            },
            Err(e) => {
                tracing::warn!("Claude extract call failed ({e}); using heuristic");
                self.fallback.extract(event).await
            }
        }
    }

    async fn synthesize_skill(
        &self,
        signature: &str,
        question: &str,
        answers: &[String],
    ) -> anyhow::Result<String> {
        let system = "You write concise, reusable team skills (runbooks) in Markdown. \
            Output the skill body only: a one-line summary, then numbered steps, then a \
            'Referents' and 'Sources' note if relevant. No preamble.";
        let user = format!(
            "Recurring question: {question}\nSignature: {signature}\nAnswers observed:\n- {}",
            answers.join("\n- ")
        );
        match self.complete(system, &user, 800).await {
            Ok(text) => Ok(text.trim().to_string()),
            Err(e) => {
                tracing::warn!("Claude synthesize failed ({e}); using heuristic");
                self.fallback
                    .synthesize_skill(signature, question, answers)
                    .await
            }
        }
    }

    async fn assign_theme(&self, trigger: &str, body: &str) -> anyhow::Result<String> {
        let system = "Tu classes une compétence d'équipe par domaine métier. Réponds par le \
            domaine LARGE et réutilisable, le plus général possible (1 à 2 mots max), en \
            minuscules, sans ponctuation. Vise un domaine que plusieurs compétences proches \
            partageraient. Le domaine seul, rien d'autre.";
        let user = format!("Déclencheur: {trigger}\nProcédure: {body}");
        match self.complete(system, &user, 40).await {
            Ok(t) => {
                let theme = t.trim().lines().next().unwrap_or("").trim().to_lowercase();
                Ok(if theme.is_empty() { crate::heuristic_theme(trigger) } else { theme })
            }
            Err(e) => {
                tracing::warn!("Claude assign_theme failed ({e}); using heuristic");
                self.fallback.assign_theme(trigger, body).await
            }
        }
    }

    async fn synthesize_agent(
        &self,
        team: &str,
        theme: &str,
        skills: &[crate::SkillBrief],
    ) -> anyhow::Result<crate::AgentSpec> {
        let list = skills
            .iter()
            .map(|s| format!("- {} : {}", s.trigger, s.body))
            .collect::<Vec<_>>()
            .join("\n");
        let system = "Tu conçois un agent spécialiste d'équipe. Réponds en JSON strict \
            {\"name\":..,\"role\":..,\"description\":..} : name = identifiant court en kebab-case ; \
            role = mandat en 2 phrases ; description = une phrase.";
        let user = format!("Équipe: {team}\nThème: {theme}\nCompétences:\n{list}");
        match self.complete(system, &user, 400).await {
            Ok(js) => Ok(serde_json::from_str::<crate::AgentSpec>(js.trim())
                .unwrap_or_else(|_| crate::heuristic_agent_spec(team, theme, skills))),
            Err(e) => {
                tracing::warn!("Claude synthesize_agent failed ({e}); using heuristic");
                self.fallback.synthesize_agent(team, theme, skills).await
            }
        }
    }

    async fn answer(&self, question: &str, context: &str) -> anyhow::Result<String> {
        let system = "You are an agent backed by the team's shared cognitive memory. \
            Answer using ONLY the provided context. Be concise and cite which memory \
            layer each claim came from.";
        let user = format!("Context:\n{context}\n\nQuestion: {question}");
        match self.complete(system, &user, 700).await {
            Ok(text) => Ok(text.trim().to_string()),
            Err(e) => {
                tracing::warn!("Claude answer failed ({e}); using heuristic");
                self.fallback.answer(question, context).await
            }
        }
    }

    fn name(&self) -> &'static str {
        "claude"
    }
}
