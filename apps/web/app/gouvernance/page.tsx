"use client";

import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import {
  Building2, Folder, FolderOpen, Users, Shield, LayoutGrid, Plug, CreditCard,
  Bot, Check, Lock, TriangleAlert, CircleCheck, History, Plus, Info,
} from "lucide-react";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";

// Gouvernance — ported from Claude Design (Gouvernance.dc.html) to React.
// Multi-tenant governance: approval queue, audit log, teams, access matrix.

type Level = "personal" | "team" | "project" | "organization";
type Kind = "agent" | "promotion";
type QueueItem = { id: string; name: string; kind: Kind; level: Level; levelLabel: string; derived: string; requested: string };
type AuditItem = { id: string; actor: string; verb: string; target: string; when: string; kind: "approve" | "reject" | "promote"; note?: string };
type Team = { name: string; members: string[]; projects: { name: string; slug: string; domain: string }[]; dot: string };
type Access = Record<string, Record<Level, boolean>>;
type View = "normal" | "vide" | "chargement" | "erreur" | "refusé";
type Section = "org" | "teams" | "members" | "gouvernance" | "access" | "sources" | "billing";

const NAV: { id: Section; label: string; icon: typeof Shield }[] = [
  { id: "org", label: "Organisation", icon: Building2 },
  { id: "teams", label: "Équipes & projets", icon: Folder },
  { id: "members", label: "Membres", icon: Users },
  { id: "gouvernance", label: "Gouvernance", icon: Shield },
  { id: "access", label: "Périmètres & accès", icon: LayoutGrid },
  { id: "sources", label: "Sources", icon: Plug },
  { id: "billing", label: "Facturation", icon: CreditCard },
];

const META: Record<Section, [string, string]> = {
  gouvernance: ["Gouvernance", "Rien ne passe en production sans validation humaine. Approuvez les agents et promotions émergents, et gardez une trace de chaque décision."],
  teams: ["Équipes & projets", "La structure de votre organisation. Chaque projet porte un slug de workstream et un domaine."],
  access: ["Périmètres & accès", "Qui peut lire quelle couche de mémoire. Les périmètres isolent les équipes — activez explicitement chaque partage."],
  org: ["Organisation", ""], members: ["Membres", ""], sources: ["Sources", ""], billing: ["Facturation", ""],
};

const INITIAL_QUEUE: QueueItem[] = [
  { id: "q1", name: "specialiste-growth-growth", kind: "agent", level: "team", levelLabel: "Team", derived: "Dérivé de 2 compétences · funnel-optimiser, growth/relance-trial", requested: "il y a 2 h" },
  { id: "q2", name: "org/branches-nommage-kebab-case", kind: "promotion", level: "organization", levelLabel: "Organization", derived: "Promotion org · observée dans Onboarding et Checkout", requested: "il y a 5 h" },
  { id: "q3", name: "specialiste-support-onboarding", kind: "agent", level: "team", levelLabel: "Team", derived: "Dérivé de 3 compétences · onboarding/funnel-optimiser, support/relance", requested: "hier" },
  { id: "q4", name: "onboarding/funnel-optimiser", kind: "promotion", level: "organization", levelLabel: "Organization", derived: "Promotion org · partagée entre Produit et Growth", requested: "il y a 1 j" },
];

const INITIAL_AUDIT: AuditItem[] = [
  { id: "a1", actor: "sophie", verb: "a approuvé l'agent", target: "specialiste-data-finance-ops", when: "il y a 3 j", kind: "approve" },
  { id: "a2", actor: "marc", verb: "a rejeté l'agent", target: "specialiste-growth-ads", when: "il y a 4 j", kind: "reject", note: "périmètre trop large" },
  { id: "a3", actor: "sophie", verb: "a promu la compétence", target: "bancaire/relancer-synchro", when: "il y a 5 j", kind: "promote" },
  { id: "a4", actor: "nicolas", verb: "a approuvé la compétence", target: "org/pr-titre-convention", when: "il y a 6 j", kind: "approve" },
];

