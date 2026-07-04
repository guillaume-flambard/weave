//! Ollama adapter — local, no API key. Default provider for offline testing.
//! Talks to the Ollama HTTP API (`/api/chat`). On any transport/parse failure it
//! degrades to the offline [`HeuristicLlm`] so the demo never hard-fails.

use crate::{Extraction, HeuristicLlm, LlmGateway};
use async_trait::async_trait;
use serde_json::json;
use std::time::Duration;
use weave_core::Event;

pub struct OllamaLlm {
    client: reqwest::Client,
    base_url: String,
    model: String,
    fallback: HeuristicLlm,
}

impl OllamaLlm {
    pub fn new(base_url: impl Into<String>, model: impl Into<String>) -> Self {
        OllamaLlm {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(180))
                .build()
                .unwrap_or_default(),
            base_url: base_url.into(),
            model: model.into(),
            fallback: HeuristicLlm::new(),
        }
    }

    async fn chat(&self, system: &str, user: &str, json_mode: bool) -> anyhow::Result<String> {
        let mut body = json!({
            "model": self.model,
            "stream": false,
            "think": false, // qwen3-style reasoning off for clean, fast output
            "options": { "temperature": 0.2 },
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ]
        });
        if json_mode {
            body["format"] = json!("json");
        }

        let resp = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await?
            .error_for_status()?;
        let v: serde_json::Value = resp.json().await?;
        let content = v["message"]["content"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("unexpected Ollama response shape"))?;
        Ok(strip_think(content).to_string())
    }
}

/// Remove `<think>...</think>` blocks some reasoning models emit.
fn strip_think(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find("<think>") {
        out.push_str(&rest[..start]);
        if let Some(end) = rest[start..].find("</think>") {
            rest = &rest[start + end + "</think>".len()..];
        } else {
            rest = "";
            break;
        }
    }
    out.push_str(rest);
    out.trim().to_string()
}

#[async_trait]
impl LlmGateway for OllamaLlm {
    async fn extract(&self, event: &Event) -> anyhow::Result<Extraction> {
        let system = "You extract structured organizational memory from team activity. \
            Return ONLY a JSON object with this exact shape: \
            {\"facts\":[{\"ftype\":\"decision|question|answer|fact\",\"author\":string,\"topic\":string,\"content\":string,\"confidence\":number}],\
            \"entities\":[{\"name\":string,\"kind\":\"person|component|service|concept\"}],\
            \"relationships\":[{\"src\":string,\"dst\":string,\"rel\":string}]}. \
            Keep facts atomic. 'topic' is a short canonical phrase. If the payload contains a 'topic' hint, reuse it verbatim as the fact topic. No prose, JSON only.";
        let user = format!(
            "Source: {}\nActor: {}\nKind: {}\nProject: {}\nPayload: {}",
            event.source, event.actor, event.kind, event.project, event.payload
        );
        match self.chat(system, &user, true).await {
            Ok(text) => match serde_json::from_str::<Extraction>(text.trim()) {
                Ok(ext) if !ext.facts.is_empty() => Ok(ext),
                _ => {
                    tracing::warn!("Ollama extract parse thin/failed; using heuristic");
                    self.fallback.extract(event).await
                }
            },
            Err(e) => {
                tracing::warn!("Ollama extract call failed ({e}); using heuristic");
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
            Output the skill body only: a one-line summary, then numbered steps. No preamble.";
        let user = format!(
            "Recurring question: {question}\nSignature: {signature}\nAnswers observed:\n- {}",
            answers.join("\n- ")
        );
        match self.chat(system, &user, false).await {
            Ok(text) => Ok(text.trim().to_string()),
            Err(e) => {
                tracing::warn!("Ollama synthesize failed ({e}); using heuristic");
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
        match self.chat(&system, &user, true).await {
            Ok(js) => Ok(crate::theme_from_response(&js, trigger)),
            Err(e) => {
                tracing::warn!("Ollama assign_theme failed ({e}); using heuristic");
                self.fallback.assign_theme(trigger, body, existing).await
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
        match self.chat(&system, &user, true).await {
            Ok(js) => Ok(crate::agent_from_response(&js, team, theme, skills)),
            Err(e) => {
                tracing::warn!("Ollama synthesize_agent failed ({e}); using heuristic");
                self.fallback.synthesize_agent(team, theme, skills).await
            }
        }
    }

    async fn answer(&self, question: &str, context: &str) -> anyhow::Result<String> {
        let system = "You are an agent backed by the team's shared cognitive memory. \
            Answer using ONLY the provided context. Be concise and note which memory \
            layer each claim came from.";
        let user = format!("Context:\n{context}\n\nQuestion: {question}");
        match self.chat(system, &user, false).await {
            Ok(text) => Ok(text.trim().to_string()),
            Err(e) => {
                tracing::warn!("Ollama answer failed ({e}); using heuristic");
                self.fallback.answer(question, context).await
            }
        }
    }

    fn name(&self) -> &'static str {
        "ollama"
    }
}
