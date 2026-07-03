"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { Search, MessageSquare, Bot, Sparkles, Shield, TriangleAlert, ChevronDown } from "lucide-react";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";
import { Select, AnswerBlock } from "../../components/ui/workspace-ui";
import { WeaveShell } from "../../components/layout/weave-shell";
import { useWeaveProject } from "../../hooks/use-weave-project";
import { useViewport } from "../../hooks/use-viewport";
import type { Answer } from "../../lib/types";

// Interroger la mémoire — ported from Claude Design (Interroger la mémoire.dc.html).
// Answer with inline citation markers linked to provenance layers (perso→org).

type Phase = "answered" | "idle" | "nomemory" | "loading" | "error";
type Level = "personal" | "team" | "project" | "organization";

const SCOPE_OPTIONS = [
  { value: "org", label: "Toute l'organisation" }, { value: "data", label: "Équipe Data" },
  { value: "produit", label: "Équipe Produit" }, { value: "growth", label: "Équipe Growth" }, { value: "support", label: "Équipe Support" },
];
const SUGGESTIONS = [
  "Comment relancer la synchro bancaire d'un client ?",
  "Quel format pour l'export FEC des clients comptables ?",
  "Comment optimiser le funnel d'onboarding ?",
  "Quelle convention pour nommer les branches ?",
];
const THREAD = [
  { q: "Quelle convention pour nommer les branches ?", a: "Convention kebab-case, née dans deux projets puis promue au niveau organisation. Voir la compétence org/branches-nommage-kebab-case." },
];
const SKILL_USED = "bancaire/relancer-synchro";
const ANSWER_RAW: ({ t: string } | { c: number })[] = [
  { t: "Relancez la synchro bancaire en rafraîchissant d'abord le token OAuth (erreur 401)" }, { c: 1 },
  { t: ", puis en rejouant le webhook manqué côté Bridge" }, { c: 2 },
  { t: ". Une fois la connexion rétablie, les écritures FEC sont régénérées" }, { c: 3 },
  { t: " et le taux de reprise remonte sous 5 minutes. La procédure suit la convention de nommage partagée dans l'organisation" }, { c: 4 },
  { t: "." },
];
const SOURCES: Record<number, { level: Level; author: string; snippet: string }> = {
  1: { level: "personal", author: "sophie", snippet: "a testé le refresh token OAuth la semaine dernière" },
  2: { level: "project", author: "arthur", snippet: "rejoue le webhook manqué après le refresh du token" },
  3: { level: "team", author: "alex", snippet: "a documenté l'erreur OAuth 401 côté Bridge" },
  4: { level: "organization", author: "nicolas", snippet: "convention kebab-case sur les branches partagée" },
};
const LEVEL_ORDER: Level[] = ["personal", "team", "project", "organization"];
const LEVEL_LABELS: Record<Level, string> = { personal: "Personal", team: "Team", project: "Project", organization: "Organization" };
const KNOWN = /synchro|bancaire|oauth|bridge|webhook|fec|onboarding|funnel|branche|nommage|kebab/;

function useViewportWidth() {
  const { width } = useViewport();
  return width;
}

