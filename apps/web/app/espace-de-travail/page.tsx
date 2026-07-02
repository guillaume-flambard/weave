"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity, Brain, Sparkles, Bot, MessageSquare, Zap, CircleHelp, Search, WifiOff,
  Building2, CircleDot, Circle,
} from "lucide-react";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";
import { Panel, Card, EmptyState, Input, Select, ProgressBar, FlashBanner, AnswerBlock, ScopeSelector } from "../../components/ui/workspace-ui";

// Espace de travail — the live workspace hero, ported from Claude Design
// (Espace de travail.dc.html). Self-contained scripted demo (no backend):
// click Simuler → activity streams → a pattern crosses threshold → a skill is
// born (emergence pulse) → an agent emerges. Great for the PennyLane pitch.

type View = "ready" | "empty" | "loading" | "disconnected";
type Level = "personal" | "team" | "project" | "organization";
type Skill = { id: string; name: string; level: Level; levelLabel: string; trigger: string; body: string; referents: string[]; sources: number };
type Agent = { id: string; name: string; status: "active" | "pending"; derivedFrom: string; skills: string[] };
type Fact = { ftype: string; level: Level; levelLabel: string; author: string; workstream: string; content: string };
type Feed =
  | { type: "event"; actor: string; text: string }
  | { type: "fact"; ftype: string; workstream: string }
  | { type: "pattern"; signature: string; occurrences: number; threshold: number }
  | { type: "skill"; name: string; level: Level }
  | { type: "agent"; name: string };

const BASE_SKILLS: Skill[] = [
  { id: "s1", name: "org/branches-nommage-kebab-case", level: "organization", levelLabel: "Organization", trigger: "respecter la convention de nommage des branches (kebab-case)", body: "Convention partagée dans l'organisation — appliquée dans 2 projets (checkout, synchro-bancaire).\n\nNée de 2 réponses récurrentes entre équipes.", referents: ["nicolas", "arthur"], sources: 16 },
  { id: "s2", name: "onboarding/funnel-optimiser", level: "project", levelLabel: "Project", trigger: "optimiser le funnel d'onboarding", body: "Née de 2 réponses récurrentes dans l'équipe Growth.\n\n1. duplique la campagne, ajuste le ciblage.\n2. suis la conversion dans le funnel.", referents: ["marc", "léa"], sources: 5 },
];
const NEW_SKILL: Skill = { id: "s3", name: "bancaire/relancer-synchro", level: "project", levelLabel: "Project", trigger: "relancer une synchronisation bancaire échouée (Bridge)", body: "Née de 5 occurrences dans « Synchro bancaire ».\n\n1. rafraîchir le token OAuth.\n2. rejouer le webhook manqué.\n3. vérifier le taux de reprise.", referents: ["nicolas", "arthur", "camille"], sources: 12 };

const BASE_AGENTS: Agent[] = [
  { id: "a0", name: "assistant", status: "active", derivedFrom: "prédéfini · généraliste", skills: [] },
  { id: "a1", name: "specialiste-data-finance-ops", status: "pending", derivedFrom: "équipe Data · 2 compétences", skills: ["bancaire-relancer-synchro", "export-fec-generer"] },
  { id: "a2", name: "specialiste-produit-engineering", status: "pending", derivedFrom: "équipe Produit · 2 compétences", skills: ["checkout-deployer-staging", "build-mobile-publier-staging"] },
  { id: "a3", name: "specialiste-growth-growth", status: "pending", derivedFrom: "équipe Growth · 2 compétences", skills: ["funnel-onboarding-optimiser", "acquisition-campagne-lancer"] },
];

