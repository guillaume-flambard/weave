"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles, Building2, Zap, FileText, Brain, Route, Users, TrendingUp, Shield,
  Pin, Flag, Copy, Check,
} from "lucide-react";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";
import { Panel, ProgressBar } from "../../components/ui/workspace-ui";

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

function useViewport() {
  const [w, setW] = useState(1440);
  useEffect(() => { const on = () => setW(window.innerWidth); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return w;
}

export default function CompetencePage() {
  const w = useViewport();
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

  const twoCol = w >= 1024;
  const isNarrow = w < 768;
  const isProject = view === "projet";
  const level: Level = isProject ? "project" : "organization";
  const levelLabel = isProject ? "Project" : "Organization";
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const onCopy = () => { try { navigator.clipboard?.writeText(BODY); } catch { /* noop */ } setCopied(true); clearTimeout(copyT.current); copyT.current = setTimeout(() => setCopied(false), 1600); };

  const collapseBody = isNarrow && !expanded;
  const bodyGrid = { display: "grid", gridTemplateColumns: twoCol ? "minmax(0,2fr) minmax(0,1fr)" : "minmax(0,1fr)", gap: 16, alignItems: "start" as const };

  if (view === "introuvable") {
    return (
      <Shell w={w}>
        <div style={{ maxWidth: 1360, margin: "0 auto", padding: 24, display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: 440, width: "100%", textAlign: "center", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: "32px 28px", marginTop: 32, boxSizing: "border-box" }}>
            <svg viewBox="0 0 100 100" width="44" height="44" fill="none" style={{ display: "block", margin: "0 auto", opacity: 0.55 }}><path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /><circle cx="78" cy="30" r="6" fill="var(--accent)" /></svg>
            <div style={{ marginTop: 16, fontSize: 16, fontWeight: 600 }}>Compétence introuvable</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>Cette compétence n&apos;existe pas ou a été fusionnée avec une autre. Elle n&apos;apparaît plus dans la mémoire de l&apos;organisation.</div>
            <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}><a href="/espace-de-travail" style={{ textDecoration: "none" }}><Button variant="secondary">← Retour aux compétences</Button></a></div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell w={w}>
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 24px 64px" }}>
        <nav aria-label="Fil d'ariane" style={{ padding: "16px 0 0", display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--muted)" }}>
          <a href="/espace-de-travail" style={{ color: "var(--muted)", textDecoration: "none" }}>Compétences</a><span>/</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{SKILL.name}</span>
        </nav>

        {/* sticky header */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--bg)", padding: collapsed ? "12px 0" : "18px 0 20px", borderBottom: collapsed ? "1px solid var(--line)" : "1px solid transparent", marginBottom: 16, transition: "padding 150ms ease" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {isProject ? <Sparkles size={17} color="var(--accent)" style={{ flexShrink: 0 }} /> : <Building2 size={17} color="var(--lvl-org)" style={{ flexShrink: 0 }} />}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 600, color: "var(--ink)", wordBreak: "break-word" }}>{SKILL.name}</span>
                <Badge tone={level}>{levelLabel}</Badge>
              </div>
              {!collapsed && (
                <>
                  <div style={{ marginTop: 8, fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>{SKILL.title}</div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>
                    <span>créée le {SKILL.created}</span><span>·</span><span>dernière évolution {SKILL.evolved}</span><span>·</span><span>{SKILL.team}</span>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {!collapsed && <Button variant="secondary" size="md">Voir la provenance</Button>}
              <Button variant="primary" size="md" icon={<Sparkles size={15} />}>Utiliser dans une réponse</Button>
            </div>
          </div>
        </div>

        {view === "chargement" ? (
          <div style={bodyGrid}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[40, 180, 128].map((h, i) => <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, background: "var(--surface)" }}><div className="wv-shimmer" style={{ height: 14, width: "34%" }} /><div className="wv-shimmer" style={{ height: h, marginTop: 14 }} /></div>)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[120, 60].map((h, i) => <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, background: "var(--surface)" }}><div className="wv-shimmer" style={{ height: h }} /></div>)}
            </div>
          </div>
        ) : (
          <div style={bodyGrid}>
            {/* LEFT */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <Panel title="Déclencheur" icon={<Zap size={15} strokeWidth={2} />} subtitle="Les formulations qui routent une question vers cette compétence.">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SKILL.triggers.map((t) => (
                    <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", background: "var(--subtle)", borderRadius: 999, padding: "5px 12px", fontSize: 12.5, color: "var(--ink-soft)" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)" }} />« {t} »
                    </span>
                  ))}
                </div>
              </Panel>

              <Panel title="Contenu de la compétence" icon={<FileText size={15} strokeWidth={2} />} actions={<Button variant="ghost" size="sm" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={onCopy}>{copied ? "Copié" : "Copier"}</Button>}>
                <pre className="wv-scroll" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", borderRadius: 6, border: "1px solid var(--line)", background: "var(--subtle)", padding: 14, fontSize: 12.5, lineHeight: 1.65, color: "var(--ink-soft)", fontFamily: "var(--font-mono)", maxHeight: collapseBody ? 220 : "none", overflowY: collapseBody ? "hidden" : "visible" }}>{BODY}</pre>
                {isNarrow && <div style={{ marginTop: 10 }}><button type="button" onClick={() => setExpanded((e) => !e)} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "var(--accent)", fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500 }}>{expanded ? "Afficher moins" : "Afficher tout le contenu"}</button></div>}
              </Panel>

              <Panel title="Sources" icon={<Brain size={15} strokeWidth={2} />} count={SOURCES.length} subtitle="Les faits et messages dont cette compétence a émergé.">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {SOURCES.map((s, i) => (
                    <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "11px 12px", background: "var(--surface)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        <Badge tone={s.level}>{s.levelLabel}</Badge>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{s.workstream} · {s.author} · {s.time}</span>
                      </div>
                      <div style={{ marginTop: 5, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.45 }}>« {s.snippet} »</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* RIGHT RAIL */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <Panel title="Provenance & promotion" icon={<Route size={15} strokeWidth={2} />}>
                <div style={{ display: "flex", flexDirection: "column" }}>
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {REFERENTS.map((r) => (
                    <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--line)", borderRadius: 999, padding: "3px 10px 3px 3px", background: "var(--surface)" }}>
                      <Avatar name={r} size="sm" /><span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{r}</span>
                    </span>
                  ))}
                </div>
              </Panel>

              <Panel title="Utilisation" icon={<TrendingUp size={15} strokeWidth={2} />}>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 600, color: "var(--ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>34<span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 400 }}>×</span></div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "var(--accent-deep)", display: "inline-flex", alignItems: "center", gap: 3 }}><TrendingUp size={12} strokeWidth={2.4} />12 cette semaine</div>
                  </div>
                  <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: 120, height: 40, flexShrink: 0, overflow: "visible" }}><path d={SPARK} fill="none" stroke="#2383e2" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ marginTop: 14, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 500, marginBottom: 8 }}>Principaux consommateurs</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {CONSUMERS.map((c) => (
                      <div key={c.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{c.count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel title="Gouvernance" icon={<Shield size={15} strokeWidth={2} />}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Statut</span>
                  <Badge tone="active">{isProject ? "active" : "promue"}</Badge>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="secondary" size="sm" icon={<Pin size={14} />}>Épingler</Button>
                  <Button variant="ghost" size="sm" icon={<Flag size={14} />}>Signaler / corriger</Button>
                </div>
              </Panel>
            </div>
          </div>
        )}
      </div>

      {copied && (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 60, display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8, background: "var(--ink)", color: "#fff", fontSize: 13, boxShadow: "0 4px 14px rgba(15,15,15,0.16)" }}><Check size={15} />Contenu copié</div>
      )}
    </Shell>
  );
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