export default function InterrogerLaMemoirePage() {
  const w = useViewportWidth();
  const weave = useWeaveProject();
  const [liveAnswer, setLiveAnswer] = useState<Answer | null>(null);
  const [phaseProp, setPhaseProp] = useState<Phase>("answered");
  const [phaseOverride, setPhaseOverride] = useState<Phase | null>(null);
  const [scope, setScope] = useState("org");
  const [askValue, setAskValue] = useState("Comment relancer la synchro bancaire d'un client ?");
  const [highlight, setHighlight] = useState<number | null>(null);
  const [groupsOpen, setGroupsOpen] = useState<Record<Level, boolean>>({ personal: true, team: true, project: true, organization: true });
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState<Record<number, boolean>>({});
  const [focus, setFocus] = useState(false);
  const askT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const map: Record<string, Phase> = { "répondu": "answered", "initial": "idle", "sans-mémoire": "nomemory", "chargement": "loading", "erreur": "error" };
    const s = new URLSearchParams(window.location.search).get("state");
    if (s && map[s]) setPhaseProp(map[s]);
  }, []);
  useEffect(() => clearAsk, []);
  const clearAsk = () => clearTimeout(askT.current);

  const phase: Phase = phaseOverride ?? phaseProp;
  const twoCol = w >= 1024;
  const isNarrow = w < 560;

  const doAsk = async (q?: string) => {
    const question = q ?? askValue;
    if (q) setAskValue(q);
    setPhaseOverride("loading");
    setHighlight(null);
    setLiveAnswer(null);
    try {
      const res = await weave.ask(question);
      setLiveAnswer(res);
      setPhaseOverride(res.answer?.trim() ? "answered" : "nomemory");
    } catch {
      setPhaseOverride("error");
    }
  };
  const onRetry = () => { void doAsk(); };
  const clickCite = (n: number) => { const lvl = SOURCES[n].level; setGroupsOpen((g) => ({ ...g, [lvl]: true })); setProvenanceOpen(true); setHighlight(n); };

  const showAnswerArea = phase === "loading" || phase === "answered" || phase === "nomemory";

  const askBarStyle: CSSProperties = isNarrow
    ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, padding: "12px 16px", borderTop: "1px solid var(--line)" }
    : { position: "sticky", top: 0, zIndex: 20, padding: "6px 0 14px" };

  return (
    <WeaveShell width={w} connected={weave.connected} llm={weave.llm}>
      <div className="max-w-[1200px] mx-auto" style={{ padding: `0 24px ${isNarrow ? 140 : 64}px` }}>
        {/* HEADER */}
        <div className="py-[22px] pb-3.5">
          <div className="flex items-center gap-2.5">
            <MessageSquare size={18} color="var(--ink)" />
            <h1 className="m-0 text-2xl font-semibold tracking-tight">Interroger la mémoire partagée</h1>
          </div>
          <div className="mt-3 flex items-center gap-2.5 flex-wrap">
            <span className="text-xs text-muted">Périmètre</span>
            <div className="min-w-[190px]"><Select value={scope} onChange={(e) => setScope(e.target.value)} options={SCOPE_OPTIONS} fullWidth={false} /></div>
            <span className="text-xs text-muted">· chaque réponse est tracée jusqu&apos;à ses sources</span>
          </div>
        </div>

        {/* THREAD */}
        {THREAD.length > 0 && (
          <div className="flex flex-col gap-2 mb-3.5">
            {THREAD.map((t, i) => {
              const open = !!threadOpen[i];
              return (
                <button key={i} type="button" onClick={() => setThreadOpen((p) => ({ ...p, [i]: !p[i] }))}
                  className="text-left border border-line rounded-lg bg-surface p-[10px_12px] cursor-pointer w-full">
                  <div className="flex items-center gap-2">
                    <Bot size={14} className="shrink-0 text-muted" />
                    <span className="flex-1 min-w-0 text-sm text-ink truncate">{t.q}</span>
                    <ChevronDown size={14} className="shrink-0 text-muted" style={{ transition: "transform 200ms ease", transform: open ? "rotate(180deg)" : "none" }} />
                  </div>
                  <div style={{ overflow: "hidden", maxHeight: open ? 120 : 0, opacity: open ? 1 : 0, transition: "max-height 220ms ease, opacity 220ms ease" }}>
                    <div className="text-[12.5px] text-ink-soft leading-relaxed pt-[7px]">{t.a}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ASK BAR */}
        <div className="bg-bg" style={askBarStyle}>
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-[13px] top-1/2 -translate-y-1/2 pointer-events-none text-muted" />
              <input type="text" value={askValue} onChange={(e) => setAskValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doAsk(); }}
                onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
                placeholder="Comment relancer la synchro bancaire d'un client ?"
                className="w-full h-11 box-border rounded-md px-[14px] pl-[38px] font-sans text-sm text-ink outline-none bg-surface"
                style={{ border: `1px solid ${focus ? "var(--accent)" : "var(--line)"}`, boxShadow: focus ? "0 0 0 3px var(--accent-soft)" : "none", transition: "border-color 120ms ease, box-shadow 120ms ease" }} />
            </div>
            <Button variant="primary" size="lg" onClick={() => doAsk()} disabled={phase === "loading"}>{phase === "loading" ? "…" : "Demander"}</Button>
          </div>
          <div className="wv-scroll mt-2.5 flex gap-2 overflow-x-auto pb-0.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => doAsk(s)}
                className="shrink-0 border border-line bg-surface rounded-full px-[13px] py-[6px] text-[12.5px] text-ink-soft cursor-pointer whitespace-nowrap font-sans">{s}</button>
            ))}
          </div>
        </div>

        {/* IDLE */}
        {phase === "idle" && (
          <div className="mt-7 text-center p-[32px_16px]">
            <svg viewBox="0 0 100 100" width="40" height="40" fill="none" className="block mx-auto opacity-50"><path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /><circle cx="78" cy="30" r="6" fill="var(--accent)" /></svg>
            <div className="mt-3.5 text-sm text-ink-soft leading-relaxed max-w-[460px] mx-auto">Posez une question à l&apos;organisation. La réponse s&apos;appuie sur la mémoire de vos équipes — et cite chaque source, du niveau personnel à l&apos;organisation.</div>
          </div>
        )}

        {/* ERROR */}
        {phase === "error" && (
          <div className="mt-5 flex items-center gap-3 p-[14px_16px] border border-line rounded-lg bg-subtle">
            <TriangleAlert size={17} className="shrink-0 text-ink" />
            <span className="flex-1 text-sm text-ink-soft">La mémoire n&apos;a pas pu être interrogée. Réessayez dans un instant.</span>
            <Button variant="secondary" size="sm" onClick={onRetry}>Réessayer</Button>
          </div>
        )}

        {/* ANSWER AREA */}
        {showAnswerArea && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-[18px] lg:gap-7 mt-6 items-start">
            {/* LEFT */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider text-muted font-medium">Réponse</span>
                {phase === "answered" && liveAnswer?.skill_used && (
                  <span className="inline-flex items-center gap-1.5 rounded-full p-[3px_10px] text-[11.5px] text-accent-deep bg-accent-soft" style={{ border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }}>
                    <Sparkles size={12} /> compétence utilisée : <span className="font-mono">{liveAnswer.skill_used}</span>
                  </span>
                )}
              </div>

              {phase === "loading" && (
                <div className="flex flex-col gap-[9px]">
                  {["96%", "100%", "88%", "70%"].map((wd, i) => <div key={i} className="wv-shimmer h-[15px]" style={{ width: wd }} />)}
                </div>
              )}

              {phase === "nomemory" && (
                <div className="border border-line rounded-lg bg-subtle p-[18px]">
                  <div className="text-sm font-medium text-ink">Aucune mémoire pertinente</div>
                  <div className="mt-1.5 text-sm text-ink-soft leading-relaxed">Nous préférons ne rien inventer. Essayez de reformuler, d&apos;élargir le périmètre, ou de simuler l&apos;activité pour enrichir la mémoire.</div>
                </div>
              )}

              {phase === "answered" && liveAnswer && (
                <>
                  <AnswerBlock
                    answer={liveAnswer.answer}
                    skillUsed={liveAnswer.skill_used ?? undefined}
                    layers={liveAnswer.layers.map((l) => ({
                      level: l.level,
                      facts: l.facts.map((f) => ({ author: f.author, content: f.content })),
                    }))}
                  />
                  <div className="mt-3.5 flex items-center gap-2 text-xs text-muted">
                    <Shield size={13} /> Réponse branchée sur l&apos;API · provenance ci-dessus
                  </div>
                </>
              )}

              {phase === "answered" && !liveAnswer && (
                <>
                  <p className="m-0 text-base leading-relaxed text-ink">
                    {ANSWER_RAW.map((p, i) => {
                      if ("t" in p) return <span key={i}>{p.t}</span>;
                      const n = p.c; const active = highlight === n;
                      return (
                        <sup key={i}>
                          <button type="button" onClick={() => clickCite(n)} onMouseEnter={() => setHighlight(n)} onMouseLeave={() => setHighlight(null)}
                            className="border-0 rounded font-sans leading-[1.2] cursor-pointer" style={{ padding: "0 4px", margin: "0 1px", fontSize: 10, fontWeight: 600, background: active ? "var(--accent)" : "var(--accent-soft)", color: active ? "#fff" : "var(--accent-deep)", transition: "background 120ms ease, color 120ms ease" }}>[{n}]</button>
                        </sup>
                      );
                    })}
                  </p>
                  <div className="mt-3.5 flex items-center gap-2 text-xs text-muted">
                    <Shield size={13} /> Réponse composée à partir de 4 sources · 4 couches mémoire
                  </div>
                </>
              )}
            </div>

            {/* RIGHT · provenance */}
            <div className="min-w-0">
              {twoCol && phase === "answered" && !liveAnswer && (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-3">Provenance · couches mémoire</div>
                  <div className="flex flex-col gap-2">
                    {LEVEL_ORDER.map((lvl) => <ProvenanceGroup key={lvl} level={lvl} open={groupsOpen[lvl]} onToggle={() => setGroupsOpen((g) => ({ ...g, [lvl]: !g[lvl] }))} highlight={highlight} setHighlight={setHighlight} />)}
                  </div>
                </>
              )}
              {!twoCol && phase === "answered" && !liveAnswer && (
                <>
                  <button type="button" onClick={() => setProvenanceOpen((o) => !o)} className="w-full text-left border border-line rounded-lg bg-surface p-[12px_14px] cursor-pointer flex items-center gap-2">
                    <Shield size={15} className="text-ink-soft" />
                    <span className="flex-1 text-sm font-medium text-ink">Voir la provenance (4 couches)</span>
                    <ChevronDown size={15} className="shrink-0 text-muted" style={{ transition: "transform 200ms ease", transform: provenanceOpen ? "rotate(180deg)" : "none" }} />
                  </button>
                  {provenanceOpen && (
                    <div className="mt-2 flex flex-col gap-2">
                      {LEVEL_ORDER.map((lvl) => <ProvenanceGroup key={lvl} level={lvl} open onToggle={() => {}} highlight={highlight} setHighlight={setHighlight} staticMode />)}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </WeaveShell>
  );
}

function ProvenanceGroup({ level, open, onToggle, highlight, setHighlight, staticMode = false }:
  { level: Level; open: boolean; onToggle: () => void; highlight: number | null; setHighlight: (n: number | null) => void; staticMode?: boolean }) {
  const facts = Object.keys(SOURCES).map(Number).filter((n) => SOURCES[n].level === level);
  const count = `${facts.length} ${facts.length > 1 ? "sources" : "source"}`;
  const header = (
    <>
      <Badge tone={level}>{LEVEL_LABELS[level]}</Badge>
      <span className="text-[11px] text-muted flex-1">{count}</span>
      {!staticMode && <ChevronDown size={14} className="shrink-0 text-muted" style={{ transition: "transform 200ms ease", transform: open ? "rotate(180deg)" : "none" }} />}
    </>
  );
  const rows = facts.map((n) => {
    const s = SOURCES[n]; const active = highlight === n;
    return (
      <div key={n} onMouseEnter={() => setHighlight(n)} onMouseLeave={() => setHighlight(null)}
        className="flex gap-2 items-start rounded-md p-1.5 -m-1.5" style={{ background: active ? "var(--accent-soft)" : "transparent", transition: "background 120ms ease" }}>
        <span className="shrink-0 w-[18px] h-[18px] rounded inline-flex items-center justify-center text-[10px] font-semibold" style={{ background: active ? "var(--accent)" : "var(--accent-soft)", color: active ? "#fff" : "var(--accent-deep)", transition: "background 120ms ease, color 120ms ease" }}>{n}</span>
        <span className="min-w-0">
          <span className="font-mono text-[11px] text-muted">{s.author}</span>
          <span className="block text-[12.5px] text-ink-soft leading-relaxed mt-[1px]">« {s.snippet} »</span>
        </span>
      </div>
    );
  });

  if (staticMode) {
    return (
      <div className="border border-line rounded-lg bg-surface">
        <div className="p-[10px_12px] flex items-center gap-2 border-b border-line">{header}</div>
        <div className="p-[10px_12px] flex flex-col gap-[7px]">{rows}</div>
      </div>
    );
  }
  return (
    <div className="border border-line rounded-lg bg-surface overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full text-left border-0 bg-transparent p-[10px_12px] cursor-pointer flex items-center gap-2">{header}</button>
      <div style={{ overflow: "hidden", maxHeight: open ? 200 : 0, opacity: open ? 1 : 0, transition: "max-height 220ms ease, opacity 220ms ease" }}>
        <div className="px-3 pb-2.5 flex flex-col gap-[7px]">{rows}</div>
      </div>
    </div>
  );
}
