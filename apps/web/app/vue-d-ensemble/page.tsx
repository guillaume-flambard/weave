"use client";

import { CSSProperties, ReactNode, useEffect, useState } from "react";
import {
  Brain, Sparkles, Bot, MessageSquare, TrendingUp, Activity, Plug, Plus, CircleHelp,
  ArrowUpRight, Search, Building2, Circle, CircleDot, ArrowRight, TriangleAlert,
} from "lucide-react";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";
import { Panel, Card, Select, ScopeSelector } from "../../components/ui/workspace-ui";
import { WeaveShell } from "../../components/layout/weave-shell";
import { useWeaveProject } from "../../hooks/use-weave-project";
import { useViewport } from "../../hooks/use-viewport";
import {
  buildEmergenceTimeline,
  deriveKpis,
  featuredSkills,
  scopeKeyToFilter,
} from "../../lib/live-metrics";
import { orgToScopeTeams, slug } from "../../lib/scope";
import type { Agent } from "../../lib/types";

// Vue d'ensemble — ported from Claude Design (Vue d'ensemble.dc.html).
// Executive dashboard: KPIs + sparklines, memory-growth chart with emergence
// markers, recent-emergences timeline, featured skills / agents / sources.

type View = "ready" | "empty" | "loading" | "error";
type Level = "personal" | "team" | "project" | "organization";

const KPI_BY_SCOPE: Record<string, { memory: number; memoryDelta: number; skills: number; skillsOrg: number; agents: number; agentsPending: number; resolved: number; resolvedDelta: string }> = {
  org: { memory: 66, memoryDelta: 12, skills: 10, skillsOrg: 1, agents: 3, agentsPending: 1, resolved: 128, resolvedDelta: "+18%" },
  data: { memory: 24, memoryDelta: 5, skills: 4, skillsOrg: 1, agents: 1, agentsPending: 1, resolved: 47, resolvedDelta: "+22%" },
  produit: { memory: 15, memoryDelta: 3, skills: 3, skillsOrg: 0, agents: 1, agentsPending: 0, resolved: 29, resolvedDelta: "+9%" },
  growth: { memory: 19, memoryDelta: 3, skills: 3, skillsOrg: 1, agents: 1, agentsPending: 0, resolved: 38, resolvedDelta: "+15%" },
  support: { memory: 8, memoryDelta: 1, skills: 1, skillsOrg: 0, agents: 0, agentsPending: 0, resolved: 14, resolvedDelta: "+6%" },
};
const SCOPE_LABELS: Record<string, string> = { org: "Toute l'organisation", data: "Équipe Data", produit: "Équipe Produit", growth: "Équipe Growth", support: "Équipe Support" };
const SCOPE_TEAMS = [
  { id: "data", name: "Data" }, { id: "produit", name: "Produit" }, { id: "growth", name: "Growth" }, { id: "support", name: "Support" },
];

