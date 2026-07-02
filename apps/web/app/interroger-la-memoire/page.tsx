"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { Search, MessageSquare, Bot, Sparkles, Shield, TriangleAlert, ChevronDown } from "lucide-react";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";
import { Select } from "../../components/ui/workspace-ui";

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

function useViewport() {
  const [w, setW] = useState(1440);
  useEffect(() => { const on = () => setW(window.innerWidth); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return w;
}

export default function InterrogerLaMemoirePage() {
  const w = useViewport();
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

  const doAsk = (q?: string) => {
    const query = (q ?? askValue).toLowerCase();
    if (q) setAskValue(q);
    setPhaseOverride("loading"); setHighlight(null);
    clearTimeout(askT.current);
    askT.current = setTimeout(() => setPhaseOverride(KNOWN.test(query) ? "answered" : "nomemory"), 750);
  };
  const onRetry = () => { setPhaseOverride("loading"); clearTimeout(askT.current); askT.current = setTimeout(() => setPhaseOverride("answered"), 750); };
  const clickCite = (n: number) => { const lvl = SOURCES[n].level; setGroupsOpen((g) => ({ ...g, [lvl]: true })); setProvenanceOpen(true); setHighlight(n); };

  const showAnswerArea = phase === "loading" || phase === "answered" || phase === "nomemory";

  const askBarStyle: CSSProperties = isNarrow
    ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, background: "var(--bg)", borderTop: "1px solid var(--line)", padding: "12px 16px" }
    : { position: "sticky", top: 0, zIndex: 20, background: "var(--bg)", padding: "6px 0 14px" };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-sans)", color: "var(--ink)", WebkitFontSmoothing: "antialiased", boxSizing: "border-box" }}>
      {/* TOP BAR */}
      <div style={{ borderBottom: "1px solid var(--line)" }}>
        <header style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 14 }}>
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

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: `0 24px ${isNarrow ? 140 : 64}px` }}>
        {/* HEADER */}
        <div style={{ padding: "22px 0 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <MessageSquare size={18} color="var(--ink)" />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Interroger la mémoire partagée</h1>
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Périmètre</span>
            <div style={{ minWidth: 190 }}><Select value={scope} onChange={(e) => setScope(e.target.value)} options={SCOPE_OPTIONS} fullWidth={false} /></div>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>· chaque réponse est tracée jusqu&apos;à ses sources</span>
          </div>
        </div>

        {/* THREAD */}
        {THREAD.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {THREAD.map((t, i) => {
              const open = !!threadOpen[i];
              return (
                <button key={i} type="button" onClick={() => setThreadOpen((p) => ({ ...p, [i]: !p[i] }))}
                  style={{ textAlign: "left", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: "10px 12px", cursor: "pointer", width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Bot size={14} color="var(--muted)" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.q}</span>
                    <ChevronDown size={14} color="var(--muted)" style={{ flexShrink: 0, transition: "transform 200ms ease", transform: open ? "rotate(180deg)" : "none" }} />
                  </div>
                  <div style={{ overflow: "hidden", maxHeight: open ? 120 : 0, opacity: open ? 1 : 0, transition: "max-height 220ms ease, opacity 220ms ease" }}>
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.5, paddingTop: 7 }}>{t.a}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ASK BAR */}
        <div style={askBarStyle}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <Search size={16} color="var(--muted)" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input type="text" value={askValue} onChange={(e) => setAskValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doAsk(); }}
                onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
                placeholder="Comment relancer la synchro bancaire d'un client ?"
                style={{ width: "100%", height: 44, boxSizing: "border-box", border: `1px solid ${focus ? "var(--accent)" : "var(--line)"}`, background: "var(--surface)", borderRadius: 6, padding: "0 14px 0 38px", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--ink)", outline: "none", boxShadow: focus ? "0 0 0 3px var(--accent-soft)" : "none", transition: "border-color 120ms ease, box-shadow 120ms ease" }} />
            </div>
            <Button variant="primary" size="lg" onClick={() => doAsk()} disabled={phase === "loading"}>{phase === "loading" ? "…" : "Demander"}</Button>
          </div>
          <div className="wv-scroll" style={{ marginTop: 10, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => doAsk(s)}
                style={{ flexShrink: 0, border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 999, padding: "6px 13px", fontSize: 12.5, color: "var(--ink-soft)", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "var(--font-sans)" }}>{s}</button>
            ))}
          </div>
        </div>

        {/* IDLE */}
        {phase === "idle" && (
          <div style={{ marginTop: 28, textAlign: "center", padding: "32px 16px" }}>
            <svg viewBox="0 0 100 100" width="40" height="40" fill="none" style={{ display: "block", margin: "0 auto", opacity: 0.5 }}><path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /><circle cx="78" cy="30" r="6" fill="var(--accent)" /></svg>
            <div style={{ marginTop: 14, fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>Posez une question à l&apos;organisation. La réponse s&apos;appuie sur la mémoire de vos équipes — et cite chaque source, du niveau personnel à l&apos;organisation.</div>
          </div>
        )}

        {/* ERROR */}
        {phase === "error" && (
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--subtle)" }}>
            <TriangleAlert size={17} color="var(--ink)" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: "var(--ink-soft)" }}>La mémoire n&apos;a pas pu être interrogée. Réessayez dans un instant.</span>
            <Button variant="secondary" size="sm" onClick={onRetry}>Réessayer</Button>
          </div>
        )}

        {/* ANSWER AREA */}
        {showAnswerArea && (
          <div style={{ display: "grid", gridTemplateColumns: twoCol ? "minmax(0,7fr) minmax(0,5fr)" : "minmax(0,1fr)", gap: twoCol ? 28 : 18, marginTop: 24, alignItems: "start" }}>
            {/* LEFT */}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 500 }}>Réponse</span>
                {phase === "answered" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)", background: "var(--accent-soft)", borderRadius: 999, padding: "3px 10px", fontSize: 11.5, color: "var(--accent-deep)" }}>
                    <Sparkles size={12} /> compétence utilisée : <span style={{ fontFamily: "var(--font-mono)" }}>{SKILL_USED}</span>
                  </span>
                )}
              </div>

              {phase === "loading" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {["96%", "100%", "88%", "70%"].map((wd, i) => <div key={i} className="wv-shimmer" style={{ height: 15, width: wd }} />)}
                </div>
              )}

              {phase === "nomemory" && (
                <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--subtle)", padding: 18 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Aucune mémoire pertinente</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.55 }}>Nous préférons ne rien inventer. Essayez de reformuler, d&apos;élargir le périmètre, ou de simuler l&apos;activité pour enrichir la mémoire.</div>
                </div>
              )}

              {phase === "answered" && (
                <>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "var(--ink)" }}>
                    {ANSWER_RAW.map((p, i) => {
                      if ("t" in p) return <span key={i}>{p.t}</span>;
                      const n = p.c; const active = highlight === n;
                      return (
                        <sup key={i}>
                          <button type="button" onClick={() => clickCite(n)} onMouseEnter={() => setHighlight(n)} onMouseLeave={() => setHighlight(null)}
                            style={{ border: "none", background: active ? "var(--accent)" : "var(--accent-soft)", color: active ? "#fff" : "var(--accent-deep)", borderRadius: 4, padding: "0 4px", margin: "0 1px", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", lineHeight: 1.2, transition: "background 120ms ease, color 120ms ease" }}>[{n}]</button>
                        </sup>
                      );
                    })}
                  </p>
                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
                    <Shield size={13} /> Réponse composée à partir de 4 sources · 4 couches mémoire
                  </div>
                </>
              )}
            </div>

            {/* RIGHT · provenance */}
            <div style={{ minWidth: 0 }}>
              {twoCol && phase === "answered" && (
                <>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 500, marginBottom: 12 }}>Provenance · couches mémoire</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {LEVEL_ORDER.map((lvl) => <ProvenanceGroup key={lvl} level={lvl} open={groupsOpen[lvl]} onToggle={() => setGroupsOpen((g) => ({ ...g, [lvl]: !g[lvl] }))} highlight={highlight} setHighlight={setHighlight} />)}
                  </div>
                </>
              )}
              {!twoCol && phase === "answered" && (
                <>
                  <button type="button" onClick={() => setProvenanceOpen((o) => !o)} style={{ width: "100%", textAlign: "left", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                    <Shield size={15} color="var(--ink-soft)" />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>Voir la provenance (4 couches)</span>
                    <ChevronDown size={15} color="var(--muted)" style={{ flexShrink: 0, transition: "transform 200ms ease", transform: provenanceOpen ? "rotate(180deg)" : "none" }} />
                  </button>
                  {provenanceOpen && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                      {LEVEL_ORDER.map((lvl) => <ProvenanceGroup key={lvl} level={lvl} open onToggle={() => {}} highlight={highlight} setHighlight={setHighlight} staticMode />)}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProvenanceGroup({ level, open, onToggle, highlight, setHighlight, staticMode = false }:
  { level: Level; open: boolean; onToggle: () => void; highlight: number | null; setHighlight: (n: number | null) => void; staticMode?: boolean }) {
  const facts = Object.keys(SOURCES).map(Number).filter((n) => SOURCES[n].level === level);
  const count = `${facts.length} ${facts.length > 1 ? "sources" : "source"}`;
  const header = (
    <>
      <Badge tone={level}>{LEVEL_LABELS[level]}</Badge>
      <span style={{ fontSize: 11, color: "var(--muted)", flex: 1 }}>{count}</span>
      {!staticMode && <ChevronDown size={14} color="var(--muted)" style={{ flexShrink: 0, transition: "transform 200ms ease", transform: open ? "rotate(180deg)" : "none" }} />}
    </>
  );
  const rows = facts.map((n) => {
    const s = SOURCES[n]; const active = highlight === n;
    return (
      <div key={n} onMouseEnter={() => setHighlight(n)} onMouseLeave={() => setHighlight(null)}
        style={{ display: "flex", gap: 8, alignItems: "flex-start", borderRadius: 6, padding: 6, margin: -6, background: active ? "var(--accent-soft)" : "transparent", transition: "background 120ms ease" }}>
        <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, background: active ? "var(--accent)" : "var(--accent-soft)", color: active ? "#fff" : "var(--accent-deep)", transition: "background 120ms ease, color 120ms ease" }}>{n}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{s.author}</span>
          <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.45, marginTop: 1 }}>« {s.snippet} »</span>
        </span>
      </div>
    );
  });

  if (staticMode) {
    return (
      <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)" }}>
        <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--line-soft)" }}>{header}</div>
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>{rows}</div>
      </div>
    );
  }
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", overflow: "hidden" }}>
      <button type="button" onClick={onToggle} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>{header}</button>
      <div style={{ overflow: "hidden", maxHeight: open ? 200 : 0, opacity: open ? 1 : 0, transition: "max-height 220ms ease, opacity 220ms ease" }}>
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 7 }}>{rows}</div>
      </div>
    </div>
  );
}