const TEAMS: Team[] = [
  { name: "Data", members: ["sophie", "nicolas", "arthur"], projects: [{ name: "Synchro bancaire", slug: "bancaire", domain: "finance-ops" }, { name: "Export FEC", slug: "fec", domain: "compta" }], dot: "var(--lvl-team)" },
  { name: "Produit", members: ["marc", "léa"], projects: [{ name: "Onboarding", slug: "onboarding", domain: "activation" }, { name: "Checkout", slug: "checkout", domain: "paiement" }], dot: "var(--lvl-project)" },
  { name: "Growth", members: ["alex", "camille"], projects: [{ name: "Funnel", slug: "growth", domain: "acquisition" }], dot: "var(--lvl-personal)" },
  { name: "Support", members: ["sarah"], projects: [], dot: "var(--lvl-org)" },
];

const LEVELS: { key: Level; label: string; tone: Level; dot: string }[] = [
  { key: "personal", label: "Personal", tone: "personal", dot: "var(--lvl-personal)" },
  { key: "team", label: "Team", tone: "team", dot: "var(--lvl-team)" },
  { key: "project", label: "Project", tone: "project", dot: "var(--lvl-project)" },
  { key: "organization", label: "Organization", tone: "organization", dot: "var(--lvl-org)" },
];

function defaultAccess(): Access {
  const a = {} as Access;
  (["Data", "Produit", "Growth", "Support"] as const).forEach((t) => {
    a[t] = { personal: false, team: true, project: true, organization: true };
  });
  a["Growth"].project = false;      // scope-isolation example
  a["Support"].organization = false;
  return a;
}

