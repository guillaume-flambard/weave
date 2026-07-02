import { Empty, Icons, LevelTag, PanelTitle, Tag } from "./dashboard-ui";
import type { Fact } from "../lib/types";

export function MemoryPanel({ facts, scopeLabel, scoped }: { facts: Fact[]; scopeLabel: string; scoped: boolean; }) {
  return (
    <section data-testid="memory-panel" className="col-span-4 rounded-lg border border-line bg-surface p-4">
      <PanelTitle icon={<Icons.Brain size={15} strokeWidth={2} />} count={facts.length}>Mémoire {scoped ? `· ${scopeLabel}` : "partagée"}</PanelTitle>
      <div className="mt-3 max-h-[540px] space-y-1.5 overflow-y-auto pr-1">
        {facts.length === 0 && <Empty>—</Empty>}
        {facts.slice(0, 30).map((f) => (
          <div key={f.id} className="rounded-md border border-line-soft bg-subtle px-2.5 py-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag>{f.ftype}</Tag>
              <LevelTag level={f.memory_level} />
              {f.workstream && <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-ink-soft">{f.workstream}</span>}
              <span className="text-muted">{f.author}</span>
            </div>
            <div className="mt-1 text-ink-soft">{f.content}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