const TIMELINE = [
  { kind: "agent", level: "organization" as Level, levelLabel: "Organization", name: "specialiste-data-finance-ops", text: "Agent spécialiste émergé · en attente d'approbation", actor: "Équipe Data", time: "il y a 12 min", team: "data" },
  { kind: "org", level: "organization" as Level, levelLabel: "Organization", name: "org/branches-nommage-kebab-case", text: "Compétence promue au niveau organisation · partagée entre 2 équipes", actor: "sophie", time: "il y a 3 h", team: "org" },
  { kind: "skill", level: "project" as Level, levelLabel: "Project", name: "bancaire/relancer-synchro", text: "Compétence née du travail de l'équipe · Synchro bancaire", actor: "nicolas", time: "il y a 5 h", team: "data" },
  { kind: "skill", level: "project" as Level, levelLabel: "Project", name: "onboarding/funnel-optimiser", text: "Compétence née du travail de l'équipe · Onboarding", actor: "léa", time: "hier", team: "growth" },
  { kind: "agent", level: "team" as Level, levelLabel: "Team", name: "specialiste-growth-growth", text: "Agent spécialiste actif · équipe Growth", actor: "Équipe Growth", time: "hier", team: "growth" },
  { kind: "skill", level: "project" as Level, levelLabel: "Project", name: "checkout/deployer-staging", text: "Compétence née du travail de l'équipe · Checkout", actor: "arthur", time: "il y a 2 j", team: "produit" },
];
const FEATURED = [
  { level: "project" as Level, levelLabel: "Project", name: "bancaire/relancer-synchro", trigger: "relancer une synchronisation bancaire échouée (Bridge)", usage: 42, referents: ["nicolas", "arthur"], team: "data" },
  { level: "project" as Level, levelLabel: "Project", name: "onboarding/funnel-optimiser", trigger: "optimiser le funnel d'onboarding", usage: 31, referents: ["marc", "léa"], team: "growth" },
  { level: "organization" as Level, levelLabel: "Organization", name: "org/branches-nommage-kebab-case", trigger: "respecter la convention de nommage des branches", usage: 27, referents: ["sophie", "alex"], team: "org" },
];
const AGENTS = [
  { name: "assistant", scopeLabel: "prédéfini · généraliste", status: "active", skills: [] as string[], team: "org" },
  { name: "specialiste-data-finance-ops", scopeLabel: "équipe Data · 2 compétences", status: "pending", skills: ["bancaire-relancer-synchro", "export-fec-generer"], team: "data" },
  { name: "specialiste-growth-growth", scopeLabel: "équipe Growth · 2 compétences", status: "active", skills: ["funnel-onboarding-optimiser", "acquisition-campagne-lancer"], team: "growth" },
];
const SOURCES = [
  { name: "Slack", meta: "8 canaux · sync il y a 4 min", status: "connecté", dotColor: "var(--lvl-team)", statusColor: "var(--lvl-team)" },
  { name: "Notion", meta: "24 pages · sync il y a 12 min", status: "connecté", dotColor: "var(--lvl-team)", statusColor: "var(--lvl-team)" },
  { name: "GitHub", meta: "3 dépôts · MCP", status: "synchro en cours", dotColor: "var(--lvl-org)", statusColor: "var(--lvl-org)" },
];

// deterministic RNG
function rng(seed: number) { let s = (seed | 0) || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

function sparkPath(seed: number, up: boolean) {
  const r = rng(seed); const n = 14; let v = up ? 0.24 : 0.42; const arr: number[] = [];
  for (let i = 0; i < n; i++) { v += (up ? 0.045 : 0) + (r() - 0.5) * 0.09; v = Math.max(0.08, Math.min(0.95, v)); arr.push(v); }
  if (up) arr[n - 1] = Math.max(arr[n - 1], 0.82);
  return arr.map((val, i) => `${i === 0 ? "M" : "L"}${(i / (n - 1) * 100).toFixed(1)} ${(28 - val * 26 - 1).toFixed(1)}`).join(" ");
}

function buildChart(factEnd: number, skillEnd: number, days: number, seed: number) {
  const base = { memory: Math.max(factEnd, 1), skills: Math.max(skillEnd, 1) };
  const n = days <= 7 ? 7 : days <= 30 ? 30 : 34;
  const rF = rng(seed + days + 1);
  const fEnd = Math.max(base.memory, 1), sEnd = Math.max(base.skills, 1);
  const F: number[] = [], S: number[] = [];
  let f = fEnd * 0.15, s = 0;
  for (let i = 0; i < n; i++) {
    const prog = i / (n - 1);
    f = fEnd * (0.15 + 0.85 * prog) + (rF() - 0.5) * fEnd * 0.06;
    s = sEnd * prog + (rF() - 0.5) * sEnd * 0.08;
    F.push(Math.max(0, f)); S.push(Math.max(0, Math.min(sEnd, s)));
  }
  F[n - 1] = fEnd; S[n - 1] = sEnd;
  const X = (i: number) => (i / (n - 1)) * 100;
  const Y = (val: number) => 92 - (val / fEnd) * 80;
  const factsPath = F.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(2)} ${Y(v).toFixed(2)}`).join(" ");
  const areaPath = `${factsPath} L100 100 L0 100 Z`;
  const skillsPath = S.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(2)} ${Y(v).toFixed(2)}`).join(" ");
  // emergence markers at a few points along the facts line
  const idxs = [Math.round(n * 0.42), Math.round(n * 0.72), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  const names = ["onboarding/funnel-optimiser", "bancaire/relancer-synchro", "org/branches-nommage-kebab-case"];
  const markers = idxs.map((idx, i) => ({ leftPct: X(idx), topPct: Y(F[idx]), name: names[i] ?? "compétence" }));
  const xLabels = [0, 33, 66, 100].map((p) => ({ leftPct: p, label: p === 100 ? "auj." : `-${Math.round(days * (1 - p / 100))}j` }));
  return { factsPath, areaPath, skillsPath, markers, xLabels };
}

