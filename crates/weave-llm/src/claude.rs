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
            Ok(text) => match crate::parse_json_lenient::<Extraction>(&text) {
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

    async fn assign_theme(
        &self,
        trigger: &str,
        body: &str,
        existing: &[String],
    ) -> anyhow::Result<String> {
        let (system, user) = crate::theme_prompt(trigger, body, existing);
        match self.complete(&system, &user, 60).await {
            Ok(js) => Ok(crate::theme_from_response(&js, trigger)),
            Err(e) => {
                tracing::warn!("Claude assign_theme failed ({e}); using heuristic");
                self.fallback.assign_theme(trigger, body, existing).await
            }
        }
    }

    async fn canonicalize_topic(
        &self,
        raw_topic: &str,
        existing: &[String],
    ) -> anyhow::Result<String> {
        let (system, user) = crate::canonicalize_prompt(raw_topic, existing);
        match self.complete(&system, &user, 60).await {
            Ok(js) => Ok(crate::canonical_from_response(&js, raw_topic)),
            Err(e) => {
                tracing::warn!("canonicalize_topic failed ({e}); using heuristic");
                self.fallback.canonicalize_topic(raw_topic, existing).await
            }
        }
    }

    async fn synthesize_agent(
        &self,
        team: &str,
        theme: &str,
        skills: &[crate::SkillBrief],
    ) -> anyhow::Result<crate::AgentSpec> {
        let (system, user) = crate::agent_prompt(team, theme, skills);
        match self.complete(&system, &user, 400).await {
            Ok(js) => Ok(crate::agent_from_response(&js, team, theme, skills)),
            Err(e) => {
                tracing::warn!("Claude synthesize_agent failed ({e}); using heuristic");
                self.fallback.synthesize_agent(team, theme, skills).await
            }
        }
    }

    async fn answer(&self, question: &str, context: &str) -> anyhow::Result<String> {
        let system = "You are an agent backed by the team's shared cognitive memory. \
            When the provided context covers the question, answer from it and cite only the \
            memory-layer names that literally appear in the context. \
            When the context does not cover the question, do NOT invent any citation or memory \
            layer; give a brief general answer, prefix it with 'De façon générale : ', and note \
            if you are unsure. Reply in the question's language. Be concise.";
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
