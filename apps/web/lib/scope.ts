import type { OrgCfg, Project, TeamCfg } from "./types";

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type Scope = { team?: string; workstream?: string };

export function getScopeLabel(org: OrgCfg | null, scope: Scope): string {
  if (scope.workstream) {
    return (
      org?.teams
        .flatMap((t: TeamCfg) => t.projects)
        .find((p: Project) => slug(p.name) === scope.workstream)?.name ?? scope.workstream
    );
  }
  if (scope.team) {
    return org?.teams.find((t: TeamCfg) => slug(t.name) === scope.team)?.name ?? scope.team;
  }
  return "Toute l'organisation";
}

export type ScopeTeam = { id: string; name: string; projects?: { id: string; name: string }[] };

export function orgToScopeTeams(org: OrgCfg | null): ScopeTeam[] {
  return (
    org?.teams.map((t) => ({
      id: slug(t.name),
      name: t.name,
      projects: t.projects.map((p) => ({ id: slug(p.name), name: p.name })),
    })) ?? []
  );
}

export function inScope(scope: Scope, team: string, workstream: string): boolean {
  return (!scope.team || team === scope.team) && (!scope.workstream || workstream === scope.workstream);
}
