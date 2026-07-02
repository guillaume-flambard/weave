"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  Bot, Sparkles, Route, Shield, MessageSquare, TrendingUp, Check, Play, Info,
  ChevronRight, ChevronDown, List, GitBranch, Clock,
} from "lucide-react";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";
import { Panel, AnswerBlock, EmptyState } from "../../components/ui/workspace-ui";

// Agent — detail + reasoning trace + governance, ported from Claude Design
// (Agent.dc.html). State via ?state=pending|active|chargement|introuvable.

type View = "pending" | "active" | "chargement" | "introuvable";
type Level = "personal" | "team" | "project" | "organization";
type Kind = "plan" | "delegate" | "verify" | "respond";

const AGENT = { name: "specialiste-data-finance-ops", team: "Data", domain: "finance-ops", skillCount: 2 };
const CLUSTER = [{ name: "bancaire/relancer-synchro", uses: 34 }, { name: "export-fec/generer", uses: 21 }];
const GUARDRAILS = ["profondeur max 2", "≤ 3 agents", "budget 30 s"];
const TRACE: { kind: Kind; agent: string; action: string; depth: number; note: string }[] = [
  { kind: "plan", agent: "specialiste-data-finance-ops", action: "Planifier la résolution", depth: 0, note: "Décompose la demande « relancer la synchro bancaire d'un client » en sous-tâches et sélectionne les compétences pertinentes du domaine finance-ops." },
  { kind: "delegate", agent: "compétence · bancaire/relancer-synchro", action: "Déléguer à une compétence", depth: 1, note: "Rafraîchit le token OAuth du connecteur Bridge, puis rejoue le webhook manqué (sync.completed). Reste dans le périmètre Data." },
  { kind: "verify", agent: "specialiste-data-finance-ops", action: "Vérifier le résultat", depth: 1, note: "Contrôle le taux de reprise et confirme la régénération des écritures FEC. Vérifie qu'aucune double écriture n'est créée côté Stripe." },
  { kind: "respond", agent: "specialiste-data-finance-ops", action: "Composer la réponse", depth: 0, note: "Assemble la réponse finale et y attache la provenance : personnel → équipe → projet → organisation." },
];
const APPROVERS = [{ name: "sophie", role: "admin · Data" }, { name: "nicolas", role: "référent · Synchro bancaire" }];
const PERIMETER: { level: Level; levelLabel: string; label: string }[] = [
  { level: "team", levelLabel: "Team", label: "Data" },
  { level: "project", levelLabel: "Project", label: "Synchro bancaire" },
  { level: "project", levelLabel: "Project", label: "Export FEC" },
];
const ANSWER = {
  skillUsed: "bancaire/relancer-synchro",
  answer: "Relancez la synchro bancaire en rafraîchissant le token OAuth (erreur 401) puis en rejouant le webhook manqué côté Bridge. Une fois la connexion rétablie, les écritures FEC sont régénérées et le taux de reprise remonte sous 5 minutes.",
  layers: [
    { level: "personal", facts: [{ author: "sophie", content: "a testé le refresh token la semaine dernière" }] },
    { level: "team", facts: [{ author: "alex", content: "a documenté l'erreur OAuth 401" }] },
    { level: "project", facts: [{ author: "arthur", content: "rejoue le webhook manqué après refresh" }] },
    { level: "organization", facts: [{ author: "nicolas", content: "convention kebab-case sur les branches" }] },
  ],
};
const KIND_COLOR: Record<Kind, string> = { plan: "var(--ink)", delegate: "var(--lvl-project)", verify: "var(--lvl-team)", respond: "var(--accent)" };
const KIND_LABEL: Record<Kind, string> = { plan: "plan", delegate: "délégation", verify: "vérification", respond: "réponse" };
const KIND_FG: Record<Kind, string> = { plan: "var(--ink-soft)", delegate: "var(--lvl-project)", verify: "var(--lvl-team)", respond: "var(--accent-deep)" };
const KIND_BG: Record<Kind, string> = { plan: "var(--subtle)", delegate: "var(--lvl-project-bg)", verify: "var(--lvl-team-bg)", respond: "var(--accent-soft)" };

