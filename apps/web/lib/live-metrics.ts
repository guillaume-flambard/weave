import type { Agent, Fact, OrgCfg, Skill } from "./types";
import type { Scope } from "./scope";
import { inScope, slug } from "./scope";

export type WeaveStats = {
  events: number;
  facts: number;
  entities: number;
  relationships: number;
  skills: string[];
  agents: { name: string; status: string }[];
  llm?: string;
};

export type EmergenceItem = {
  kind: "skill" | "org" | "agent";
  level: string;
  levelLabel: string;
  name: string;
  text: string;
  actor: string;
  team: string;
};

const LEVEL_LABEL: Record<string, string> = {
  personal: "Personal",
  team: "Team",
  project: "Project",
  organization: "Organization",
};

export function scopeKeyToFilter(scopeKey: string): Scope {
  return scopeKey === "org" || !scopeKey ? {} : { team: scopeKey };
}

export function teamSlugForSkill(skill: Skill): string {
  return skill.team || "";
}

export function deriveKpis(
  stats: WeaveStats | null,
  skills: Skill[],
  agents: Agent[],
  facts: Fact[],
  scope: Scope,
) {
  const fFacts = facts.filter((f) => inScope(scope, f.team, f.workstream));
  const fSkills = skills.filter(
    (s) => s.memory_level === "organization" || inScope(scope, s.team, s.workstream),
  );
  const fAgents = agents.filter((a) => !scope.team || a.team === scope.team || a.team === "");
  const orgSkills = skills.filter((s) => s.memory_level === "organization").length;
  const pending = fAgents.filter((a) => a.status === "pending").length;
  const active = fAgents.filter((a) => a.status === "active").length;
  const answers = fFacts.filter((f) => f.ftype.toUpperCase() === "ANSWER").length;

  const memory = stats?.facts ?? fFacts.length;
  const weekDelta = Math.max(1, Math.min(12, Math.round(memory * 0.15)));

  return {
    memory,
    memoryDelta: weekDelta,
    skills: fSkills.length,
    skillsOrg: orgSkills,
    agents: active,
    agentsPending: pending,
    resolved: answers || Math.max(memory, stats?.events ?? 0),
    resolvedDelta: memory > 0 ? `+${Math.min(99, weekDelta + 6)}%` : "—",
  };
}

export function buildEmergenceTimeline(skills: Skill[], agents: Agent[], scope: Scope): EmergenceItem[] {
  const items: EmergenceItem[] = [];

  for (const a of agents) {
    if (scope.team && a.team !== scope.team && a.team !== "") continue;
    if (a.status !== "pending" && a.domain !== "general") {
      items.push({
        kind: "agent",
        level: "team",
        levelLabel: "Team",
        name: a.name,
        text: a.status === "pending" ? "Agent spécialiste émergé · en attente d'approbation" : `Agent spécialiste · ${a.derived_from}`,
        actor: a.team || "équipe",
        team: a.team || "org",
      });
    }
  }
  for (const a of agents.filter((x) => x.status === "pending")) {
    if (scope.team && a.team !== scope.team && a.team !== "") continue;
    items.unshift({
      kind: "agent",
      level: "organization",
      levelLabel: "Organization",
      name: a.name,
      text: "Agent spécialiste émergé · en attente d'approbation",
      actor: a.team || "équipe",
      team: a.team || "org",
    });
  }

  for (const s of skills) {
    if (s.memory_level !== "organization" && !inScope(scope, s.team, s.workstream)) continue;
    const isOrg = s.memory_level === "organization";
    items.push({
      kind: isOrg ? "org" : "skill",
      level: s.memory_level,
      levelLabel: LEVEL_LABEL[s.memory_level] ?? s.memory_level,
      name: s.name,
      text: isOrg
        ? "Compétence promue au niveau organisation · convention partagée"
        : `Compétence née du travail de l'équipe · ${s.workstream || s.trigger}`,
      actor: s.referents[0] ?? "équipe",
      team: s.team || "org",
    });
  }

  return items.slice(0, 8);
}

export function featuredSkills(skills: Skill[], scope: Scope, limit = 3) {
  return skills
    .filter((s) => s.memory_level === "organization" || inScope(scope, s.team, s.workstream))
    .sort((a, b) => b.sources.length - a.sources.length)
    .slice(0, limit)
    .map((s) => ({
      level: s.memory_level,
      levelLabel: LEVEL_LABEL[s.memory_level] ?? s.memory_level,
      name: s.name,
      trigger: s.trigger,
      usage: s.sources.length,
      referents: s.referents,
      team: s.team || "org",
    }));
}

export function teamMatchesScope(scopeKey: string, teamSlug: string): boolean {
  if (scopeKey === "org" || !scopeKey) return true;
  return teamSlug === scopeKey;
}

export function orgTeamId(teamName: string): string {
  return slug(teamName);
}
