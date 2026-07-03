"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  Sparkles, Building2, Zap, FileText, Brain, Route, Users, TrendingUp, Shield,
  Pin, Flag, Copy, Check,
} from "lucide-react";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";
import { Panel, ProgressBar } from "../../components/ui/workspace-ui";
import { WeaveShell } from "../../components/layout/weave-shell";
import { useWeaveProject } from "../../hooks/use-weave-project";
import { useViewport } from "../../hooks/use-viewport";

// Compétence — skill detail, ported from Claude Design (Compétence.dc.html).
// Trigger, body (copy), sources, provenance/promotion stepper, referents,
// usage, governance. State via ?state=promue|projet|chargement|introuvable.

type View = "promue" | "projet" | "chargement" | "introuvable";
type Level = "personal" | "team" | "project" | "organization";

const SKILL = {
  name: "bancaire/relancer-synchro",
  title: "Relancer la synchronisation bancaire d'un client",
  created: "12 mars 2026",
  evolved: "il y a 5 h",
  team: "Data · Synchro bancaire",
  triggers: ["relancer la synchro bancaire", "erreur OAuth 401 sur Bridge", "rejouer un webhook bancaire manqué"],
};
const BODY = `## Relancer la synchronisation bancaire

Contexte — la connexion Bridge renvoie une erreur OAuth 401 : le token d'accès a expiré et la synchro ne repart pas seule.

### Étapes
1. Rafraîchir le token OAuth du connecteur Bridge du client.
2. Rejouer le webhook manqué (sync.completed).
3. Vérifier le taux de reprise dans le tableau de bord Synchro.
4. Confirmer que les écritures FEC sont régénérées.

### Vérifications
- Aucune double écriture côté Stripe.
- Le client voit ses transactions à jour sous 5 minutes.
- Journaliser la reprise dans la mémoire projet.`;
const SOURCES: { level: Level; levelLabel: string; workstream: string; author: string; time: string; snippet: string }[] = [
  { level: "project", levelLabel: "Project", workstream: "Synchro bancaire", author: "nicolas", time: "il y a 3 j", snippet: "erreur OAuth 401 sur Bridge, la synchro ne repart pas" },
  { level: "project", levelLabel: "Project", workstream: "Synchro bancaire", author: "arthur", time: "il y a 3 j", snippet: "rafraîchis le token puis rejoue le webhook manqué" },
  { level: "project", levelLabel: "Project", workstream: "Checkout", author: "camille", time: "il y a 2 j", snippet: "même souci côté Checkout après expiration du token" },
  { level: "team", levelLabel: "Team", workstream: "Synchro bancaire", author: "sophie", time: "hier", snippet: "j'ai documenté la procédure de reprise complète" },
];
const REFERENTS = ["nicolas", "arthur", "camille"];
const CONSUMERS = [{ name: "assistant", count: 14 }, { name: "specialiste-data-finance-ops", count: 11 }, { name: "sarah", count: 6 }];
const SPARK = "M0,27 L8,25 L15,26 L23,21 L31,22 L38,18 L46,17 L54,14 L62,15 L69,11 L77,10 L85,7 L92,6 L100,3";

function useViewportWidth() {
  const { width } = useViewport();
  return width;
}

