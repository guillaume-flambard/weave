"use client";

import { CSSProperties, ReactNode, useState } from "react";
import { Badge } from "./primitives";

// Heavier Weave Design System primitives used by the workspace / ask screens.

const LEVEL_LABEL: Record<string, string> = { personal: "Personal", team: "Team", project: "Project", organization: "Organization" };

export function Panel({ title, icon, count, subtitle, actions, bodyStyle, children }:
  { title: string; icon?: ReactNode; count?: number; subtitle?: string; actions?: ReactNode; bodyStyle?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ display: "inline-flex", color: "var(--ink-soft)" }}>{icon}</span>}
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 0 }}>{title}</h2>
          {count !== undefined && (
            <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--subtle)", borderRadius: 999, padding: "1px 8px", fontVariantNumeric: "tabular-nums" }}>{count}</span>
          )}
          {actions}
        </div>
        {subtitle && <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>{subtitle}</p>}
      </div>
      <div style={{ padding: 14, ...bodyStyle }}>{children}</div>
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
    <div className={emerge ? "weave-emerge" : undefined}
      style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: radius === "lg" ? 10 : 8, padding }}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, padding: "6px 2px" }}>{children}</p>;
}

export function Input({ value, onChange, onKeyDown, placeholder, fullWidth = true }:
  { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; placeholder?: string; fullWidth?: boolean }) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        width: fullWidth ? "100%" : undefined, height: 36, boxSizing: "border-box",
        border: `1px solid ${focus ? "var(--accent)" : "var(--line)"}`, background: focus ? "var(--surface)" : "var(--subtle)",
        borderRadius: 6, padding: "0 12px", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--ink)", outline: "none",
        boxShadow: focus ? "0 0 0 3px var(--accent-soft)" : "none", transition: "border-color 120ms ease, box-shadow 120ms ease, background 120ms ease",
      }}
    />
  );
}

export function Select({ value, options, onChange, fullWidth = true }:
  { value: string; options: { value: string; label: string }[]; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; fullWidth?: boolean }) {
  return (
    <select value={value} onChange={onChange}
      style={{ width: fullWidth ? "100%" : undefined, height: 36, boxSizing: "border-box", border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 6, padding: "0 10px", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--ink)", outline: "none", cursor: "pointer" }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function ProgressBar({ occurrences, threshold, showCount = true }:
  { occurrences: number; threshold: number; showCount?: boolean }) {
  const pct = Math.min(100, Math.round((occurrences / threshold) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "color-mix(in srgb, var(--lvl-org) 18%, transparent)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--lvl-org)", borderRadius: 999, transition: "width 300ms ease" }} />
      </div>
      {showCount && <span style={{ fontSize: 10.5, color: "var(--lvl-org)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{occurrences}/{threshold}</span>}
    </div>
  );
}

export function FlashBanner({ kind = "skill", emerge = false, children }:
  { kind?: "skill" | "agent" | "org"; emerge?: boolean; children: ReactNode }) {
  const isSkill = kind === "skill";
  return (
    <div className={emerge ? "weave-emerge" : undefined} role="status" aria-live="polite"
      style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", borderRadius: 8,
        background: isSkill ? "var(--accent-soft)" : "var(--lvl-org-bg)",
        border: `1px solid ${isSkill ? "color-mix(in srgb, var(--accent) 35%, var(--line))" : "color-mix(in srgb, var(--lvl-org) 35%, var(--line))"}`,
        color: isSkill ? "var(--accent-deep)" : "var(--lvl-org)", fontSize: 13, fontWeight: 500,
        boxShadow: "0 4px 14px rgba(15,15,15,0.08)" }}>
      {children}
    </div>
  );
}

export function AnswerBlock({ answer, skillUsed, layers }:
  { answer: string; skillUsed?: string; layers: { level: string; facts: { author: string; content: string }[] }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      <div>
        {skillUsed && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--accent-deep)", background: "var(--accent-soft)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)", borderRadius: 999, padding: "2px 9px" }}>
              compétence utilisée · <span style={{ fontFamily: "var(--font-mono)" }}>{skillUsed}</span>
            </span>
          </div>
        )}
        <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.6 }}>{answer}</div>
      </div>
      <div>
        <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Provenance · couches mémoire</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {layers.map((l) => (
            <Card key={l.level} tone={l.level as CardTone} radius="md" padding="8px 10px">
              <div style={{ marginBottom: 4 }}><Badge tone={l.level as "personal"}>{LEVEL_LABEL[l.level] ?? l.level}</Badge></div>
              {l.facts.map((f, i) => (
                <div key={i} style={{ fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.45 }}>
                  <span style={{ color: "var(--muted)" }}>{f.author} :</span> {f.content}
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
  { label?: string; orgLabel?: string; teams: ScopeTeam[]; scope: { team?: string }; onChange: (s: { team?: string }) => void; trailing?: string }) {
  const chip = (active: boolean): CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
    border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 30%, var(--line))" : "var(--line)"}`,
    background: active ? "var(--accent-soft)" : "var(--surface)", color: active ? "var(--accent-deep)" : "var(--ink-soft)",
    borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontFamily: "var(--font-sans)", cursor: "pointer", whiteSpace: "nowrap",
  });
  const activeTeam = teams.find((t) => t.id === scope.team);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 2 }}>{label} :</span>
      <button type="button" style={chip(!scope.team)} onClick={() => onChange({})}>{orgLabel}</button>
      {teams.map((t) => (
        <button key={t.id} type="button" style={chip(scope.team === t.id)} onClick={() => onChange({ team: t.id })}>{t.name}</button>
      ))}
      {activeTeam?.projects?.map((p) => (
        <span key={p.id} style={{ ...chip(false), fontSize: 11.5, color: "var(--muted)", padding: "4px 10px" }}>{p.name}</span>
      ))}
      {trailing && <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>{trailing}</span>}
    </div>
  );
}
