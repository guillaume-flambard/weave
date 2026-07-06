"use client";

import Link from "next/link";
import { CSSProperties, ReactNode } from "react";
import { Badge } from "./primitives";

const LEVEL_LABEL: Record<string, string> = { personal: "Personal", team: "Team", project: "Project", organization: "Organization" };

export function Panel({ title, icon, count, subtitle, actions, bodyStyle, children }:
  { title: string; icon?: ReactNode; count?: number; subtitle?: string; actions?: ReactNode; bodyStyle?: CSSProperties; children: ReactNode }) {
  return (
    <div className="border border-line rounded-2xl bg-surface flex flex-col min-w-0">
      <div className="py-3.5 px-4 border-b border-line-soft">
        <div className="flex items-center gap-2">
          {icon && <span className="inline-flex text-ink-soft">{icon}</span>}
          <h2 className="m-0 text-sm font-semibold text-ink flex-1 min-w-0">{title}</h2>
          {count !== undefined && (
            <span className="text-[11px] text-muted bg-subtle rounded-full px-2 py-px tabular-nums">{count}</span>
          )}
          {actions}
        </div>
        {subtitle && <p className="m-0 mt-1.5 text-[11.5px] text-muted leading-[1.45]">{subtitle}</p>}
      </div>
      <div className="p-4" style={bodyStyle}>{children}</div>
    </div>
  );
}

type CardTone = "neutral" | "accent" | "organization" | "personal" | "team" | "project";
const CARD: Record<CardTone, { bg: string; border: string }> = {
  neutral: { bg: "var(--subtle)", border: "var(--line)" },
  accent: { bg: "var(--accent-soft)", border: "color-mix(in srgb, var(--accent) 35%, var(--line))" },
  organization: { bg: "var(--lvl-org-bg)", border: "color-mix(in srgb, var(--lvl-org) 35%, var(--line))" },
  personal: { bg: "var(--lvl-personal-bg)", border: "color-mix(in srgb, var(--lvl-personal) 30%, var(--line))" },
  team: { bg: "var(--lvl-team-bg)", border: "color-mix(in srgb, var(--lvl-team) 30%, var(--line))" },
  project: { bg: "var(--lvl-project-bg)", border: "color-mix(in srgb, var(--lvl-project) 30%, var(--line))" },
};

export function Card({ tone = "neutral", emerge = false, radius = "md", padding = "10px", children }:
  { tone?: CardTone; emerge?: boolean; radius?: "md" | "lg"; padding?: string; children: ReactNode }) {
  const c = CARD[tone] ?? CARD.neutral;
  return (
    <div
      className={`${emerge ? "weave-emerge " : ""}${radius === "lg" ? "rounded-xl" : "rounded-lg"}`}
      style={{ background: c.bg, border: `1px solid ${c.border}`, padding }}
    >
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[12.5px] text-muted leading-normal py-1.5 px-[2px]">{children}</p>;
}

export function Input({ value, onChange, onKeyDown, placeholder, fullWidth = true }:
  { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; placeholder?: string; fullWidth?: boolean }) {
  return (
    <input
      value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder}
      className={`${fullWidth ? "w-full" : ""} h-9 box-border border border-line focus:border-accent bg-subtle focus:bg-surface rounded-md px-3 font-sans text-sm text-ink outline-none focus:ring-3 focus:ring-accent-soft transition-all duration-120`}
    />
  );
}

export function Select({ value, options, onChange, fullWidth = true }:
  { value: string; options: { value: string; label: string }[]; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; fullWidth?: boolean }) {
  return (
    <select value={value} onChange={onChange}
      className={`${fullWidth ? "w-full" : ""} h-9 box-border border border-line bg-surface rounded-md px-[10px] font-sans text-sm text-ink outline-none cursor-pointer`}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function ProgressBar({ occurrences, threshold, showCount = true }:
  { occurrences: number; threshold: number; showCount?: boolean }) {
  const pct = Math.min(100, Math.round((occurrences / threshold) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--lvl-org) 18%, transparent)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--lvl-org)", transition: "width 300ms ease" }} />
      </div>
      {showCount && <span className="text-[10.5px] text-lvl-org tabular-nums shrink-0">{occurrences}/{threshold}</span>}
    </div>
  );
}

