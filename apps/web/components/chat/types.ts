import type { Answer, Feed } from "../../lib/types";

export type ChatBlock =
  | { type: "text"; role: "user" | "assistant"; content: string }
  | { type: "system"; content: string; kind?: "info" | "success" | "error" }
  | { type: "connector_setup" }
  | { type: "feed_strip"; limit?: number }
  | { type: "feed_event"; event: Feed }
  | { type: "memory_snapshot" }
  | { type: "agent_queue" }
  | { type: "answer"; data: Answer }
  | { type: "kpi_overview" }
  | { type: "governance_summary" }
  | { type: "sim_progress" }
  | { type: "next_steps" }
  | { type: "onboarding"; stepId: import("./onboarding/onboarding-steps").OnboardingStepId };

export type ChatTurn = {
  id: string;
  userText?: string;
  blocks: ChatBlock[];
};

export type ParsedIntent =
  | { kind: "sources" }
  | { kind: "simulate" }
  | { kind: "ask"; question: string }
  | { kind: "agents" }
  | { kind: "memory" }
  | { kind: "overview" }
  | { kind: "govern" }
  | { kind: "scope"; team: string }
  | { kind: "help" }
  | { kind: "freeform"; text: string };