const FACTS: Fact[] = [
  { ftype: "QUESTION", level: "personal", levelLabel: "Personal", author: "sophie", workstream: "Onboarding", content: "Rappel : comment optimiser le funnel d'onboarding ?" },
  { ftype: "QUESTION", level: "personal", levelLabel: "Personal", author: "marc", workstream: "Onboarding", content: "Comment faire pour optimiser le funnel d'onboarding ?" },
  { ftype: "ANSWER", level: "project", levelLabel: "Project", author: "marc", workstream: "Onboarding", content: "duplique la campagne, ajuste le ciblage, et suis la conversion." },
  { ftype: "FACT", level: "project", levelLabel: "Project", author: "marc", workstream: "Onboarding", content: "Décision équipe Growth : on avance sur « Onboarding »." },
  { ftype: "QUESTION", level: "personal", levelLabel: "Personal", author: "nicolas", workstream: "Synchro bancaire", content: "Comment relancer la synchro bancaire après une erreur OAuth 401 ?" },
  { ftype: "ANSWER", level: "project", levelLabel: "Project", author: "arthur", workstream: "Synchro bancaire", content: "rafraîchis le token OAuth puis rejoue le webhook manqué." },
  { ftype: "QUESTION", level: "organization", levelLabel: "Organization", author: "sophie", workstream: "Export FEC", content: "Format attendu pour l'export FEC des clients comptables ?" },
  { ftype: "FACT", level: "team", levelLabel: "Team", author: "camille", workstream: "Checkout", content: "Stripe : passer les webhooks en mode idempotent." },
];

const SIM_FEED: Feed[] = [
  { type: "event", actor: "nicolas", text: "signale une erreur de synchro bancaire (OAuth 401) sur Bridge." },
  { type: "fact", ftype: "QUESTION", workstream: "Synchro bancaire" },
  { type: "event", actor: "arthur", text: "répond : rafraîchis le token OAuth puis rejoue le webhook manqué." },
  { type: "pattern", signature: "bancaire-relancer-synchro", occurrences: 3, threshold: 5 },
  { type: "event", actor: "camille", text: "pose la même question sur « Synchro bancaire »." },
  { type: "pattern", signature: "bancaire-relancer-synchro", occurrences: 5, threshold: 5 },
  { type: "skill", name: "bancaire/relancer-synchro", level: "project" },
  { type: "agent", name: "specialiste-data-finance-ops" },
];

const ANSWER = {
  skillUsed: "bancaire/relancer-synchro",
  answer: "Relancez la synchro bancaire en vérifiant d'abord le token OAuth (erreur 401), puis rejouez le webhook manqué côté Bridge. Une fois la connexion rétablie, surveillez le taux de reprise et l'activation dans le funnel.",
  layers: [
    { level: "personal", facts: [{ author: "sophie", content: "a testé le refresh token la semaine dernière" }] },
    { level: "team", facts: [{ author: "alex", content: "a documenté l'erreur OAuth 401" }] },
    { level: "project", facts: [{ author: "arthur", content: "rejoue le webhook manqué après refresh" }] },
    { level: "organization", facts: [{ author: "nicolas", content: "convention kebab-case sur les branches" }] },
  ],
};

const SCOPE_LABELS: Record<string, string> = { org: "Toute l'organisation", data: "Équipe Data", produit: "Équipe Produit", growth: "Équipe Growth", support: "Équipe Support" };
const SCOPE_TEAMS = [
  { id: "data", name: "Data", projects: [{ id: "synchro", name: "Synchro bancaire" }, { id: "checkout", name: "Checkout" }] },
  { id: "produit", name: "Produit", projects: [{ id: "mobile", name: "Mobile" }] },
  { id: "growth", name: "Growth", projects: [{ id: "onboarding", name: "Onboarding" }, { id: "acquisition", name: "Acquisition" }] },
  { id: "support", name: "Support" },
];

