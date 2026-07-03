import type { Agent, AgentRun, Answer, Fact, OrgCfg, Skill, WeaveStats } from "./types";

const API = process.env.NEXT_PUBLIC_WEAVE_API || "http://127.0.0.1:8787";
const API_KEY = process.env.NEXT_PUBLIC_WEAVE_API_KEY || "";

export { API };

function apiHeaders(extra?: HeadersInit): HeadersInit {
  const base = new Headers(extra);
  if (API_KEY) {
    base.set("Authorization", `Bearer ${API_KEY}`);
    base.set("X-API-Key", API_KEY);
  }
  return base;
}

function extractErrorMessage(status: number, text: string) {
  const trimmed = text.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: string; message?: string; hint?: string };
      if (parsed.error) return parsed.error;
      if (parsed.message) return parsed.message;
      if (parsed.hint) return parsed.hint;
    } catch {
      return trimmed;
    }
  }

  if (status >= 500) {
    return "Le serveur a rencontré une erreur interne (HTTP 500).";
  }
  if (status === 401) {
    return "Accès refusé : clé API manquante ou invalide.";
  }
  if (status === 403) {
    return "Accès interdit.";
  }
  if (status === 404) {
    return "Endpoint introuvable.";
  }
  return `HTTP ${status}`;
}

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = apiHeaders(init?.headers);
  const res = await fetch(input, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(extractErrorMessage(res.status, text));
  }
  return res.json() as Promise<T>;
}

export { extractErrorMessage };

export function getHealth() {
  return fetchJson<{ llm?: string }>(`${API}/health`);
}

export function getPresets() {
  return fetchJson<OrgCfg[]>(`${API}/org/presets`);
}

export function getOrgConfig(project: string) {
  return fetchJson<OrgCfg>(`${API}/org?project=${project}`);
}

export function getSkills(project: string) {
  return fetchJson<Skill[]>(`${API}/skills?project=${project}`);
}

export function getFacts(project: string) {
  return fetchJson<Fact[]>(`${API}/facts?project=${project}`);
}

export function getAgents(project: string) {
  return fetchJson<Agent[]>(`${API}/agents?project=${project}`);
}

export function loadOrg(org: string) {
  return fetchJson(`${API}/org/load`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ org }),
  });
}

export function simulateOrg(project: string) {
  return fetchJson(`${API}/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project }),
  });
}

export function resetProject(project: string) {
  return fetchJson(`${API}/reset?project=${project}`, { method: "POST" });
}

export function askMemory(project: string, question: string) {
  return fetchJson<Answer>(`${API}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, question }),
  });
}

export function approveAgent(project: string, name: string) {
  return fetchJson(`${API}/agents/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, name }),
  });
}

export function injectMessage(project: string, team: string, workstream: string, text: string, actor = "vous") {
  return fetchJson(`${API}/inject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, team, workstream, text, actor }),
  });
}

export function getStats(project: string) {
  return fetchJson<WeaveStats>(`${API}/stats?project=${encodeURIComponent(project)}`);
}

export function runAgent(project: string, agent: string, task: string) {
  return fetchJson<AgentRun>(`${API}/agents/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, agent, task }),
  });
}

export function ingestSlack(project?: string) {
  const q = project ? `?project=${encodeURIComponent(project)}` : "";
  return fetchJson<{ ingested?: number; message?: string }>(`${API}/ingest/slack${q}`, { method: "POST" });
}