function CompetencePageInner() {
  const w = useViewportWidth();
  const weave = useWeaveProject();
  const params = useSearchParams();
  const skillName = params.get("name");
  const skill = weave.skills.find((s) => s.name === skillName) ?? weave.skills[0] ?? null;
  const [view, setView] = useState<View>("promue");
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("state") as View | null;
    if (s && ["promue", "projet", "chargement", "introuvable"].includes(s)) setView(s);
  }, []);
  useEffect(() => {
    const on = () => setCollapsed((window.scrollY || 0) > 130);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => () => clearTimeout(copyT.current), []);

  const isNarrow = w < 768;
  const isProject = skill ? skill.memory_level === "project" : view === "projet";
  const level: Level = skill ? (skill.memory_level as Level) : isProject ? "project" : "organization";
  const levelLabel = level === "organization" ? "Organization" : level === "project" ? "Project" : level === "team" ? "Team" : "Personal";
  const bodyText = skill?.body ?? BODY;
  const displayName = skill?.name ?? SKILL.name;
  const triggers = skill ? [skill.trigger] : SKILL.triggers;
  const referents = skill?.referents ?? REFERENTS;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const onCopy = () => { try { navigator.clipboard?.writeText(bodyText); } catch { /* noop */ } setCopied(true); clearTimeout(copyT.current); copyT.current = setTimeout(() => setCopied(false), 1600); };

  if (!weave.loading && !skill && view !== "chargement") {
    return (
      <Shell w={w}>
        <div className="max-w-[1360px] mx-auto p-6 text-center">
          <p className="text-ink-soft">Aucune compétence — simulez l&apos;activité sur l&apos;<a href="/">espace de travail</a>.</p>
        </div>
      </Shell>
    );
  }

  const collapseBody = isNarrow && !expanded;

  if (view === "introuvable") {
    return (
      <Shell w={w}>
        <div className="max-w-[1360px] mx-auto p-6 flex justify-center">
          <div className="max-w-[440px] w-full text-center border border-line rounded-lg bg-surface p-[32px_28px] mt-8 box-border">
            <svg viewBox="0 0 100 100" width="44" height="44" fill="none" className="block mx-auto opacity-55"><path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /><circle cx="78" cy="30" r="6" fill="var(--accent)" /></svg>
            <div className="mt-4 text-[16px] font-semibold">Compétence introuvable</div>
            <div className="mt-1.5 text-sm text-ink-soft leading-relaxed">Cette compétence n&apos;existe pas ou a été fusionnée avec une autre. Elle n&apos;apparaît plus dans la mémoire de l&apos;organisation.</div>
            <div className="mt-[18px] flex justify-center"><a href="/espace-de-travail" className="no-underline"><Button variant="secondary">← Retour aux compétences</Button></a></div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell w={w}>
      <div className="max-w-[1360px] mx-auto px-6 pb-16">
        <nav aria-label="Fil d'ariane" className="pt-4 flex items-center gap-[7px] text-[12.5px] text-muted">
          <a href="/espace-de-travail" className="text-muted no-underline">Compétences</a><span>/</span>
          <span className="font-mono text-ink-soft">{displayName}</span>
        </nav>

        {/* sticky header */}
        <div className="sticky top-0 z-20 bg-bg mb-4" style={{ padding: collapsed ? "12px 0" : "18px 0 20px", borderBottom: collapsed ? "1px solid var(--line)" : "1px solid transparent", transition: "padding 150ms ease" }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                {isProject ? <Sparkles size={17} className="shrink-0 text-accent" /> : <Building2 size={17} className="shrink-0 text-lvl-org" />}
                <span className="font-mono text-lg font-semibold text-ink break-words">{displayName}</span>
                <Badge tone={level}>{levelLabel}</Badge>
              </div>
              {!collapsed && (
                <>
                  <div className="mt-2 text-base text-ink font-medium">{SKILL.title}</div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted">
                    <span>créée le {SKILL.created}</span><span>·</span><span>dernière évolution {SKILL.evolved}</span><span>·</span><span>{SKILL.team}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {!collapsed && !isNarrow && <Button variant="secondary" size="md">Voir la provenance</Button>}
              <Button variant="primary" size="md" icon={<Sparkles size={15} />}>Utiliser dans une réponse</Button>
            </div>
          </div>
        </div>

        {view === "chargement" ? (
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
            <div className="flex flex-col gap-4">
              {[40, 180, 128].map((h, i) => <div key={i} className="border border-line rounded-lg p-4 bg-surface"><div className="wv-shimmer h-3.5 w-[34%]" /><div className="wv-shimmer" style={{ height: h, marginTop: 14 }} /></div>)}
            </div>
            <div className="flex flex-col gap-4">
              {[120, 60].map((h, i) => <div key={i} className="border border-line rounded-lg p-4 bg-surface"><div className="wv-shimmer" style={{ height: h }} /></div>)}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
            {/* LEFT */}
            <div className="flex flex-col gap-4 min-w-0">
              <Panel title="Déclencheur" icon={<Zap size={15} strokeWidth={2} />} subtitle="Les formulations qui routent une question vers cette compétence.">
                <div className="flex flex-wrap gap-2">
                  {SKILL.triggers.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 border border-line bg-subtle rounded-full p-[5px_12px] text-[12.5px] text-ink-soft">
                      <span className="w-[5px] h-[5px] rounded-full bg-accent" />« {t} »
                    </span>
                  ))}
                </div>
              </Panel>

              <Panel title="Contenu de la compétence" icon={<FileText size={15} strokeWidth={2} />} actions={<Button variant="ghost" size="sm" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={onCopy}>{copied ? "Copié" : "Copier"}</Button>}>
                <pre className="wv-scroll m-0 whitespace-pre-wrap break-words rounded-md border border-line bg-subtle p-3.5 text-[12.5px] leading-relaxed text-ink-soft font-mono" style={{ maxHeight: collapseBody ? 220 : "none", overflowY: collapseBody ? "hidden" : "visible" }}>{bodyText}</pre>
                {isNarrow && <div className="mt-2.5"><button type="button" onClick={() => setExpanded((e) => !e)} className="border-0 bg-transparent p-0 cursor-pointer text-accent font-sans text-[12.5px] font-medium">{expanded ? "Afficher moins" : "Afficher tout le contenu"}</button></div>}
              </Panel>

              <Panel title="Sources" icon={<Brain size={15} strokeWidth={2} />} count={SOURCES.length} subtitle="Les faits et messages dont cette compétence a émergé.">
                <div className="flex flex-col gap-2">
                  {SOURCES.map((s, i) => (
                    <div key={i} className="border border-line rounded-lg p-[11px_12px] bg-surface">
                      <div className="flex items-center gap-[7px] flex-wrap">
                        <Badge tone={s.level}>{s.levelLabel}</Badge>
                        <span className="text-[11px] text-muted">{s.workstream} · {s.author} · {s.time}</span>
                      </div>
                      <div className="mt-[5px] text-sm text-ink-soft leading-relaxed">« {s.snippet} »</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* RIGHT RAIL */}
            <div className="flex flex-col gap-4 min-w-0">
              <Panel title="Provenance & promotion" icon={<Route size={15} strokeWidth={2} />}>
                <div className="flex flex-col">
                  <Step dot="var(--lvl-project)" line label="Née dans le projet" detail="Synchro bancaire" />
                  <Step dot="var(--lvl-project)" line label="Observée aussi dans" detail="Checkout" />
                  {isProject ? (
                    <Step dot="var(--surface)" ring="var(--line)" label="Pas encore promue" detail="observée dans 1 des 2 équipes requises" muted last progress={{ occ: 1, thr: 2 }} />
                  ) : (
                    <Step dot="var(--lvl-org)" ring="color-mix(in srgb, var(--lvl-org) 30%, transparent)" promoted pulse={!reduce} label="Promue au niveau organisation" detail="partagée entre 2 équipes · appliquée dans 2 projets" last />
                  )}
                </div>
              </Panel>

              <Panel title="Référents" icon={<Users size={15} strokeWidth={2} />} subtitle="Les personnes qui ancrent cette compétence.">
                <div className="flex flex-wrap gap-2">
                  {REFERENTS.map((r) => (
                    <span key={r} className="inline-flex items-center gap-[7px] border border-line rounded-full p-[3px_10px_3px_3px] bg-surface">
                      <Avatar name={r} size="sm" /><span className="text-[12.5px] text-ink-soft">{r}</span>
                    </span>
                  ))}
                </div>
              </Panel>

              <Panel title="Utilisation" icon={<TrendingUp size={15} strokeWidth={2} />}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[26px] font-semibold text-ink leading-none tabular-nums">34<span className="text-sm text-muted font-normal">×</span></div>
                    <div className="mt-1.5 text-xs text-accent-deep inline-flex items-center gap-[3px]"><TrendingUp size={12} strokeWidth={2.4} />12 cette semaine</div>
                  </div>
                  <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-[120px] h-10 shrink-0 overflow-visible"><path d={SPARK} fill="none" stroke="#2383e2" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="mt-3.5 border-t border-line pt-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">Principaux consommateurs</div>
                  <div className="flex flex-col gap-[7px]">
                    {CONSUMERS.map((c) => (
                      <div key={c.name} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-ink-soft truncate">{c.name}</span>
                        <span className="text-xs text-muted tabular-nums shrink-0">{c.count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel title="Gouvernance" icon={<Shield size={15} strokeWidth={2} />}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Statut</span>
                  <Badge tone="active">{isProject ? "active" : "promue"}</Badge>
                </div>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button variant="secondary" size="sm" icon={<Pin size={14} />}>Épingler</Button>
                  <Button variant="ghost" size="sm" icon={<Flag size={14} />}>Signaler / corriger</Button>
                </div>
              </Panel>
            </div>
          </div>
        )}
      </div>

      {copied && (
        <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-60 flex items-center gap-2 rounded-lg bg-ink text-white text-sm" style={{ padding: "9px 14px", boxShadow: "0 4px 14px rgba(15,15,15,0.16)" }}><Check size={15} />Contenu copié</div>
      )}
    </Shell>
  );
}

export default function CompetencePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <CompetencePageInner />
    </Suspense>
  );
}

function Shell({ w, children }: { w: number; children: React.ReactNode }) {
  return (
    <WeaveShell width={w} connected llm="Ollama (local)">
      {children}
    </WeaveShell>
  );
}

function Step({ dot, ring, line = false, last = false, label, detail, muted = false, promoted = false, pulse = false, progress }:
  { dot: string; ring?: string; line?: boolean; last?: boolean; label: string; detail: string; muted?: boolean; promoted?: boolean; pulse?: boolean; progress?: { occ: number; thr: number } }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <span className="w-3 h-3 rounded-full shrink-0 box-border" style={{ background: dot, border: ring ? `3px solid ${ring}` : `2px solid ${dot}` }} />
        {line && <span className="w-0.5 flex-1 min-h-[26px] bg-line" />}
      </div>
      <div className="min-w-0 flex-1" style={{ paddingBottom: last ? 0 : 18 }}>
        {promoted ? (
          <div className={pulse ? "wv-pulse" : undefined} style={{ border: "1px solid color-mix(in srgb, var(--lvl-org) 40%, transparent)", background: "var(--lvl-org-bg)", borderRadius: 8, padding: "9px 11px" }}>
            <div className="text-[12.5px] font-semibold text-lvl-org">{label}</div>
            <div className="mt-[3px] text-xs text-ink-soft">{detail}</div>
          </div>
        ) : (
          <>
            <div className="text-[12.5px] font-medium" style={{ color: muted ? "var(--muted)" : "var(--ink)" }}>{label}</div>
            <div className="mt-0.5 text-xs text-muted">{detail}</div>
            {progress && <div className="mt-2 max-w-[200px]"><ProgressBar occurrences={progress.occ} threshold={progress.thr} /></div>}
          </>
        )}
      </div>
    </div>
  );
}