function useViewport() {
  const [w, setW] = useState(1440);
  useEffect(() => { const on = () => setW(window.innerWidth); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return w;
}
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function EspaceDeTravailPage() {
  const w = useViewport();
  const [view, setView] = useState<View>("ready");
  const [scope, setScope] = useState("org");
  const [feed, setFeed] = useState<Feed[]>([]);
  const [skills, setSkills] = useState<Skill[]>(BASE_SKILLS);
  const [skillsCount, setSkillsCount] = useState(2);
  const [agents, setAgents] = useState<Agent[]>(BASE_AGENTS);
  const [newestSkill, setNewestSkill] = useState<string | null>(null);
  const [newestAgent, setNewestAgent] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "skill" | "agent"; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"flux" | "memoire" | "skills">("flux");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [question, setQuestion] = useState("Comment relancer la synchro bancaire après une erreur OAuth ?");
  const [answer, setAnswer] = useState<typeof ANSWER | null>(null);
  const [asking, setAsking] = useState(false);
  const [inject, setInject] = useState("");
  const [simRunning, setSimRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const askRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("state") as View | null;
    if (s && ["ready", "empty", "loading", "disconnected"].includes(s)) setView(s);
  }, []);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; clearTimeout(toastT.current); };
  useEffect(() => clearTimers, []);

  const flashToast = (t: { kind: "skill" | "agent"; msg: string }) => {
    setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 6000);
  };

  const onSimulate = () => {
    if (view === "disconnected") return;
    clearTimers();
    setFeed([]); setSkills(BASE_SKILLS.slice()); setSkillsCount(2); setAgents(BASE_AGENTS.slice());
    setNewestSkill(null); setNewestAgent(null); setToast(null); setSimRunning(true); setActiveTab("flux");
    SIM_FEED.forEach((ev, i) => {
      const t = setTimeout(() => {
        setFeed((prev) => [ev, ...prev]);
        if (ev.type === "skill") {
          setSkills((prev) => [NEW_SKILL, ...prev]);
          setSkillsCount((c) => c + 1);
          setNewestSkill(NEW_SKILL.name);
          flashToast({ kind: "skill", msg: "Compétence née du travail de l'équipe : " + ev.name });
        }
        if (ev.type === "agent") {
          setNewestAgent(ev.name);
          setAgents((prev) => prev.slice().sort((a, b) => (a.name === ev.name ? -1 : b.name === ev.name ? 1 : 0)));
          flashToast({ kind: "agent", msg: "Agent spécialiste émergé : " + ev.name + " (en attente d'approbation)" });
        }
        if (i === SIM_FEED.length - 1) setSimRunning(false);
      }, 700 * (i + 1));
      timers.current.push(t);
    });
  };
  const onReset = () => { clearTimers(); setFeed([]); setSkills(BASE_SKILLS.slice()); setSkillsCount(2); setAgents(BASE_AGENTS.slice()); setNewestSkill(null); setNewestAgent(null); setToast(null); setAnswer(null); setSimRunning(false); };
  const doInject = () => { const v = inject.trim(); if (!v) return; setFeed((p) => [{ type: "event", actor: "vous", text: v }, ...p]); setInject(""); };
  const doAsk = () => { setAsking(true); setAnswer(null); const t = setTimeout(() => { setAsking(false); setAnswer(ANSWER); }, 750); timers.current.push(t); };
  const approve = (id: string) => setAgents((p) => p.map((a) => a.id === id ? { ...a, status: "active" } : a));

  // ---- derived ----
  const connected = view !== "disconnected";
  const isLoading = view === "loading";
  const isEmpty = view === "empty";
  const shownSkills = isEmpty ? [] : skills;
  const shownFacts = isEmpty ? [] : FACTS;

  const mode = w >= 1120 ? "3col" : w >= 768 ? "2col" : "tabs";
  const isTabs = mode === "tabs";
  const isMobile = w < 560;
  const showSubtitle = w >= 700, showSearch = w >= 1180, showTour = w >= 900, showStatus = w >= 620;

  const tabDefs = [{ id: "flux", label: "Flux", count: feed.length }, { id: "memoire", label: "Mémoire", count: shownFacts.length }, { id: "skills", label: "Compétences", count: skillsCount }] as const;
  const showFlux = !isTabs || activeTab === "flux";
  const showMemoire = !isTabs || activeTab === "memoire";
  const showSkills = !isTabs || activeTab === "skills";

  const gridStyle = isTabs
    ? { display: "block" as const }
    : { display: "grid" as const, gridTemplateColumns: mode === "3col" ? "repeat(3,minmax(0,1fr))" : "repeat(2,minmax(0,1fr))", gap: 16, alignItems: "start" as const };
  const agentsLayout = w >= 760
    ? { display: "grid" as const, gridTemplateColumns: "5fr 7fr", gap: 16, alignItems: "start" as const }
    : { display: "flex" as const, flexDirection: "column" as const, gap: 16 };

  const scrollBody = { maxHeight: 460, overflowY: "auto" as const };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-sans)", color: "var(--ink)", WebkitFontSmoothing: "antialiased", boxSizing: "border-box" }}>
      {toast && (
        <div style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 60, width: "calc(100% - 32px)", maxWidth: 520 }}>
          <FlashBanner kind={toast.kind} emerge={!reducedMotion()}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {toast.kind === "skill" ? <Sparkles size={15} /> : <Bot size={15} />}{toast.msg}
            </span>
          </FlashBanner>
        </div>
      )}

      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 24px 96px" }}>
        {/* TOP APP BAR */}
        <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
            <span style={{ width: 34, height: 34, borderRadius: 8, background: "var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 100 100" width="19" height="19" fill="none"><path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" /><circle cx="78" cy="30" r="7" fill="var(--accent)" /></svg>
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>Weave</span>
                <Badge tone="neutral">Cognitive Runtime</Badge>
              </div>
              {showSubtitle && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>Espace de travail · l&apos;intelligence de PennyLane se construit en direct</div>}
            </div>
          </div>

          {showSearch && (
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div style={{ position: "relative", width: "100%", maxWidth: 380 }}>
                <Search size={15} color="var(--muted)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input type="text" placeholder="Rechercher dans la mémoire…" style={{ width: "100%", height: 32, boxSizing: "border-box", border: "1px solid var(--line)", background: "var(--subtle)", borderRadius: 6, padding: "0 12px 0 34px", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--ink)", outline: "none" }} />
              </div>
            </div>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {showTour && <Button variant="ghost" size="md" icon={<CircleHelp size={15} />}>Visite guidée</Button>}
            {showStatus && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--surface)", boxSizing: "border-box" }}>
                <StatusIndicator connected={connected} labelConnected="en direct" labelOffline="hors ligne" />
                <span style={{ width: 1, height: 14, background: "var(--line)" }} />
                <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>Ollama (local)</span>
              </div>
            )}
            <Avatar name="Sophie Bernard" size="md" />
          </div>
        </header>

        {/* SCOPE + ACTIONS */}
        <div style={{ padding: "18px 0 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            {isMobile ? (
              <Select value={scope} onChange={(e) => setScope(e.target.value)} options={[{ value: "org", label: "Organisation" }, { value: "data", label: "Data" }, { value: "produit", label: "Produit" }, { value: "growth", label: "Growth" }, { value: "support", label: "Support" }]} />
            ) : (
              <ScopeSelector teams={SCOPE_TEAMS} scope={{ team: scope === "org" ? undefined : scope }} onChange={(s) => setScope(s.team || "org")} trailing={SCOPE_LABELS[scope]} />
            )}
          </div>
          {!isTabs && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <Button variant="ghost" size="md" onClick={onReset}>Réinitialiser</Button>
              <Button variant="primary" size="md" icon={<Zap size={15} />} onClick={onSimulate} disabled={simRunning}>{simRunning ? "Simulation…" : "Simuler l'activité"}</Button>
            </div>
          )}
        </div>

        {view === "disconnected" && (
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--subtle)" }}>
            <WifiOff size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--ink-soft)", flex: 1 }}>Connexion interrompue — affichage des dernières données connues. La simulation est en pause.</span>
            <Button variant="secondary" size="sm" onClick={() => setView("ready")}>Reconnecter</Button>
          </div>
        )}

        {/* TABS (mobile/tablet) */}
        {isTabs && (
          <div style={{ display: "flex", gap: 4, border: "1px solid var(--line)", borderRadius: 8, padding: 3, background: "var(--surface)", marginBottom: 14 }}>
            {tabDefs.map((t) => {
              const active = t.id === activeTab;
              return (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                  style={{ flex: 1, border: "none", cursor: "pointer", borderRadius: 5, padding: "8px 6px", fontSize: 12.5, fontWeight: 500, fontFamily: "var(--font-sans)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, background: active ? "var(--accent-soft)" : "transparent", color: active ? "var(--accent-deep)" : "var(--ink-soft)" }}>
                  {t.label}<span style={{ fontSize: 10, fontVariantNumeric: "tabular-nums", padding: "1px 6px", borderRadius: 999, background: active ? "var(--surface)" : "var(--subtle)", color: "var(--muted)" }}>{t.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* PANEL GRID */}
        <div style={gridStyle}>
          {showFlux && (
            <Panel title="Flux d'activité IA" icon={<Activity size={15} strokeWidth={2} />} count={feed.length} bodyStyle={scrollBody}>
              <div className="wv-scroll" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {isLoading ? (
                  <><div className="wv-shimmer" style={{ height: 38 }} /><div className="wv-shimmer" style={{ height: 26, width: "70%" }} /><div className="wv-shimmer" style={{ height: 52 }} /></>
                ) : feed.length === 0 ? (
                  <EmptyState>Cliquez « Simuler l&apos;activité » : chaque personne de chaque équipe se met à travailler avec l&apos;IA, et la mémoire se crée sous vos yeux.</EmptyState>
                ) : feed.map((f, i) => <FeedRow key={i} f={f} />)}
              </div>
            </Panel>
          )}

          {showMemoire && (
            <Panel title={scope === "org" ? "Mémoire partagée" : "Mémoire · " + SCOPE_LABELS[scope]} icon={<Brain size={15} strokeWidth={2} />} count={shownFacts.length} bodyStyle={scrollBody}>
              <div className="wv-scroll" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {isLoading ? (
                  <><div className="wv-shimmer" style={{ height: 60 }} /><div className="wv-shimmer" style={{ height: 60 }} /></>
                ) : shownFacts.length === 0 ? (
                  <EmptyState>La mémoire partagée se remplira à mesure que vos équipes échangent avec l&apos;IA.</EmptyState>
                ) : shownFacts.map((m, i) => (
                  <Card key={i} tone="neutral" radius="md" padding="10px">
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                      <Badge tone="white" shape="tag" uppercase>{m.ftype}</Badge>
                      <Badge tone={m.level}>{m.levelLabel}</Badge>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{m.workstream} · {m.author}</span>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.45 }}>{m.content}</div>
                  </Card>
                ))}
              </div>
            </Panel>
          )}

          {showSkills && (
            <div style={mode === "2col" ? { gridColumn: "1 / -1" } : undefined}>
              <Panel title="Compétences vivantes" icon={<Sparkles size={15} strokeWidth={2} />} count={skillsCount} subtitle="Nées des projets · promues au niveau org quand partagées entre équipes." bodyStyle={scrollBody}>
                <div className="wv-scroll" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {isLoading ? (
                    <><div className="wv-shimmer" style={{ height: 96 }} /><div className="wv-shimmer" style={{ height: 96 }} /></>
                  ) : shownSkills.length === 0 ? (
                    <EmptyState>Aucune compétence pour l&apos;instant — elles émergent quand un schéma se répète assez souvent.</EmptyState>
                  ) : shownSkills.map((s) => {
                    const isNewest = s.name === newestSkill;
                    const isOrg = s.level === "organization";
                    const open = !!expanded[s.id];
                    return (
                      <Card key={s.id} tone={isNewest ? "accent" : isOrg ? "organization" : "neutral"} emerge={isNewest && !reducedMotion()} radius="lg" padding="12px">
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            {isOrg ? <Building2 size={14} color="var(--lvl-org)" style={{ flexShrink: 0 }} /> : <Sparkles size={14} color="var(--accent)" style={{ flexShrink: 0 }} />}
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                          </span>
                          <span style={{ flexShrink: 0 }}><Badge tone={s.level}>{s.levelLabel}</Badge></span>
                        </div>
                        <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.45 }}>{s.trigger}</div>
                        {open && <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", padding: 9, fontSize: 11, lineHeight: 1.55, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>{s.body}</pre>}
                        <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
                          <button type="button" onClick={() => setExpanded((p) => ({ ...p, [s.id]: !p[s.id] }))} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "var(--accent)", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 500 }}>{open ? "Masquer le détail" : "Voir le détail"}</button>
                          <span>·</span><span>référents</span>
                          {s.referents.map((r) => <Avatar key={r} name={r} size="sm" />)}
                          <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{s.sources} sources</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </Panel>
            </div>
          )}
        </div>

        {/* AGENTS */}
        <div style={{ marginTop: 16 }}>
          <Panel title="Agents" icon={<Bot size={15} strokeWidth={2} />} count={agents.length} subtitle="Un spécialiste par équipe, né de ses compétences.">
            <div style={agentsLayout}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {agents.map((a) => {
                  const pending = a.status === "pending";
                  const isNewest = a.name === newestAgent;
                  return (
                    <Card key={a.id} tone={isNewest ? "accent" : pending ? "organization" : "neutral"} emerge={isNewest && !reducedMotion()} radius="lg" padding="12px">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                          {pending ? <CircleDot size={13} color="var(--lvl-org)" style={{ flexShrink: 0 }} /> : <Circle size={13} color="var(--accent)" style={{ flexShrink: 0 }} />}
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                        </span>
                        {pending ? <Button variant="dark" size="sm" onClick={() => approve(a.id)}>Approuver</Button> : <Badge tone="active">actif</Badge>}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted)" }}>{a.derivedFrom}</div>
                      {a.skills.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {a.skills.map((sk) => <span key={sk} style={{ borderRadius: 4, background: "var(--subtle)", padding: "2px 7px", fontSize: 10, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>✦ {sk}</span>)}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
              <div>
                <h3 style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Injecter un message · vous jouez un membre de l&apos;équipe</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <Input value={inject} onChange={(e) => setInject(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doInject(); }} placeholder="Écrivez comme un coéquipier, puis Envoyer…" />
                  <Button variant="dark" size="md" onClick={doInject}>Envoyer</Button>
                </div>
                <p style={{ marginTop: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Répétez une même question dans un projet (5×) et regardez une compétence naître. Posez-la dans deux équipes → une compétence d&apos;organisation.</p>
              </div>
            </div>
          </Panel>
        </div>

        {/* INTERROGER */}
        <div style={{ marginTop: 16 }} ref={askRef}>
          <Panel title="Interroger la mémoire partagée" icon={<MessageSquare size={15} strokeWidth={2} />}>
            <div style={{ display: "flex", gap: 8 }}>
              <Input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doAsk(); }} placeholder="Posez une question à l'organisation…" />
              <Button variant="primary" size="md" onClick={doAsk} disabled={asking}>{asking ? "…" : "Demander"}</Button>
            </div>
            {asking && <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}><div className="wv-shimmer" style={{ height: 16, width: "40%" }} /><div className="wv-shimmer" style={{ height: 48 }} /></div>}
            {answer && !asking && (
              <div style={{ marginTop: 16 }}>
                <AnswerBlock answer={answer.answer} skillUsed={answer.skillUsed} layers={answer.layers} />
                <div style={{ marginTop: 8 }}><a href="/interroger-la-memoire" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>Voir la réponse complète et ses sources →</a></div>
              </div>
            )}
          </Panel>
        </div>

        <footer style={{ marginTop: 28, borderTop: "1px solid var(--line)", paddingTop: 16, textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
          Mémoire scopée · personnel → équipe → projet → organisation · chaque réponse est traçable jusqu&apos;à ses sources
        </footer>
      </div>

      {/* STICKY MOBILE ACTION BAR */}
      {isTabs && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, display: "flex", gap: 10, padding: "12px 16px", background: "var(--bg)", borderTop: "1px solid var(--line)" }}>
          <Button variant="secondary" size="lg" style={{ flex: 1 }} onClick={() => askRef.current?.scrollIntoView({ behavior: "smooth" })}>Interroger</Button>
          <Button variant="primary" size="lg" style={{ flex: 1 }} icon={<Zap size={15} />} onClick={onSimulate} disabled={simRunning}>{simRunning ? "Simulation…" : "Simuler"}</Button>
        </div>
      )}
    </div>
  );
}

function FeedRow({ f }: { f: Feed }) {
  if (f.type === "event") return <Card tone="neutral" radius="md" padding="7px 10px"><span style={{ fontSize: 12 }}><span style={{ color: "var(--muted)" }}>{f.actor}</span> <span style={{ color: "var(--ink)" }}>{f.text}</span></span></Card>;
  if (f.type === "fact") return <div style={{ padding: "3px 10px", fontSize: 11, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}><Badge tone="white" shape="tag" uppercase>{f.ftype}</Badge> fait extrait · {f.workstream}</div>;
  if (f.type === "pattern") return <Card tone="organization" radius="md" padding="8px 10px"><div style={{ fontSize: 11, color: "var(--lvl-org)" }}>schéma « {f.signature} »</div><div style={{ marginTop: 6 }}><ProgressBar occurrences={f.occurrences} threshold={f.threshold} /></div></Card>;
  if (f.type === "skill") return <Card tone="accent" radius="md" padding="8px 10px"><span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--accent-deep)" }}><Sparkles size={13} /><b style={{ fontWeight: 600 }}>compétence née</b> : {f.name}</span></Card>;
  if (f.type === "agent") return <Card tone="organization" radius="md" padding="8px 10px"><span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--lvl-org)" }}><Bot size={13} /><b style={{ fontWeight: 600 }}>agent émergé</b> : {f.name}</span></Card>;
  return null;
}