function Step({ dot, ring, line = false, last = false, label, detail, muted = false, promoted = false, pulse = false, progress }:
  { dot: string; ring?: string; line?: boolean; last?: boolean; label: string; detail: string; muted?: boolean; promoted?: boolean; pulse?: boolean; progress?: { occ: number; thr: number } }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: dot, border: ring ? `3px solid ${ring}` : `2px solid ${dot}`, boxSizing: "border-box", flexShrink: 0 }} />
        {line && <span style={{ width: 2, flex: 1, minHeight: 26, background: "var(--line)" }} />}
      </div>
      <div style={{ paddingBottom: last ? 0 : 18, minWidth: 0, flex: 1 }}>
        {promoted ? (
          <div className={pulse ? "wv-pulse" : undefined} style={{ border: "1px solid color-mix(in srgb, var(--lvl-org) 40%, transparent)", background: "var(--lvl-org-bg)", borderRadius: 8, padding: "9px 11px" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--lvl-org)" }}>{label}</div>
            <div style={{ marginTop: 3, fontSize: 12, color: "var(--ink-soft)" }}>{detail}</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: muted ? "var(--muted)" : "var(--ink)" }}>{label}</div>
            <div style={{ marginTop: 2, fontSize: 12, color: "var(--muted)" }}>{detail}</div>
            {progress && <div style={{ marginTop: 8, maxWidth: 200 }}><ProgressBar occurrences={progress.occ} threshold={progress.thr} /></div>}
          </>
        )}
      </div>
    </div>
  );
}
