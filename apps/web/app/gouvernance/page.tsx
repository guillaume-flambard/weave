"use client";

import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import {
  Building2, Folder, FolderOpen, Users, Shield, LayoutGrid, Plug, CreditCard,
  Bot, Check, Lock, TriangleAlert, CircleCheck, History, Plus, Info,
} from "lucide-react";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";
import { WeaveShell } from "../../components/layout/weave-shell";
import { useWeaveProject } from "../../hooks/use-weave-project";
import { useViewport } from "../../hooks/use-viewport";

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

function useViewportWidth() {
  const { width } = useViewport();
  return width;
}

export default function GouvernancePage() {
  const w = useViewportWidth();
  const weave = useWeaveProject();
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

  useEffect(() => {
    const fromApi: QueueItem[] = weave.agents
      .filter((a) => a.status === "pending")
      .map((a) => ({
        id: a.id,
        name: a.name,
        kind: "agent" as const,
        level: "team" as Level,
        levelLabel: "Team",
        derived: a.derived_from,
        requested: "récemment",
      }));
    if (fromApi.length > 0) setQueue(fromApi);
  }, [weave.agents]);

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
    resolveT.current = setTimeout(async () => {
      if (approved) {
        for (const item of acted) {
          if (item.kind === "agent") {
            try {
              await weave.approveAgent(item.name);
            } catch {
              flash("Échec de l'approbation API");
              setResolving((r) => { const n = { ...r }; ids.forEach((id) => delete n[id]); return n; });
              return;
            }
          }
        }
      }
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
    <WeaveShell width={w} connected llm="Ollama (local)" subtitle="Réglages">
      <div className="max-w-[1360px] mx-auto flex items-start" style={{ padding: navVertical ? "20px 24px 96px" : "16px 20px 96px", gap: navVertical ? 28 : 0, flexDirection: navVertical ? "row" : "column" }}>
        {/* SETTINGS NAV */}
        {navVertical ? (
          <nav aria-label="Réglages" className="shrink-0 sticky top-4 self-start" style={{ width: navLabels ? 216 : 52 }}>
            <div className="text-[11px] uppercase tracking-wider text-muted font-medium px-[10px] pb-2">PennyLane</div>
            <div className="flex flex-col gap-0.5">
              {NAV.map((n) => {
                const active = n.id === section;
                const Icon = n.icon;
                const showBadge = n.id === "gouvernance" && queueCount > 0 && !isDenied;
                return (
                  <button key={n.id} type="button" title={n.label} aria-current={active ? "page" : undefined} onClick={() => setSection(n.id)}
                    className="flex items-center gap-2.5 w-full border-none cursor-pointer rounded-md text-[13px] font-sans transition-colors duration-120" style={{ padding: navLabels ? "8px 10px" : 9, background: active ? "var(--accent-soft)" : "transparent", color: active ? "var(--accent-deep)" : "var(--ink-soft)", fontWeight: active ? 500 : 400, justifyContent: navLabels ? "flex-start" : "center" }}>
                    <span className="shrink-0 inline-flex" style={{ color: active ? "var(--accent)" : "var(--muted)" }}><Icon size={15} strokeWidth={2} /></span>
                    {navLabels && <span className="flex-1 text-left truncate">{n.label}</span>}
                    {showBadge && <Count>{queueCount}</Count>}
                  </button>
                );
              })}
            </div>
          </nav>
        ) : (
          <div className="wv-scroll flex gap-2 overflow-x-auto pt-0.5 pb-[10px] sticky top-0 z-[15] bg-bg w-full">
            {NAV.map((n) => {
              const active = n.id === section;
              const Icon = n.icon;
              const showBadge = n.id === "gouvernance" && queueCount > 0 && !isDenied;
              return (
                <button key={n.id} type="button" onClick={() => setSection(n.id)}
                  className="inline-flex items-center gap-[7px] shrink-0 rounded-full p-[6px_12px] text-[12.5px] font-sans cursor-pointer whitespace-nowrap" style={{ border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 30%, var(--line))" : "var(--line)"}`, background: active ? "var(--accent-soft)" : "var(--surface)", color: active ? "var(--accent-deep)" : "var(--ink-soft)" }}>
                  <span className="shrink-0 inline-flex" style={{ color: active ? "var(--accent)" : "var(--muted)" }}><Icon size={14} strokeWidth={2} /></span>
                  {n.label}
                  {showBadge && <Count>{queueCount}</Count>}
                </button>
              );
            })}
          </div>
        )}

        {/* MAIN */}
        <main className="flex-1 min-w-0" style={{ width: navVertical ? "auto" : "100%" }}>
          <div className="mb-[18px]">
            <h1 className="m-0 text-xl font-semibold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-[6px] text-[13.5px] text-ink-soft leading-[1.5] max-w-[640px]">{subtitle}</p>}
          </div>

          {isDenied && (
            <div className="border border-line rounded-lg bg-surface p-[32px_28px] text-center max-w-[460px] my-6 mx-auto">
              <Lock size={40} strokeWidth={1.6} color="var(--muted)" className="block mx-auto" />
              <div className="mt-3.5 text-[16px] font-semibold text-ink">Accès réservé aux administrateurs</div>
              <div className="mt-1.5 text-sm text-ink-soft leading-[1.55]">La gouvernance des émergences est gérée par les administrateurs de l&apos;organisation. Demandez l&apos;accès à un admin PennyLane pour approuver des agents.</div>
              <div className="mt-[18px] flex justify-center"><Button variant="secondary">Demander l&apos;accès</Button></div>
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-3 p-3.5 px-4 border border-line rounded-lg bg-subtle">
              <TriangleAlert size={17} color="var(--ink)" className="shrink-0" />
              <span className="flex-1 text-sm text-ink-soft">La file de gouvernance n&apos;a pas pu être chargée.</span>
              <Button variant="secondary" size="sm" onClick={() => flash("Rechargement…")}>Réessayer</Button>
            </div>
          )}

          {/* GOUVERNANCE */}
          {showGovernance && (
            <div className="flex flex-col gap-6">
              <section>
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-[9px]">
                    <Shield size={16} color="var(--ink)" />
                    <h2 className="m-0 text-sm font-semibold text-ink">File d&apos;approbation</h2>
                    {hasQueue && <Badge tone="pending">{queueCount} en attente</Badge>}
                  </div>
                  {hasQueue && (
                    <button type="button" onClick={toggleAll} className="border-none bg-transparent p-0 cursor-pointer text-accent text-[12.5px] font-medium font-sans">
                      {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                    </button>
                  )}
                </div>

                {isLoading && (
                  <div className="flex flex-col gap-2.5">
                    {[44, 40, 48].map((wpc, i) => (
                      <div key={i} className="border border-line rounded-lg p-4 bg-surface">
                        <div className="wv-shimmer h-3.5" style={{ width: `${wpc}%` }} />
                        <div className="wv-shimmer h-3 mt-[10px]" style={{ width: `${wpc + 18}%` }} />
                      </div>
                    ))}
                  </div>
                )}

                {showGovernance && selCount > 0 && (
                  <div className="flex items-center gap-2.5 p-[10px_14px] rounded-lg bg-accent-soft mb-[10px] flex-wrap" style={{ border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--line))" }}>
                    <span className="text-sm text-accent-deep font-medium">{selCount} sélectionné(s)</span>
                    <div className="ml-auto flex gap-2">
                      <Button variant="primary" size="sm" icon={<Check size={14} />} onClick={() => resolve(visibleQueue.filter((q) => sel[q.id]).map((q) => q.id), true)}>Approuver</Button>
                      <Button variant="ghost" size="sm" onClick={() => resolve(visibleQueue.filter((q) => sel[q.id]).map((q) => q.id), false)}>Rejeter</Button>
                    </div>
                  </div>
                )}

                {isQueueEmpty && (
                  <div className="border border-line rounded-lg bg-surface p-7 px-5 text-center">
                    <CircleCheck size={30} strokeWidth={1.7} color="var(--lvl-team)" className="block mx-auto" />
                    <div className="mt-3 text-sm font-medium text-ink">Rien à approuver — tout est à jour</div>
                    <div className="mt-1 text-[12.5px] text-muted">Les nouvelles émergences apparaîtront ici avant toute mise en service.</div>
                  </div>
                )}

                {showQueueRows && (
                  <div className="flex flex-col gap-2.5">
                    {visibleQueue.map((q) => {
                      const selected = !!sel[q.id];
                      const isResolving = !!resolving[q.id];
                      const TypeIcon = q.kind === "agent" ? Bot : Building2;
                      return (
                        <div key={q.id} className="overflow-hidden" style={{ maxHeight: isResolving ? 0 : 260, opacity: isResolving ? 0 : 1, transition: "max-height 240ms ease, opacity 200ms ease" }}>
                          <div className="flex items-start gap-3 rounded-lg p-3.5" style={{ flexWrap: isNarrow ? "wrap" : "nowrap", border: `1px solid ${selected ? "color-mix(in srgb, var(--accent) 35%, var(--line))" : "var(--line)"}`, background: selected ? "color-mix(in srgb, var(--accent-soft) 60%, var(--surface))" : "var(--surface)", transition: "background 120ms ease, border-color 120ms ease" }}>
                            <button type="button" aria-label="Sélectionner" onClick={() => setSel((s) => ({ ...s, [q.id]: !s[q.id] }))}
                              className="shrink-0 mt-[1px] w-5 h-5 rounded-[5px] cursor-pointer inline-flex items-center justify-center" style={{ background: selected ? "var(--accent)" : "transparent", border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}` }}>
                              {selected && <Check size={12} strokeWidth={3} color="#fff" />}
                            </button>
                            <span className="shrink-0 w-[34px] h-[34px] rounded-lg bg-subtle text-ink-soft inline-flex items-center justify-center"><TypeIcon size={16} /></span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-medium text-ink break-words">{q.name}</span>
                                <Badge tone={q.level}>{q.levelLabel}</Badge>
                                <span className="text-[11px] text-muted border border-line rounded-sm p-[1px_6px]">{q.kind === "agent" ? "agent" : "promotion org"}</span>
                              </div>
                              <div className="mt-[5px] text-[12.5px] text-ink-soft leading-[1.45]">{q.derived}</div>
                              <div className="mt-1 text-[11px] text-muted">demandé {q.requested}</div>
                            </div>
                            <div className="flex gap-1.5 shrink-0 flex-wrap" style={{ marginTop: isNarrow ? 4 : 0, width: isNarrow ? "100%" : "auto", justifyContent: isNarrow ? "flex-end" : "flex-start" }}>
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
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-[9px]">
                    <History size={16} color="var(--ink)" />
                    <h2 className="m-0 text-sm font-semibold text-ink">Journal d&apos;audit</h2>
                    <span className="text-[11px] text-muted">lecture seule</span>
                  </div>
                  <div className="flex gap-1.5">
                    {([["all", "Tout"], ["approve", "Approbations"], ["reject", "Rejets"]] as const).map(([k, label]) => {
                      const on = auditFilter === k;
                      return (
                        <button key={k} type="button" onClick={() => setAuditFilter(k)}
                          className="rounded-md p-[4px_9px] text-[11.5px] cursor-pointer font-sans" style={{ border: `1px solid ${on ? "color-mix(in srgb, var(--accent) 30%, var(--line))" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent-deep)" : "var(--ink-soft)" }}>{label}</button>
                      );
                    })}
                  </div>
                </div>
                <div className="border border-line rounded-lg bg-surface p-[6px_14px]">
                  {(() => {
                    const rows = auditFilter === "all" ? audit : audit.filter((a) => auditFilter === "approve" ? (a.kind === "approve" || a.kind === "promote") : a.kind === "reject");
                    return rows.map((a, i) => (
                      <div key={a.id} className="flex gap-3">
                        <div className="flex flex-col items-center shrink-0 pt-0.5">
                          <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: a.kind === "reject" ? "var(--muted)" : a.kind === "promote" ? "var(--lvl-org)" : "var(--lvl-team)" }} />
                          {i < rows.length - 1 && <span className="w-px flex-1 min-h-[22px] bg-line" />}
                        </div>
                        <div className="flex-1 min-w-0 pb-3.5">
                          <div className="text-sm text-ink leading-[1.5]"><span className="font-medium">{a.actor}</span> {a.verb} <span className="font-mono text-ink-soft">{a.target}</span></div>
                          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[11px] text-muted"><span>{a.when}</span>{a.note && <><span>·</span><span>{a.note}</span></>}</div>
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
            <div className="border border-line rounded-lg bg-surface overflow-hidden">
              {TEAMS.map((t) => (
                <div key={t.name} className="border-b border-line-soft">
                  <div className="flex items-center gap-2.5 p-3 px-[14px]">
                    <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: t.dot }} />
                    <span className="text-sm font-semibold text-ink">Équipe {t.name}</span>
                    <span className="text-[11px] text-muted">{t.members.length} {t.members.length > 1 ? "membres" : "membre"}</span>
                    <div className="ml-auto flex items-center">
                      {t.members.slice(0, 4).map((m, i) => <span key={m} style={{ marginLeft: i === 0 ? 0 : -6 }}><Avatar name={m} size="sm" /></span>)}
                    </div>
                  </div>
                  {t.projects.length > 0 && (
                    <div className="pl-[34px] pr-[14px] pb-3 flex flex-col gap-1.5">
                      {t.projects.map((p) => (
                        <div key={p.slug} className="flex items-center gap-2.5 border border-line rounded-md p-[8px_11px] bg-bg">
                          <FolderOpen size={13} color="var(--lvl-project)" className="shrink-0" />
                          <span className="text-[13px] text-ink">{p.name}</span>
                          <span className="font-mono text-[11px] text-muted">{p.slug}</span>
                          <span className="ml-auto text-[11px] text-muted">{p.domain}</span>
                        </div>
                      ))}
                      <button type="button" className="self-start inline-flex items-center gap-1.5 border border-dashed border-line bg-transparent rounded-md p-[6px_10px] cursor-pointer text-muted text-[12px] font-sans"><Plus size={13} />Ajouter un projet</button>
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
                  <div className="border border-line rounded-lg bg-surface overflow-hidden">
                    <div className="grid items-center bg-subtle border-b border-line" style={{ gridTemplateColumns: "1.4fr repeat(4, 1fr)" }}>
                      <div className="p-[11px_14px] text-[11px] uppercase tracking-wider text-muted font-medium">Équipe peut lire →</div>
                      {LEVELS.map((l) => <div key={l.key} className="p-[11px_8px] flex justify-center"><Badge tone={l.tone}>{l.label}</Badge></div>)}
                    </div>
                    {TEAMS.map((t, ri) => (
                      <div key={t.name} className="grid items-center" style={{ gridTemplateColumns: "1.4fr repeat(4, 1fr)", borderTop: ri === 0 ? "none" : "1px solid var(--line-soft)" }}>
                        <div className="p-3 px-[14px] flex items-center gap-2"><span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: t.dot }} /><span className="text-[13px] text-ink font-medium">{t.name}</span></div>
                        {LEVELS.map((l) => <div key={l.key} className="p-[10px_8px] flex justify-center"><Toggle on={!!access[t.name]?.[l.key]} aria={`${t.name} lit ${l.label}`} onClick={() => toggleAccess(t.name, l.key)} /></div>)}
                      </div>
                    ))}
                  </div>
                  <div className="mt-[10px] text-[11.5px] text-muted flex items-center gap-1.5"><Info size={13} />La mémoire personnelle reste privée par défaut — une équipe ne lit que ce que vous activez ici.</div>
                </>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {TEAMS.map((t) => (
                    <div key={t.name} className="border border-line rounded-lg bg-surface p-3.5">
                      <div className="flex items-center gap-2 mb-[10px]"><span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: t.dot }} /><span className="text-sm text-ink font-semibold">{t.name}</span></div>
                      <div className="flex flex-col gap-2">
                        {LEVELS.map((l) => (
                          <div key={l.key} className="flex items-center justify-between gap-2.5">
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
            <div className="border border-line rounded-lg bg-surface p-7 px-5 text-center text-muted text-[13px]">Cette section n&apos;est pas incluse dans la démo.</div>
          )}
        </main>
      </div>

      {/* STICKY SAVE */}
      {accessDirty && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-60 flex items-center gap-3.5 p-[10px_12px_10px_16px] rounded-xl bg-surface border border-line max-w-[calc(100%-32px)]" style={{ boxShadow: "0 8px 28px rgba(15,15,15,0.14)" }}>
          <span className="inline-flex items-center gap-[7px] text-[12.5px] text-ink-soft"><span className="w-[7px] h-[7px] rounded-full bg-lvl-org" />Modifié, non enregistré</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAccess(JSON.parse(JSON.stringify(savedAccess)))}>Annuler</Button>
            <Button variant="primary" size="sm" onClick={() => { setSavedAccess(JSON.parse(JSON.stringify(access))); flash("Périmètres d'accès enregistrés"); }}>Enregistrer</Button>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[61] flex items-center gap-[9px] p-[10px_14px] rounded-lg bg-ink text-white text-[13px] max-w-[calc(100%-32px)]" style={{ boxShadow: "0 4px 14px rgba(15,15,15,0.16)" }}>
          <Check size={15} strokeWidth={2.4} color="var(--accent)" className="shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </WeaveShell>
  );
}

function Count({ children }: { children: ReactNode }) {
  return <span className="shrink-0 min-w-[18px] h-[18px] px-[5px] rounded-full bg-lvl-org text-white text-[10px] font-semibold inline-flex items-center justify-center">{children}</span>;
}

function Toggle({ on, aria, onClick }: { on: boolean; aria: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={aria}
      onClick={onClick}
      className="w-[38px] h-[22px] rounded-full border-none cursor-pointer p-0.5 inline-flex items-center transition-colors duration-150"
      style={{ background: on ? "var(--accent)" : "var(--line)", justifyContent: on ? "flex-end" : "flex-start" }}
    >
      <span
        className="w-[18px] h-[18px] rounded-full bg-white block"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }}
      />
    </button>
  );
}