export default function VueDEnsemblePage() {
  const { width: w } = useViewport();
  const weave = useWeaveProject();
  const [viewProp, setViewProp] = useState<View>("ready");
  const [viewOverride, setViewOverride] = useState<View | null>(null);
  const [scope, setScope] = useState("org");
  const scopeTeams = orgToScopeTeams(weave.org);
  const scopeFilter = scopeKeyToFilter(scope);
  const [days, setDays] = useState(30);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("state") as View | null;
    if (s && ["ready", "empty", "loading", "error"].includes(s)) setViewProp(s);
  }, []);
  const view = viewOverride ?? (weave.loading && viewProp === "ready" ? "loading" : weave.isEmpty && viewProp === "ready" ? "empty" : weave.error && viewProp === "ready" ? "error" : viewProp);

  const kpiCols = w >= 1080 ? 4 : w >= 560 ? 2 : 1;
  const mainSplit = w >= 1024;
  const bottomCols = w >= 920 ? 3 : w >= 560 ? 2 : 1;
  const isMobile = w < 560;

  const k = deriveKpis(weave.stats, weave.skills, weave.agents, weave.facts, scopeFilter);
  const ready = view === "ready";
  const memory = k.memory, skillsN = k.skills, agentsN = k.agents, resolved = k.resolved;
  const chart = buildChart(k.memory, k.skills, days, scope.length * 13);
  if (weave.skills.length > 0) {
    chart.markers = chart.markers.map((m, i) => ({ ...m, name: weave.skills[Math.min(i, weave.skills.length - 1)]?.name ?? m.name }));
  }

  const timeline = buildEmergenceTimeline(weave.skills, weave.agents, scopeFilter);
  const featured = featuredSkills(weave.skills, scopeFilter);
  const agentsList = weave.agents
    .filter((a) => scope === "org" || a.team === scope || a.team === "")
    .map((a: Agent) => ({
      name: a.name,
      scopeLabel: a.derived_from,
      status: a.status,
      skills: a.skills,
      team: a.team || "org",
    }));

  const scopeLabel = scope === "org" ? "Toute l'organisation" : scopeTeams.find((t) => t.id === scope)?.name ?? scope;

  const kpiRow: CSSProperties = { display: "grid", gridTemplateColumns: `repeat(${kpiCols}, minmax(0,1fr))`, gap: 16 };
  const mainRow: CSSProperties = mainSplit ? { display: "grid", gridTemplateColumns: "minmax(0,1.85fr) minmax(0,1fr)", gap: 16, alignItems: "start" } : { display: "flex", flexDirection: "column", gap: 16 };
  const bottomRow: CSSProperties = { display: "grid", gridTemplateColumns: `repeat(${bottomCols}, minmax(0,1fr))`, gap: 16, alignItems: "start" };
  const chartH = w < 560 ? 180 : 230;

  const orgSwitcher = w >= 640 && (
    <select
      value={weave.orgId}
      onChange={(e) => weave.switchOrg(e.target.value)}
      aria-label="Organisation"
      style={{ height: 32, border: "1px solid var(--line)", borderRadius: 6, background: "var(--surface)", padding: "0 10px", fontSize: 12.5, fontFamily: "var(--font-sans)", color: "var(--ink)" }}
    >
      {weave.presets.map((p) => (
        <option key={p.org} value={p.org}>{p.name}</option>
      ))}
    </select>
  );

  return (
    <WeaveShell width={w} connected={weave.connected} llm={weave.llm} actions={orgSwitcher}>
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 24px 56px" }}>
        {/* PAGE HEADER */}
        <div style={{ padding: "22px 0 14px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Vue d&apos;ensemble</h1>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{scopeLabel}</span>
          </div>
          {ready && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {isMobile ? (
                  <Select value={scope} onChange={(e) => setScope(e.target.value)} options={[{ value: "org", label: "Organisation" }, ...scopeTeams.map((t) => ({ value: t.id, label: t.name }))]} />
                ) : (
                  <ScopeSelector teams={scopeTeams} scope={{ team: scope === "org" ? undefined : scope }} onChange={(s) => setScope(s.team || "org")} trailing={scopeLabel} />
                )}
              </div>
              <div style={{ display: "flex", gap: 4, border: "1px solid var(--line)", borderRadius: 6, padding: 3, background: "var(--surface)", flexShrink: 0 }}>
                {[7, 30, 90].map((d) => {
                  const on = days === d;
                  return <button key={d} type="button" onClick={() => setDays(d)} style={{ border: "none", cursor: "pointer", borderRadius: 4, padding: "5px 11px", fontSize: 12.5, fontWeight: 500, fontFamily: "var(--font-sans)", background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--accent-deep)" : "var(--ink-soft)" }}>{d} jours</button>;
                })}
              </div>
            </div>
          )}
        </div>

        {view === "error" && (
          <div style={{ display: "flex", justifyContent: "center", padding: "52px 0" }}>
            <div style={{ maxWidth: 430, width: "100%", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: 28, textAlign: "center", boxSizing: "border-box" }}>
              <TriangleAlert size={30} color="var(--ink)" style={{ margin: "0 auto", display: "block" }} />
              <div style={{ marginTop: 14, fontSize: 15, fontWeight: 600 }}>Impossible de charger les données</div>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>Une erreur est survenue lors du chargement de la vue d&apos;ensemble de PennyLane. Vos données sont intactes.</div>
              <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}><Button variant="primary" onClick={() => { setViewOverride("ready"); window.location.href = "/"; }}>Réessayer</Button></div>
            </div>
          </div>
        )}

        {view === "empty" && (
          <div style={{ display: "flex", justifyContent: "center", padding: "56px 0" }}>
            <div style={{ maxWidth: 470, textAlign: "center" }}>
              <svg viewBox="0 0 100 100" width="48" height="48" fill="none" style={{ display: "block", margin: "0 auto" }}><path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /><circle cx="78" cy="30" r="6" fill="var(--accent)" /></svg>
              <div style={{ marginTop: 16, fontSize: 16, fontWeight: 600 }}>Aucune activité pour l&apos;instant</div>
              <div style={{ marginTop: 8, fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55 }}>Connectez une source ou simulez l&apos;activité : chaque question, réponse et décision de vos équipes se transforme en mémoire réutilisable.</div>
              <div style={{ marginTop: 22, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <a href="/" style={{ textDecoration: "none" }}><Button variant="primary">Simuler l&apos;activité</Button></a>
                <a href="/connecter-les-sources" style={{ textDecoration: "none" }}><Button variant="secondary">Connecter une source</Button></a>
              </div>
            </div>
          </div>
        )}

        {view === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={kpiRow}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, background: "var(--surface)" }}><div className="wv-shimmer" style={{ height: 12, width: "52%" }} /><div className="wv-shimmer" style={{ height: 28, width: "38%", marginTop: 16, borderRadius: 6 }} /><div className="wv-shimmer" style={{ height: 12, width: "74%", marginTop: 16 }} /></div>)}</div>
            <div style={mainRow}><div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, background: "var(--surface)" }}><div className="wv-shimmer" style={{ height: 14, width: "38%" }} /><div className="wv-shimmer" style={{ height: 260, marginTop: 16, borderRadius: 8 }} /></div><div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, background: "var(--surface)", display: "flex", flexDirection: "column", gap: 12 }}><div className="wv-shimmer" style={{ height: 14, width: "52%" }} />{[0, 1, 2].map((i) => <div key={i} className="wv-shimmer" style={{ height: 64, borderRadius: 8 }} />)}</div></div>
          </div>
        )}

        {ready && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* KPI ROW */}
            <div style={kpiRow}>
              <KpiCard icon={<Brain size={15} color="var(--muted)" />} label="Mémoire" value={memory} deltaText={`+${k.memoryDelta} cette semaine`} positive sparkSeed={scope.length * 3 + 11} />
              <KpiCard icon={<Sparkles size={15} color="var(--muted)" />} label="Compétences vivantes" value={skillsN} deltaText={k.skillsOrg ? `dont ${k.skillsOrg} promue${k.skillsOrg > 1 ? "s" : ""} org` : "nées des projets"} sparkSeed={scope.length * 5 + 3} />
              <KpiCard icon={<Bot size={15} color="var(--muted)" />} label="Agents actifs" value={agentsN} deltaText={k.agentsPending ? `${k.agentsPending} en attente` : "tous approuvés"} sparkSeed={scope.length * 7 + 2} />
              <KpiCard icon={<MessageSquare size={15} color="var(--muted)" />} label="Questions résolues" value={resolved} deltaText={k.resolvedDelta} positive sparkSeed={scope.length * 9 + 5} />
            </div>

            {/* MAIN SPLIT */}
            <div style={mainRow}>
              <Panel title="Croissance de la mémoire" icon={<TrendingUp size={15} strokeWidth={2} />} subtitle={`${scopeLabel} · ${days} derniers jours`}>
                <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 14, fontSize: 12, color: "var(--ink-soft)", flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, height: 3, borderRadius: 2, background: "var(--accent)" }} />Faits</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, borderTop: "2px dashed var(--muted)" }} />Compétences</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--surface)", border: "2px solid var(--accent)" }} />Compétence née</span>
                </div>
                <div style={{ position: "relative", width: "100%", height: chartH }}>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
                    {[25, 50, 75].map((y) => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#f1f0ee" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
                    <path d={chart.areaPath} fill="#e7f1fb" stroke="none" opacity="0.7" />
                    <path d={chart.skillsPath} fill="none" stroke="#9b9a97" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                    <path d={chart.factsPath} fill="none" stroke="#2383e2" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {chart.markers.map((m, i) => (
                    <div key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ position: "absolute", left: `${m.leftPct}%`, top: `${m.topPct}%`, width: 22, height: 22, transform: "translate(-50%,-50%)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <span style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--surface)", border: "2px solid var(--accent)" }} />
                    </div>
                  ))}
                  {hovered !== null && (
                    <div style={{ position: "absolute", left: `${chart.markers[hovered].leftPct}%`, top: `${chart.markers[hovered].topPct}%`, transform: "translate(-50%,calc(-100% - 14px))", background: "var(--ink)", color: "#fff", fontSize: 11, fontFamily: "var(--font-mono)", padding: "5px 9px", borderRadius: 6, whiteSpace: "nowrap", boxShadow: "0 4px 14px rgba(15,15,15,0.16)", pointerEvents: "none", zIndex: 5 }}>{chart.markers[hovered].name}</div>
                  )}
                </div>
                <div style={{ position: "relative", height: 16, marginTop: 8 }}>
                  {chart.xLabels.map((x, i) => <span key={i} style={{ position: "absolute", left: `${x.leftPct}%`, transform: "translateX(-50%)", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{x.label}</span>)}
                </div>
              </Panel>

              <Panel title="Émergences récentes" icon={<Activity size={15} strokeWidth={2} />} count={timeline.length} bodyStyle={{ maxHeight: 300, overflowY: "auto" }}>
                <div className="wv-scroll" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {timeline.map((item, i) => {
                    const Icon = item.kind === "skill" ? Sparkles : item.kind === "org" ? Building2 : Bot;
                    const color = item.kind === "skill" ? "var(--accent)" : "var(--lvl-org)";
                    return (
                      <Card key={`${item.name}-${i}`} tone={item.kind === "skill" ? "accent" : "organization"} emerge={i === 0} radius="lg" padding="12px">
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            <Icon size={14} color={color} style={{ flexShrink: 0 }} />
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                          </span>
                          <span style={{ flexShrink: 0 }}><Badge tone={item.level as "organization"}>{item.levelLabel}</Badge></span>
                        </div>
                        <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.45 }}>{item.text}</div>
                        <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--muted)" }}>
                          <Avatar name={item.actor} size="sm" /><span>{item.actor}</span>
                          <span style={{ marginLeft: "auto" }}>
                            <a href={item.kind === "agent" ? `/agent?name=${encodeURIComponent(item.name)}` : `/competence?name=${encodeURIComponent(item.name)}`} style={{ color: "var(--accent)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 3, textDecoration: "none" }}>Voir<ArrowRight size={12} /></a>
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </Panel>
            </div>

            {/* BOTTOM ROW */}
            <div style={bottomRow}>
              <Panel title="Compétences en vedette" icon={<Sparkles size={15} strokeWidth={2} />} count={featured.length}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {featured.map((s) => {
                    const isOrg = s.level === "organization";
                    return (
                      <Card key={s.name} tone="neutral" radius="lg" padding="12px">
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            {isOrg ? <Building2 size={14} color="var(--lvl-org)" style={{ flexShrink: 0 }} /> : <Sparkles size={14} color="var(--accent)" style={{ flexShrink: 0 }} />}
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                          </span>
                          <span style={{ flexShrink: 0 }}><Badge tone={s.level as "organization"}>{s.levelLabel}</Badge></span>
                        </div>
                        <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.45 }}>{s.trigger}</div>
                        <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
                          <span>référents</span>{s.referents.map((r) => <Avatar key={r} name={r} size="sm" />)}
                          <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{s.usage}× utilisée</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Agents" icon={<Bot size={15} strokeWidth={2} />} count={agentsList.length} subtitle="Un spécialiste par équipe, né de ses compétences.">
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {agentsList.map((a) => {
                    const pending = a.status === "pending";
                    return (
                      <Card key={a.name} tone={pending ? "organization" : "neutral"} radius="lg" padding="12px">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            {pending ? <CircleDot size={13} color="var(--lvl-org)" style={{ flexShrink: 0 }} /> : <Circle size={13} color="var(--accent)" style={{ flexShrink: 0 }} />}
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                          </span>
                          {pending ? <Button variant="dark" size="sm" onClick={() => weave.approveAgent(a.name)}>Approuver</Button> : <Badge tone="active">actif</Badge>}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted)" }}>{a.scopeLabel}</div>
                        {a.skills.length > 0 && (
                          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {a.skills.map((sk) => <span key={sk} style={{ borderRadius: 4, background: "var(--subtle)", padding: "2px 7px", fontSize: 10, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>✦ {sk}</span>)}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Sources connectées" icon={<Plug size={15} strokeWidth={2} />} count={SOURCES.length} subtitle={weave.stats ? `${weave.stats.events} événements ingérés` : undefined}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {SOURCES.map((src) => (
                    <div key={src.name} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderBottom: "1px solid var(--line-soft)" }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: src.dotColor, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{src.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{src.meta}</div>
                      </div>
                      <span style={{ fontSize: 11, color: src.statusColor, whiteSpace: "nowrap" }}>{src.status}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 14 }}>
                    <a href="/connecter-les-sources" style={{ textDecoration: "none", display: "block" }}><Button variant="primary" icon={<Plus size={15} />} style={{ width: "100%" }}>Connecter une source</Button></a>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        )}

        <footer style={{ marginTop: 28, borderTop: "1px solid var(--line)", paddingTop: 16, textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
          Mémoire scopée · personnel → équipe → projet → organisation · chaque réponse est traçable jusqu&apos;à ses sources
        </footer>
      </div>
    </WeaveShell>
  );
}

function KpiCard({ icon, label, value, deltaText, positive = false, sparkSeed }:
  { icon: ReactNode; label: string; value: number; deltaText: string; positive?: boolean; sparkSeed: number }) {
  return (
    <Card tone="neutral" radius="lg" padding="16px">
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>{icon}<span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 500 }}>{label}</span></div>
      <div style={{ marginTop: 12, fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, color: positive ? "var(--accent-deep)" : "var(--muted)" }}>{positive && <ArrowUpRight size={12} strokeWidth={2.4} />}{deltaText}</span>
        <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ width: 72, height: 24, flexShrink: 0, overflow: "visible" }}>
          <path d={sparkPath(sparkSeed, positive)} fill="none" stroke={positive ? "#2383e2" : "#9b9a97"} strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Card>
  );
}
