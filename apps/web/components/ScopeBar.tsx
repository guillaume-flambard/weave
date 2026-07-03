import type { OrgCfg, TeamCfg, Project } from "../lib/types";
import type { Scope } from "../lib/scope";
import { getScopeLabel, slug } from "../lib/scope";

export { getScopeLabel };

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
