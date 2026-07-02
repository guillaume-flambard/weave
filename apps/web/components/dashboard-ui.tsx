import { Activity, Bot, Building2, Brain, Circle, CircleDot, MessageSquare, Sparkles } from "lucide-react";
import type { Feed, Skill } from "../lib/types";

const LEVEL_STYLE: Record<string, string> = {
  personal: "text-lvl-personal border-lvl-personal/30 bg-lvl-personal-bg",
  team: "text-lvl-team border-lvl-team/30 bg-lvl-team-bg",
  project: "text-lvl-project border-lvl-project/30 bg-lvl-project-bg",
  organization: "text-lvl-org border-lvl-org/40 bg-lvl-org-bg",
};

export { LEVEL_STYLE };

export function PanelTitle({ children, count, icon }: { children: React.ReactNode; count?: number; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">{icon && <span className="text-ink-soft">{icon}</span>}{children}</h2>
      {count !== undefined && <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">{count}</span>}
    </div>
  );
}

export function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</h3>;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-white px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft">{children}</span>;
}

export function LevelTag({ level }: { level: string }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] capitalize ${LEVEL_STYLE[level] || "border-line text-muted"}`}>{level}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}

export function FeedRow({ ev }: { ev: Feed }) {
  if (ev.type === "event_ingested") {
    return <div className="rounded-md border border-line-soft bg-subtle px-2.5 py-1.5 text-xs"><span className="text-muted">{ev.actor}</span><span className="ml-1.5 text-ink">{ev.text}</span></div>;
  }
  if (ev.type === "fact_extracted") {
    return <div className="px-2.5 py-0.5 text-[11px] text-muted"><Tag>{ev.ftype}</Tag> <span className="ml-1">fait · {ev.topic}</span></div>;
  }
  if (ev.type === "pattern_observed") {
    const pct = Math.min(100, Math.round(((ev.occurrences || 0) / (ev.threshold || 5)) * 100));
    return <div className="rounded-md border border-lvl-org/30 bg-lvl-org-bg px-2.5 py-1 text-[11px] text-lvl-org">schéma « {ev.signature} » — {ev.occurrences}/{ev.threshold}<div className="mt-1 h-1 w-full rounded bg-white"><div className="h-1 rounded bg-lvl-org" style={{ width: `${pct}%` }} /></div></div>;
  }
  if (ev.type === "skill_emerged") {
    const isOrg = (ev.name || "").startsWith("org/");
    return <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs animate-emerge ${isOrg ? "border-lvl-org/40 bg-lvl-org-bg text-lvl-org" : "border-accent/40 bg-accent-soft text-accent-deep"}`}>{isOrg ? <Building2 size={13} /> : <Sparkles size={13} />} <b>{isOrg ? "compétence org promue" : "compétence née"}</b> : {ev.name}</div>;
  }
  if (ev.type === "agent_emerged") {
    return <div className="flex items-center gap-1.5 rounded-md border border-lvl-org/50 bg-lvl-org-bg px-2.5 py-1.5 text-xs text-lvl-org animate-emerge"><Bot size={13} /> <b>agent émergé</b> : {ev.name}</div>;
  }
  return null;
}

export function SkillCard({ s, newest, org }: { s: Skill; newest: string | null; org?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${
      s.name === newest ? "border-accent bg-accent-soft animate-emerge"
      : org ? "border-lvl-org/50 bg-lvl-org-bg" : "border-line bg-subtle"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[13px] font-medium text-ink">
          {org ? <Building2 size={13} className="text-lvl-org" /> : <Sparkles size={13} className="text-accent" />} {s.name}
        </span>
        <LevelTag level={s.memory_level} />
      </div>
      <div className="mt-0.5 text-xs text-ink-soft">{s.trigger}</div>
      <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-surface p-2 text-[11px] leading-relaxed text-ink-soft">{s.body}</pre>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <span>référents :</span>
        {s.referents.map((r: string) => <span key={r} className="rounded bg-white px-1.5 py-0.5 text-ink-soft">{r}</span>)}
        <span className="ml-auto">{s.sources.length} sources</span>
      </div>
    </div>
  );
}

export const Icons = {
  Activity,
  Brain,
  Sparkles,
  Bot,
  MessageSquare,
  Circle,
  CircleDot,
};