export function FlashBanner({ kind = "skill", emerge = false, children }:
  { kind?: "skill" | "agent" | "org"; emerge?: boolean; children: ReactNode }) {
  const isSkill = kind === "skill";
  return (
    <div className={`${emerge ? "weave-emerge " : ""}flex items-center gap-[9px] py-[11px] px-[14px] rounded-lg text-sm font-medium shadow-[0_4px_14px_rgba(15,15,15,0.08)]`} role="status" aria-live="polite"
      style={{
        background: isSkill ? "var(--accent-soft)" : "var(--lvl-org-bg)",
        border: `1px solid ${isSkill ? "color-mix(in srgb, var(--accent) 35%, var(--line))" : "color-mix(in srgb, var(--lvl-org) 35%, var(--line))"}`,
        color: isSkill ? "var(--accent-deep)" : "var(--lvl-org)",
      }}>
      {children}
    </div>
  );
}

export function AnswerBlock({ answer, skillUsed, layers }:
  { answer: string; skillUsed?: string; layers: { level: string; facts: { author: string; content: string }[] }[] }) {
  return (
    <div className="grid gap-4 items-start grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div>
        {skillUsed && (
          <div className="mb-2">
            <Link
              href={`/competence?name=${encodeURIComponent(skillUsed)}`}
              className="inline-flex items-center gap-1.5 no-underline text-[11.5px] text-accent-deep bg-accent-soft rounded-full px-[9px] py-0.5 transition-colors hover:bg-[color-mix(in_srgb,var(--accent-soft)_70%,white)]"
              style={{ border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }}
            >
              compétence utilisée · <span className="font-mono">{skillUsed}</span>
            </Link>
          </div>
        )}
        <div className="text-[13.5px] text-ink leading-[1.6]">{answer}</div>
      </div>
      <div>
        <h4 className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Provenance · couches mémoire</h4>
        <div className="flex flex-col gap-1.5">
          {layers.map((l) => (
            <Card key={l.level} tone={l.level as CardTone} radius="md" padding="8px 10px">
              <div className="mb-1"><Badge tone={l.level as "personal"}>{LEVEL_LABEL[l.level] ?? l.level}</Badge></div>
              {l.facts.map((f, i) => (
                <div key={i} className="text-[11.5px] text-ink-soft leading-[1.45]">
                  <span className="text-muted">{f.author} :</span> {f.content}
                </div>
              ))}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

type ScopeTeam = { id: string; name: string; projects?: { id: string; name: string }[] };
export function ScopeSelector({ label = "Vue", orgLabel = "Organisation", teams, scope, onChange, trailing }:
  { label?: string; orgLabel?: string; teams: ScopeTeam[]; scope: { team?: string; workstream?: string }; onChange: (s: { team?: string; workstream?: string }) => void; trailing?: string }) {
  const chip = (active: boolean): CSSProperties => ({
    border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 30%, var(--line))" : "var(--line)"}`,
    background: active ? "var(--accent-soft)" : "var(--surface)",
    color: active ? "var(--accent-deep)" : "var(--ink-soft)",
  });
  const activeTeam = teams.find((t) => t.id === scope.team);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted mr-0.5">{label} :</span>
      <button type="button" className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-[5px] text-[12.5px] font-sans cursor-pointer whitespace-nowrap border border-line" style={chip(!scope.team && !scope.workstream)} onClick={() => onChange({})}>{orgLabel}</button>
      {teams.map((t) => (
        <button key={t.id} type="button" className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-[5px] text-[12.5px] font-sans cursor-pointer whitespace-nowrap border border-line" style={chip(scope.team === t.id && !scope.workstream)} onClick={() => onChange({ team: t.id })}>{t.name}</button>
      ))}
      {activeTeam?.projects?.map((p) => (
        <button key={p.id} type="button" className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-[10px] py-1 text-[11.5px] font-sans cursor-pointer whitespace-nowrap border border-line" style={chip(scope.workstream === p.id)} onClick={() => onChange({ team: scope.team, workstream: p.id })}>{p.name}</button>
      ))}
      {trailing && <span className="ml-auto text-xs text-muted">{trailing}</span>}
    </div>
  );
}
