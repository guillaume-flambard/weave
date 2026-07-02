import type { OrgCfg, Project, TeamCfg } from "../lib/types";
import type { Scope } from "../hooks/use-weave-dashboard";

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getScopeLabel(org: OrgCfg | null, scope: Scope) {
  return scope.workstream
    ? org?.teams.flatMap((t: TeamCfg) => t.projects).find((p: Project) => slug(p.name) === scope.workstream)?.name
    : scope.team
    ? org?.teams.find((t: TeamCfg) => slug(t.name) === scope.team)?.name
    : "Toute l'organisation";
}

export function ScopeBar({ org, scope, setScope, scopeLabel }: { org: OrgCfg | null; scope: Scope; setScope: (scope: Scope) => void; scopeLabel: string; }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted">Vue :</span>
      <button onClick={() => setScope({})}
        className={`rounded-full px-2.5 py-1 text-xs ${!scope.team ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:bg-subtle"}`}>
        Organisation
      </button>
      {org?.teams.map((t: TeamCfg) => {
        const ts = slug(t.name);
        const active = scope.team === ts && !scope.workstream;
        return (
          <div key={t.name} className="flex items-center gap-1">
            <button onClick={() => setScope({ team: ts })}
              className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-accent text-white" : "border border-line bg-surface text-ink-soft hover:bg-subtle"}`}>
              {t.name}
            </button>
            {scope.team === ts && t.projects.map((p: Project) => {
              const ws = slug(p.name);
              return (
                <button key={p.name} onClick={() => setScope({ team: ts, workstream: ws })}
                  className={`rounded-full px-2 py-1 text-[11px] ${scope.workstream === ws ? "bg-accent-deep text-white" : "border border-line bg-surface text-muted hover:bg-subtle"}`}>
                  {p.name}
                </button>
              );
            })}
          </div>
        );
      })}
      <span className="ml-auto text-xs text-muted">{scopeLabel}</span>
    </div>
  );
}
