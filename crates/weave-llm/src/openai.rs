use crate::{Extraction, HeuristicLlm, LlmGateway};
use async_trait::async_trait;
use serde_json::json;
use std::time::Duration;
use weave_core::Event;

pub struct OpenaiLlm {
    client: reqwest::Client,
    base_url: String,
    model: String,
    api_key: String,
    fallback: HeuristicLlm,
}

impl OpenaiLlm {
    pub fn new(
        base_url: impl Into<String>,
        model: impl Into<String>,
        api_key: impl Into<String>,
    ) -> Self {
        OpenaiLlm {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(180))
                .build()
                .unwrap_or_default(),
            base_url: base_url.into(),
            model: model.into(),
            api_key: api_key.into(),
            fallback: HeuristicLlm::new(),
        }
    }

    async fn chat(&self, system: &str, user: &str, json_mode: bool) -> anyhow::Result<String> {
        let mut body = json!({
            "model": self.model,
            "stream": false,
            "temperature": 0.2,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ]
        });
        if json_mode {
            body["response_format"] = json!({ "type": "json_object" });
        }

        let resp = self
            .client
            .post(format!("{}/chat/completions", self.base_url.trim_end_matches('/')))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?
            .error_for_status()?;
        let v: serde_json::Value = resp.json().await?;
        let content = v["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("unexpected OpenAI response shape"))?;
        Ok(content.to_string())
    }
}

#[async_trait]
impl LlmGateway for OpenaiLlm {
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
                    tracing::warn!("OpenAI extract parse thin/failed; using heuristic");
                    self.fallback.extract(event).await
                }
            },
            Err(e) => {
                tracing::warn!("OpenAI extract call failed ({e}); using heuristic");
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
                tracing::warn!("OpenAI synthesize failed ({e}); using heuristic");
                self.fallback
                    .synthesize_skill(signature, question, answers)
                    .await
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
                tracing::warn!("OpenAI answer failed ({e}); using heuristic");
                self.fallback.answer(question, context).await
            }
        }
    }

    fn name(&self) -> &'static str {
        "openai"
    }
}