function useViewport() {
  const [w, setW] = useState(1440);
  useEffect(() => { const on = () => setW(window.innerWidth); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return w;
}

export default function AgentPage() {
  const w = useViewport();
  const [propView, setPropView] = useState<View>("pending");
  const [statusOverride, setStatusOverride] = useState<"active" | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [justApproved, setJustApproved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true, 1: true });
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pulseT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("state") as View | null;
    if (s && ["pending", "active", "chargement", "introuvable"].includes(s)) setPropView(s);
  }, []);
  useEffect(() => { const on = () => setCollapsed((window.scrollY || 0) > 130); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  useEffect(() => () => { clearTimeout(toastT.current); clearTimeout(pulseT.current); }, []);

  const isLoading = propView === "chargement";
  const isNotFound = propView === "introuvable";
  const status: "active" | "pending" = statusOverride ?? (propView === "active" ? "active" : "pending");
  const isActive = status === "active";
  const isPending = status === "pending";
  const twoCol = w >= 1024;
  const isNarrow = w < 768;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const onApprove = () => {
    setStatusOverride("active"); setJustApproved(true); setToast(`Agent approuvé · ${AGENT.name} est actif`);
    clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 3200);
    clearTimeout(pulseT.current); pulseT.current = setTimeout(() => setJustApproved(false), 900);
  };

  const bodyGrid: CSSProperties = { display: "grid", gridTemplateColumns: twoCol ? "minmax(0,2fr) minmax(0,1fr)" : "minmax(0,1fr)", gap: 16, alignItems: "start" };
  const auditNote = isActive
    ? `Émergé le 12 mars 2026 · approuvé par sophie${statusOverride ? " à l'instant" : " le 13 mars 2026"}. Chaque exécution est journalisée et auditable.`
    : "Émergé le 12 mars 2026 · en attente d'approbation. Aucune exécution tant qu'un humain n'a pas validé.";
  const activity = isActive ? { runs: "18", last: "il y a 5 h", success: "17/18 réussies", successColor: "var(--lvl-team)" } : { runs: "0 · essai à blanc", last: "—", success: "en attente", successColor: "var(--muted)" };

  if (isNotFound) {
    return (
      <Shell w={w}>
        <div style={{ maxWidth: 1360, margin: "0 auto", padding: 24, display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: 440, width: "100%", textAlign: "center", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: "32px 28px", marginTop: 32, boxSizing: "border-box" }}>
            <svg viewBox="0 0 100 100" width="44" height="44" fill="none" style={{ display: "block", margin: "0 auto", opacity: 0.55 }}><path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /><circle cx="78" cy="30" r="6" fill="var(--accent)" /></svg>
            <div style={{ marginTop: 16, fontSize: 16, fontWeight: 600 }}>Agent introuvable</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>Cet agent n&apos;existe pas ou a été retiré. Les agents émergent d&apos;un cluster de compétences et restent sous gouvernance humaine.</div>
            <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}><a href="/espace-de-travail" style={{ textDecoration: "none" }}><Button variant="secondary">← Retour aux agents</Button></a></div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell w={w}>
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 24px 96px" }}>
        <nav aria-label="Fil d'ariane" style={{ padding: "16px 0 0", display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--muted)" }}>
          <a href="/espace-de-travail" style={{ color: "var(--muted)", textDecoration: "none" }}>Agents</a><span>/</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{AGENT.name}</span>
        </nav>

        <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--bg)", padding: collapsed ? "12px 0" : "18px 0 20px", borderBottom: collapsed ? "1px solid var(--line)" : "1px solid transparent", marginBottom: 16, transition: "padding 150ms ease" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Bot size={17} color={isActive ? "var(--accent)" : "var(--lvl-org)"} style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 600, color: "var(--ink)", wordBreak: "break-word" }}>{AGENT.name}</span>
                <span className={justApproved && !reduce ? "wv-pulse" : undefined} style={{ display: "inline-flex", borderRadius: 999 }}>
                  <Badge tone={isActive ? "active" : "pending"}>{isActive ? "actif" : "en attente d'approbation"}</Badge>
                </span>
              </div>
              {!collapsed && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5, color: "var(--muted)" }}>
                  <span>équipe {AGENT.team}</span><span>·</span><span>domaine {AGENT.domain}</span><span>·</span><span>dérivé de {AGENT.skillCount} compétences</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {isActive && !collapsed && <Button variant="secondary" size="md">Suspendre</Button>}
              {isPending ? <Button variant="dark" size="md" icon={<Check size={15} />} onClick={onApprove}>Approuver</Button>
                : <Button variant="primary" size="md" icon={<Play size={14} />}>Lancer une tâche</Button>}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div style={bodyGrid}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{[56, 180].map((h, i) => <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, background: "var(--surface)" }}><div className="wv-shimmer" style={{ height: 14, width: "36%" }} /><div className="wv-shimmer" style={{ height: h, marginTop: 14 }} /></div>)}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{[100, 60].map((h, i) => <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, background: "var(--surface)" }}><div className="wv-shimmer" style={{ height: h }} /></div>)}</div>
          </div>
        ) : (
          <>
            {isPending && (
              <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", border: "1px solid color-mix(in srgb, var(--lvl-org) 45%, transparent)", borderRadius: 8, background: "var(--lvl-org-bg)", flexWrap: "wrap" }}>
                <Clock size={17} color="var(--lvl-org)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--lvl-org)" }}>En attente d&apos;approbation</div>
                  <div style={{ marginTop: 2, fontSize: 12.5, color: "var(--ink-soft)" }}>Rien ne s&apos;exécute tant qu&apos;un humain n&apos;a pas validé. La trace ci-dessous est un essai à blanc.</div>
                </div>
                <Button variant="dark" size="md" icon={<Check size={15} />} onClick={onApprove}>Approuver l&apos;agent</Button>
              </div>
            )}

            <div style={bodyGrid}>
              {/* LEFT */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
                <Panel title="Compétences sources" icon={<Sparkles size={15} strokeWidth={2} />} count={AGENT.skillCount} subtitle="Un agent spécialiste émerge quand ≥ 2 compétences d'un même domaine sont observées ensemble.">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {CLUSTER.map((s) => (
                      <a key={s.name} href="/competence" style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", background: "var(--surface)", flex: 1, minWidth: 200 }}>
                        <Sparkles size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>{s.uses} utilisations</span>
                        </span>
                        <ChevronRight size={14} color="var(--muted)" style={{ flexShrink: 0 }} />
                      </a>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-soft)", background: "var(--subtle)", borderRadius: 8, padding: "9px 11px" }}>
                    <Info size={14} color="var(--accent)" style={{ flexShrink: 0 }} />2 compétences du domaine finance-ops observées ensemble → cet agent a émergé automatiquement.
                  </div>
                </Panel>

                <Panel title={isPending ? "Trace de raisonnement · essai à blanc" : "Trace de raisonnement"} icon={<Route size={15} strokeWidth={2} />} subtitle={isPending ? "Plan → déléguer → vérifier · simulation avant approbation." : "Plan → déléguer → vérifier · dernière exécution il y a 5 h."}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                    {GUARDRAILS.map((g) => <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid var(--line)", background: "var(--subtle)", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "var(--ink-soft)" }}><Check size={12} color="var(--muted)" />{g}</span>)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {TRACE.map((s, i) => {
                      const open = !!expanded[i];
                      const indent = s.depth * (isNarrow ? 16 : 28);
                      const hasLine = i < TRACE.length - 1;
                      const StepIcon = s.kind === "plan" ? List : s.kind === "delegate" ? GitBranch : s.kind === "verify" ? Check : MessageSquare;
                      return (
                        <div key={i} style={{ marginLeft: indent }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, alignSelf: "stretch" }}>
                              <span style={{ width: 24, height: 24, borderRadius: "50%", background: KIND_COLOR[s.kind], display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><StepIcon size={12} color="#fff" strokeWidth={2.2} /></span>
                              {hasLine && <span style={{ width: 2, flex: 1, minHeight: 14, background: "var(--line)" }} />}
                            </div>
                            <div style={{ minWidth: 0, flex: 1, paddingBottom: hasLine ? 16 : 2 }}>
                              <button type="button" onClick={() => setExpanded((p) => ({ ...p, [i]: !p[i] }))} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ minWidth: 0, flex: 1 }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{s.action}</span>
                                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500, color: KIND_FG[s.kind], background: KIND_BG[s.kind], borderRadius: 4, padding: "1px 6px" }}>{KIND_LABEL[s.kind]}</span>
                                  </span>
                                  <span style={{ display: "block", marginTop: 2, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.agent}</span>
                                </span>
                                <ChevronDown size={15} color="var(--muted)" style={{ flexShrink: 0, transition: "transform 200ms ease", transform: open ? "rotate(180deg)" : "none" }} />
                              </button>
                              <div style={{ overflow: "hidden", maxHeight: open ? 260 : 0, opacity: open ? 1 : 0, transition: "max-height 220ms ease, opacity 220ms ease" }}>
                                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.5, paddingTop: 6 }}>{s.note}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>

                <Panel title="Réponse produite" icon={<MessageSquare size={15} strokeWidth={2} />} subtitle={isActive ? "Dernière réponse composée par l'agent." : "Disponible une fois l'agent approuvé."}>
                  {isActive ? (
                    <>
                      <AnswerBlock answer={ANSWER.answer} skillUsed={ANSWER.skillUsed} layers={ANSWER.layers} />
                      <div style={{ marginTop: 8 }}><a href="/interroger-la-memoire" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>Voir la provenance complète →</a></div>
                    </>
                  ) : (
                    <EmptyState>Aucune réponse encore produite — l&apos;agent doit d&apos;abord être approuvé. L&apos;essai à blanc ci-dessus montre le raisonnement prévu.</EmptyState>
                  )}
                </Panel>
              </div>

              {/* RIGHT RAIL */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
                <Panel title="Gouvernance" icon={<Shield size={15} strokeWidth={2} />}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>État</span>
                    <Badge tone={isActive ? "active" : "pending"}>{isActive ? "actif" : "en attente d'approbation"}</Badge>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 500, marginBottom: 8 }}>Peuvent approuver</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {APPROVERS.map((p) => (
                        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Avatar name={p.name} size="sm" /><span style={{ fontSize: 12.5, color: "var(--ink)" }}>{p.name}</span><span style={{ fontSize: 11, color: "var(--muted)" }}>{p.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginTop: 14, borderTop: "1px solid var(--line-soft)", paddingTop: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <Clock size={14} color="var(--muted)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}>{auditNote}</span>
                  </div>
                </Panel>

                <Panel title="Périmètre" icon={<Bot size={15} strokeWidth={2} />} subtitle="Ce que l'agent peut lire.">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {PERIMETER.map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge tone={p.level}>{p.levelLabel}</Badge><span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{p.label}</span>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Activité" icon={<TrendingUp size={15} strokeWidth={2} />}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <Row label="Exécutions" value={<span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{activity.runs}</span>} />
                    <Row label="Dernière exécution" value={<span style={{ fontSize: 12.5, color: "var(--muted)" }}>{activity.last}</span>} />
                    <Row label="Fiabilité" value={<span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: activity.successColor }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: activity.successColor }} />{activity.success}</span>} />
                  </div>
                </Panel>
              </div>
            </div>
          </>
        )}
      </div>

      {isNarrow && !isLoading && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, display: "flex", gap: 10, padding: "12px 16px", background: "var(--bg)", borderTop: "1px solid var(--line)" }}>
          {isPending ? <Button variant="dark" size="lg" style={{ flex: 1 }} icon={<Check size={15} />} onClick={onApprove}>Approuver l&apos;agent</Button>
            : <Button variant="primary" size="lg" style={{ flex: 1 }} icon={<Play size={14} />}>Lancer une tâche</Button>}
        </div>
      )}

      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: isNarrow ? 76 : 20, left: "50%", transform: "translateX(-50%)", zIndex: 60, display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8, background: "var(--ink)", color: "#fff", fontSize: 13, boxShadow: "0 4px 14px rgba(15,15,15,0.16)" }}><Check size={15} />{toast}</div>
      )}
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{label}</span>{value}</div>;
}

function Shell({ w, children }: { w: number; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-sans)", color: "var(--ink)", WebkitFontSmoothing: "antialiased", boxSizing: "border-box" }}>
      <div style={{ borderBottom: "1px solid var(--line)" }}>
        <header style={{ maxWidth: 1360, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 14 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0, textDecoration: "none" }}>
            <span style={{ width: 32, height: 32, borderRadius: 7, background: "var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 100 100" width="18" height="18" fill="none"><path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" /><circle cx="78" cy="30" r="7" fill="var(--accent)" /></svg>
            </span>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>Weave</span>
          </a>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {w >= 560 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--surface)", boxSizing: "border-box" }}>
                <StatusIndicator connected labelConnected="en direct" />
                <span style={{ width: 1, height: 14, background: "var(--line)" }} />
                <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>Ollama (local)</span>
              </div>
            )}
            <Avatar name="Sophie Bernard" size="md" />
          </div>
        </header>
      </div>
      {children}
    </div>
  );
}