function useViewport() {
  const [w, setW] = useState(1440);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

export default function GouvernancePage() {
  const w = useViewport();
  const [view, setView] = useState<View>("normal");
  const [section, setSection] = useState<Section>("gouvernance");
  const [queue, setQueue] = useState<QueueItem[]>(INITIAL_QUEUE);
  const [audit, setAudit] = useState<AuditItem[]>(INITIAL_AUDIT);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [access, setAccess] = useState<Access>(defaultAccess);
  const [savedAccess, setSavedAccess] = useState<Access>(defaultAccess);
  const [auditFilter, setAuditFilter] = useState<"all" | "approve" | "reject">("all");
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resolveT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Optional demo controls via URL (?state=, ?section=) — mirrors the design props.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("state") as View | null;
    if (s && ["normal", "vide", "chargement", "erreur", "refusé"].includes(s)) setView(s);
    const sec = p.get("section") as Section | null;
    if (sec && NAV.some((n) => n.id === sec)) setSection(sec);
  }, []);
  useEffect(() => () => { clearTimeout(toastT.current); clearTimeout(resolveT.current); }, []);

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 3200);
  };

  const navLabels = w >= 1024;
  const navVertical = w >= 768;
  const showStatus = w >= 620;
  const isNarrow = w < 720;
  const accessMatrix = w >= 720;

  const isDenied = view === "refusé" && section === "gouvernance";
  const isError = view === "erreur" && section === "gouvernance";
  const isLoading = view === "chargement" && section === "gouvernance";
  const forceEmpty = view === "vide";

  const visibleQueue = forceEmpty ? [] : queue;
  const queueCount = visibleQueue.length;
  const selCount = visibleQueue.filter((q) => sel[q.id]).length;
  const allSelected = visibleQueue.length > 0 && visibleQueue.every((q) => sel[q.id]);

  const showGovernance = section === "gouvernance" && !isDenied && !isError;
  const showQueueRows = showGovernance && !isLoading && queueCount > 0;
  const isQueueEmpty = showGovernance && !isLoading && queueCount === 0;
  const hasQueue = showGovernance && !isLoading && queueCount > 0;

  const resolve = (ids: string[], approved: boolean) => {
    const acted = queue.filter((x) => ids.includes(x.id));
    setResolving((r) => { const n = { ...r }; ids.forEach((id) => (n[id] = true)); return n; });
    clearTimeout(resolveT.current);
    resolveT.current = setTimeout(() => {
      setQueue((q) => q.filter((x) => !ids.includes(x.id)));
      setAudit((prev) => [
        ...acted.map((x) => ({
          id: `au-${x.id}-${prev.length}`, actor: "sophie",
          verb: approved ? (x.kind === "agent" ? "a approuvé l'agent" : "a promu la compétence") : (x.kind === "agent" ? "a rejeté l'agent" : "a rejeté la promotion"),
          target: x.name, when: "à l'instant", kind: (approved ? (x.kind === "agent" ? "approve" : "promote") : "reject") as AuditItem["kind"],
        })),
        ...prev,
      ]);
      setSel((s) => { const n = { ...s }; ids.forEach((id) => delete n[id]); return n; });
      setResolving((r) => { const n = { ...r }; ids.forEach((id) => delete n[id]); return n; });
      flash(approved
        ? (ids.length > 1 ? `${ids.length} émergences approuvées` : "Émergence approuvée · mise en service")
        : (ids.length > 1 ? `${ids.length} émergences rejetées` : "Émergence rejetée"));
    }, 240);
  };

  const toggleAll = () => {
    if (allSelected) { setSel({}); return; }
    const n: Record<string, boolean> = {};
    visibleQueue.forEach((q) => (n[q.id] = true));
    setSel(n);
  };
  const toggleAccess = (team: string, level: Level) =>
    setAccess((a) => ({ ...a, [team]: { ...a[team], [level]: !a[team][level] } }));
  const accessDirty = JSON.stringify(access) !== JSON.stringify(savedAccess);

  const [title, subtitle] = META[section];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-sans)", color: "var(--ink)", WebkitFontSmoothing: "antialiased", boxSizing: "border-box" }}>
      {/* TOP APP BAR */}
      <div style={{ borderBottom: "1px solid var(--line)" }}>
        <header style={{ maxWidth: 1360, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 14 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0, textDecoration: "none" }}>
            <span style={{ width: 32, height: 32, borderRadius: 7, background: "var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 100 100" width="18" height="18" fill="none">
                <path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="78" cy="30" r="7" fill="var(--accent)" />
              </svg>
            </span>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Weave</span>
            <span style={{ marginLeft: 6, fontSize: 12, color: "var(--muted)", borderLeft: "1px solid var(--line)", paddingLeft: 12 }}>Réglages</span>
          </a>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {showStatus && (
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

      <div style={{ maxWidth: 1360, margin: "0 auto", padding: navVertical ? "20px 24px 96px" : "16px 20px 96px", display: "flex", gap: navVertical ? 28 : 0, flexDirection: navVertical ? "row" : "column", alignItems: "flex-start" }}>
        {/* SETTINGS NAV */}
        {navVertical ? (
          <nav aria-label="Réglages" style={{ flexShrink: 0, width: navLabels ? 216 : 52, position: "sticky", top: 16, alignSelf: "flex-start" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 500, padding: "0 10px 8px" }}>PennyLane</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {NAV.map((n) => {
                const active = n.id === section;
                const Icon = n.icon;
                const showBadge = n.id === "gouvernance" && queueCount > 0 && !isDenied;
                return (
                  <button key={n.id} type="button" title={n.label} aria-current={active ? "page" : undefined} onClick={() => setSection(n.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: "none", cursor: "pointer", borderRadius: 6, padding: navLabels ? "8px 10px" : 9, fontSize: 13, fontFamily: "var(--font-sans)", background: active ? "var(--accent-soft)" : "transparent", color: active ? "var(--accent-deep)" : "var(--ink-soft)", fontWeight: active ? 500 : 400, justifyContent: navLabels ? "flex-start" : "center", transition: "background 120ms ease" }}>
                    <span style={{ flexShrink: 0, display: "inline-flex", color: active ? "var(--accent)" : "var(--muted)" }}><Icon size={15} strokeWidth={2} /></span>
                    {navLabels && <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.label}</span>}
                    {showBadge && <Count>{queueCount}</Count>}
                  </button>
                );
              })}
            </div>
          </nav>
        ) : (
          <div className="wv-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 0 10px", position: "sticky", top: 0, zIndex: 15, background: "var(--bg)", width: "100%" }}>
            {NAV.map((n) => {
              const active = n.id === section;
              const Icon = n.icon;
              const showBadge = n.id === "gouvernance" && queueCount > 0 && !isDenied;
              return (
                <button key={n.id} type="button" onClick={() => setSection(n.id)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0, border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 30%, var(--line))" : "var(--line)"}`, background: active ? "var(--accent-soft)" : "var(--surface)", color: active ? "var(--accent-deep)" : "var(--ink-soft)", borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontFamily: "var(--font-sans)", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <span style={{ flexShrink: 0, display: "inline-flex", color: active ? "var(--accent)" : "var(--muted)" }}><Icon size={14} strokeWidth={2} /></span>
                  {n.label}
                  {showBadge && <Count>{queueCount}</Count>}
                </button>
              );
            })}
          </div>
        )}

        {/* MAIN */}
        <main style={{ flex: 1, minWidth: 0, width: navVertical ? "auto" : "100%" }}>
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)" }}>{title}</h1>
            {subtitle && <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5, maxWidth: 640 }}>{subtitle}</p>}
          </div>

          {isDenied && (
            <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: "32px 28px", textAlign: "center", maxWidth: 460, margin: "24px auto" }}>
              <Lock size={40} strokeWidth={1.6} color="var(--muted)" style={{ display: "block", margin: "0 auto" }} />
              <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>Accès réservé aux administrateurs</div>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.55 }}>La gouvernance des émergences est gérée par les administrateurs de l&apos;organisation. Demandez l&apos;accès à un admin PennyLane pour approuver des agents.</div>
              <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}><Button variant="secondary">Demander l&apos;accès</Button></div>
            </div>
          )}

          {isError && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--subtle)" }}>
              <TriangleAlert size={17} color="var(--ink)" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: "var(--ink-soft)" }}>La file de gouvernance n&apos;a pas pu être chargée.</span>
              <Button variant="secondary" size="sm" onClick={() => flash("Rechargement…")}>Réessayer</Button>
            </div>
          )}

          {/* GOUVERNANCE */}
          {showGovernance && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <section>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Shield size={16} color="var(--ink)" />
                    <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>File d&apos;approbation</h2>
                    {hasQueue && <Badge tone="pending">{queueCount} en attente</Badge>}
                  </div>
                  {hasQueue && (
                    <button type="button" onClick={toggleAll} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "var(--accent)", fontSize: 12.5, fontWeight: 500, fontFamily: "var(--font-sans)" }}>
                      {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                    </button>
                  )}
                </div>

                {isLoading && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[44, 40, 48].map((wpc, i) => (
                      <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, background: "var(--surface)" }}>
                        <div className="wv-shimmer" style={{ height: 14, width: `${wpc}%` }} />
                        <div className="wv-shimmer" style={{ height: 12, width: `${wpc + 18}%`, marginTop: 10 }} />
                      </div>
                    ))}
                  </div>
                )}

                {showGovernance && selCount > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--line))", borderRadius: 8, background: "var(--accent-soft)", marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "var(--accent-deep)", fontWeight: 500 }}>{selCount} sélectionné(s)</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <Button variant="primary" size="sm" icon={<Check size={14} />} onClick={() => resolve(visibleQueue.filter((q) => sel[q.id]).map((q) => q.id), true)}>Approuver</Button>
                      <Button variant="ghost" size="sm" onClick={() => resolve(visibleQueue.filter((q) => sel[q.id]).map((q) => q.id), false)}>Rejeter</Button>
                    </div>
                  </div>
                )}

                {isQueueEmpty && (
                  <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: "28px 20px", textAlign: "center" }}>
                    <CircleCheck size={30} strokeWidth={1.7} color="var(--lvl-team)" style={{ display: "block", margin: "0 auto" }} />
                    <div style={{ marginTop: 12, fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Rien à approuver — tout est à jour</div>
                    <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>Les nouvelles émergences apparaîtront ici avant toute mise en service.</div>
                  </div>
                )}

                {showQueueRows && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {visibleQueue.map((q) => {
                      const selected = !!sel[q.id];
                      const isResolving = !!resolving[q.id];
                      const TypeIcon = q.kind === "agent" ? Bot : Building2;
                      return (
                        <div key={q.id} style={{ overflow: "hidden", maxHeight: isResolving ? 0 : 260, opacity: isResolving ? 0 : 1, transition: "max-height 240ms ease, opacity 200ms ease" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: isNarrow ? "wrap" : "nowrap", border: `1px solid ${selected ? "color-mix(in srgb, var(--accent) 35%, var(--line))" : "var(--line)"}`, borderRadius: 8, background: selected ? "color-mix(in srgb, var(--accent-soft) 60%, var(--surface))" : "var(--surface)", padding: 14, transition: "background 120ms ease, border-color 120ms ease" }}>
                            <button type="button" aria-label="Sélectionner" onClick={() => setSel((s) => ({ ...s, [q.id]: !s[q.id] }))}
                              style={{ flexShrink: 0, marginTop: 1, width: 20, height: 20, borderRadius: 5, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", background: selected ? "var(--accent)" : "transparent", border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}` }}>
                              {selected && <Check size={12} strokeWidth={3} color="#fff" />}
                            </button>
                            <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 8, background: "var(--subtle)", color: "var(--ink-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><TypeIcon size={16} /></span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: "var(--ink)", wordBreak: "break-word" }}>{q.name}</span>
                                <Badge tone={q.level}>{q.levelLabel}</Badge>
                                <span style={{ fontSize: 11, color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 6px" }}>{q.kind === "agent" ? "agent" : "promotion org"}</span>
                              </div>
                              <div style={{ marginTop: 5, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.45 }}>{q.derived}</div>
                              <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted)" }}>demandé {q.requested}</div>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0, marginTop: isNarrow ? 4 : 0, width: isNarrow ? "100%" : "auto", justifyContent: isNarrow ? "flex-end" : "flex-start", flexWrap: "wrap" }}>
                              <Button variant="secondary" size="sm">Voir</Button>
                              <Button variant="ghost" size="sm" onClick={() => resolve([q.id], false)}>Rejeter</Button>
                              <Button variant="primary" size="sm" icon={<Check size={14} />} onClick={() => resolve([q.id], true)}>Approuver</Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Journal d'audit */}
              <section>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <History size={16} color="var(--ink)" />
                    <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Journal d&apos;audit</h2>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>lecture seule</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([["all", "Tout"], ["approve", "Approbations"], ["reject", "Rejets"]] as const).map(([k, label]) => {
                      const on = auditFilter === k;
                      return (
                        <button key={k} type="button" onClick={() => setAuditFilter(k)}
                          style={{ border: `1px solid ${on ? "color-mix(in srgb, var(--accent) 30%, var(--line))" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-deep)" : "var(--ink-soft)", borderRadius: 6, padding: "4px 9px", fontSize: 11.5, cursor: "pointer", fontFamily: "var(--font-sans)" }}>{label}</button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: "6px 14px" }}>
                  {(() => {
                    const rows = auditFilter === "all" ? audit : audit.filter((a) => auditFilter === "approve" ? (a.kind === "approve" || a.kind === "promote") : a.kind === "reject");
                    return rows.map((a, i) => (
                      <div key={a.id} style={{ display: "flex", gap: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 2 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, background: a.kind === "reject" ? "var(--muted)" : a.kind === "promote" ? "var(--lvl-org)" : "var(--lvl-team)" }} />
                          {i < rows.length - 1 && <span style={{ width: 1, flex: 1, minHeight: 22, background: "var(--line)" }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
                          <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}><span style={{ fontWeight: 500 }}>{a.actor}</span> {a.verb} <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{a.target}</span></div>
                          <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: "var(--muted)" }}><span>{a.when}</span>{a.note && <><span>·</span><span>{a.note}</span></>}</div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </section>
            </div>
          )}

          {/* ÉQUIPES & PROJETS */}
          {section === "teams" && (
            <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", overflow: "hidden" }}>
              {TEAMS.map((t) => (
                <div key={t.name} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Équipe {t.name}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{t.members.length} {t.members.length > 1 ? "membres" : "membre"}</span>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                      {t.members.slice(0, 4).map((m, i) => <span key={m} style={{ marginLeft: i === 0 ? 0 : -6 }}><Avatar name={m} size="sm" /></span>)}
                    </div>
                  </div>
                  {t.projects.length > 0 && (
                    <div style={{ padding: "0 14px 12px 34px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {t.projects.map((p) => (
                        <div key={p.slug} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--line)", borderRadius: 6, padding: "8px 11px", background: "var(--bg)" }}>
                          <FolderOpen size={13} color="var(--lvl-project)" style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: "var(--ink)" }}>{p.name}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{p.slug}</span>
                          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>{p.domain}</span>
                        </div>
                      ))}
                      <button type="button" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, border: "1px dashed var(--line)", background: "transparent", borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "var(--muted)", fontSize: 12, fontFamily: "var(--font-sans)" }}><Plus size={13} />Ajouter un projet</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* PÉRIMÈTRES & ACCÈS */}
          {section === "access" && (
            <div>
              {accessMatrix ? (
                <>
                  <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(4, 1fr)", alignItems: "center", background: "var(--subtle)", borderBottom: "1px solid var(--line)" }}>
                      <div style={{ padding: "11px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 500 }}>Équipe peut lire →</div>
                      {LEVELS.map((l) => <div key={l.key} style={{ padding: "11px 8px", display: "flex", justifyContent: "center" }}><Badge tone={l.tone}>{l.label}</Badge></div>)}
                    </div>
                    {TEAMS.map((t, ri) => (
                      <div key={t.name} style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(4, 1fr)", alignItems: "center", borderTop: ri === 0 ? "none" : "1px solid var(--line-soft)" }}>
                        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: t.dot, flexShrink: 0 }} /><span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{t.name}</span></div>
                        {LEVELS.map((l) => <div key={l.key} style={{ padding: "10px 8px", display: "flex", justifyContent: "center" }}><Toggle on={!!access[t.name]?.[l.key]} aria={`${t.name} lit ${l.label}`} onClick={() => toggleAccess(t.name, l.key)} /></div>)}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}><Info size={13} />La mémoire personnelle reste privée par défaut — une équipe ne lit que ce que vous activez ici.</div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {TEAMS.map((t) => (
                    <div key={t.name} style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: t.dot, flexShrink: 0 }} /><span style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600 }}>{t.name}</span></div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {LEVELS.map((l) => (
                          <div key={l.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <Badge tone={l.tone}>{l.label}</Badge>
                            <Toggle on={!!access[t.name]?.[l.key]} aria={`${t.name} lit ${l.label}`} onClick={() => toggleAccess(t.name, l.key)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Placeholder sections */}
          {(section === "org" || section === "members" || section === "sources" || section === "billing") && (
            <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: "28px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Cette section n&apos;est pas incluse dans la démo.</div>
          )}
        </main>
      </div>

      {/* STICKY SAVE */}
      {accessDirty && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 60, display: "flex", alignItems: "center", gap: 14, padding: "10px 12px 10px 16px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "0 8px 28px rgba(15,15,15,0.14)", maxWidth: "calc(100% - 32px)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink-soft)" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--lvl-org)" }} />Modifié, non enregistré</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setAccess(JSON.parse(JSON.stringify(savedAccess)))}>Annuler</Button>
            <Button variant="primary" size="sm" onClick={() => { setSavedAccess(JSON.parse(JSON.stringify(access))); flash("Périmètres d'accès enregistrés"); }}>Enregistrer</Button>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 61, display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", borderRadius: 8, background: "var(--ink)", color: "#fff", fontSize: 13, boxShadow: "0 4px 14px rgba(15,15,15,0.16)", maxWidth: "calc(100% - 32px)" }}>
          <Check size={15} strokeWidth={2.4} color="var(--accent)" style={{ flexShrink: 0 }} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function Count({ children }: { children: ReactNode }) {
  return <span style={{ flexShrink: 0, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "var(--lvl-org)", color: "#fff", fontSize: 10, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{children}</span>;
}

function Toggle({ on, aria, onClick }: { on: boolean; aria: string; onClick: () => void }) {
  const toggle: CSSProperties = { width: 38, height: 22, borderRadius: 999, border: "none", cursor: "pointer", padding: 2, background: on ? "var(--accent)" : "var(--line)", display: "inline-flex", alignItems: "center", justifyContent: on ? "flex-end" : "flex-start", transition: "background 150ms ease" };
  const knob: CSSProperties = { width: 18, height: 18, borderRadius: "50%", background: "#fff", display: "block", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" };
  return <button type="button" aria-pressed={on} aria-label={aria} onClick={onClick} style={toggle}><span style={knob} /></button>;
}
