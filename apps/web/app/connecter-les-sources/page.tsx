"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  MessagesSquare, GitBranch, FileText, NotebookText, SquareKanban, Plus, Zap, Upload,
  Lock, Shield, X, Check, LoaderCircle,
} from "lucide-react";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";
import { Select } from "../../components/ui/workspace-ui";

// Connecter les sources — ported from Claude Design (Connecter les sources.dc.html).
// Connector grid + read-only scoped config drawer/modal/sheet. State via
// ?state=normal|vierge|chargement.

type View = "normal" | "vierge" | "chargement";
type Status = "connected" | "error" | "disconnected" | "add";

type Connector = { id: string; name: string; role: string; items: string; lastSync: string; itemsLabel: string; team: string; things: string[] };
const CONNECTORS: Connector[] = [
  { id: "slack", name: "Slack", role: "Questions & réponses des canaux d'équipe", items: "1 240 messages lus", lastSync: "il y a 4 min", itemsLabel: "Canaux à lire", team: "data", things: ["#data", "#growth", "#produit", "#support", "#général"] },
  { id: "notion", name: "Notion", role: "Décisions & documentation d'équipe", items: "24 pages lues", lastSync: "il y a 12 min", itemsLabel: "Espaces à lire", team: "produit", things: ["Espace Data", "Espace Produit", "Espace Growth"] },
  { id: "github", name: "GitHub", role: "Pull requests, issues, revues de code", items: "3 dépôts", lastSync: "échec il y a 1 h", itemsLabel: "Dépôts à lire", team: "data", things: ["pennylane/api", "pennylane/web", "pennylane/bridge-sync"] },
  { id: "gdocs", name: "Google Docs", role: "Notes & comptes-rendus de réunion", items: "", lastSync: "", itemsLabel: "Dossiers à lire", team: "growth", things: ["Drive · Comptes-rendus", "Drive · Specs produit"] },
  { id: "linear", name: "Linear", role: "Tickets & specs produit", items: "", lastSync: "", itemsLabel: "Équipes à lire", team: "produit", things: ["Équipe Produit", "Équipe Growth"] },
  { id: "other", name: "Autre source", role: "Webhook ou API personnalisée", items: "", lastSync: "", itemsLabel: "", team: "data", things: [] },
];
const TEAM_OPTIONS = [
  { value: "data", label: "Équipe Data" }, { value: "produit", label: "Équipe Produit" }, { value: "growth", label: "Équipe Growth" }, { value: "support", label: "Équipe Support" }, { value: "org", label: "Toute l'organisation" },
];
const TILE_COLOR: Record<string, string> = { slack: "var(--lvl-project)", notion: "var(--ink)", github: "var(--ink)", gdocs: "var(--accent)", linear: "var(--lvl-project)", other: "var(--muted)" };

function ConnectorIcon({ id }: { id: string }) {
  const p = { size: 20 as const };
  if (id === "slack") return <MessagesSquare {...p} />;
  if (id === "notion") return <NotebookText {...p} />;
  if (id === "github") return <GitBranch {...p} />;
  if (id === "gdocs") return <FileText {...p} />;
  if (id === "linear") return <SquareKanban {...p} />;
  return <Plus {...p} />;
}

function useViewport() {
  const [w, setW] = useState(1440);
  useEffect(() => { const on = () => setW(window.innerWidth); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return w;
}

export default function ConnecterLesSourcesPage() {
  const w = useViewport();
  const [view, setView] = useState<View>("normal");
  const [override, setOverride] = useState<Record<string, Status>>({});
  const [drawer, setDrawer] = useState<string | null>(null);
  const [drawerTeam, setDrawerTeam] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("state") as View | null;
    if (s && ["normal", "vierge", "chargement"].includes(s)) setView(s);
  }, []);
  useEffect(() => () => { clearTimeout(t.current); clearTimeout(toastT.current); }, []);

  const isLoading = view === "chargement";
  const isVierge = view === "vierge";
  const cols = w >= 900 ? 3 : w >= 620 ? 2 : 1;
  const drawerMode = w >= 1200 ? "drawer" : w >= 768 ? "modal" : "sheet";

  const baseStatus = (id: string): Status => {
    if (isVierge) return id === "other" ? "add" : "disconnected";
    return ({ slack: "connected", notion: "connected", github: "error", gdocs: "disconnected", linear: "disconnected", other: "add" } as Record<string, Status>)[id];
  };
  const status = (id: string): Status => override[id] ?? baseStatus(id);
  const isSel = (id: string, i: number) => { const k = `${id}:${i}`; return k in sel ? sel[k] : true; };
  const flash = (msg: string) => { setToast(msg); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 4200); };

  const onSave = () => {
    const id = drawer!; setDrawerBusy(true);
    clearTimeout(t.current);
    t.current = setTimeout(() => { setOverride((o) => ({ ...o, [id]: "connected" })); setDrawerBusy(false); setDrawer(null); flash(`La mémoire commence à se construire à partir de ${name(id)}.`); }, 900);
  };
  const reconnect = (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    clearTimeout(t.current);
    t.current = setTimeout(() => { setOverride((o) => ({ ...o, [id]: "connected" })); setBusy((b) => ({ ...b, [id]: false })); flash(`${name(id)} reconnecté · synchronisation reprise.`); }, 900);
  };
  const name = (id: string) => CONNECTORS.find((c) => c.id === id)?.name ?? "";

  const dc = drawer ? CONNECTORS.find((c) => c.id === drawer)! : null;
  const selCount = dc ? dc.things.reduce((n, _x, i) => n + (isSel(dc.id, i) ? 1 : 0), 0) : 0;
  const dTeam = dc ? (drawerTeam[dc.id] ?? dc.team) : "data";
  const dTeamLabel = TEAM_OPTIONS.find((o) => o.value === dTeam)?.label ?? "";
  const drawerPreview = selCount === 0 ? "Aucun élément sélectionné — rien ne sera ingéré." : `Weave lira ${selCount} élément${selCount > 1 ? "s" : ""} → ~${selCount * 180} messages/semaine ajoutés à la mémoire de ${dTeamLabel}, en lecture seule.`;

  const panelBase: CSSProperties = { position: "fixed", zIndex: 51, background: "var(--surface)", boxShadow: "0 8px 28px rgba(15,15,15,0.18)", display: "flex", flexDirection: "column", boxSizing: "border-box" };
  const panelStyle: CSSProperties = drawerMode === "drawer"
    ? { ...panelBase, top: 0, right: 0, bottom: 0, width: 420, borderLeft: "1px solid var(--line)" }
    : drawerMode === "modal"
    ? { ...panelBase, top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(560px, 92vw)", maxHeight: "86vh", borderRadius: 10, border: "1px solid var(--line)" }
    : { ...panelBase, inset: 0 };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-sans)", color: "var(--ink)", WebkitFontSmoothing: "antialiased", boxSizing: "border-box" }}>
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

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 64px" }}>
        <div style={{ padding: "24px 0 6px" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}>Connecter vos sources</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55, maxWidth: 640 }}>Weave lit l&apos;activité IA de vos outils pour construire la mémoire — en lecture seule, scopée par équipe. Rien n&apos;est réécrit dans vos outils.</p>
        </div>

        {isVierge && (
          <div style={{ marginTop: 16, border: "1px solid color-mix(in srgb, var(--accent) 25%, var(--line))", borderRadius: 8, background: "var(--accent-soft)", padding: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <svg viewBox="0 0 100 100" width="36" height="36" fill="none" style={{ flexShrink: 0 }}><path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="var(--ink)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" /><circle cx="78" cy="30" r="7" fill="var(--accent)" /></svg>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Aucune source connectée pour l&apos;instant</div>
              <div style={{ marginTop: 3, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>Connectez un outil ci-dessous, ou simulez des données de démo pour explorer Weave sans identifiants.</div>
            </div>
            <a href="/espace-de-travail" style={{ textDecoration: "none" }}><Button variant="primary" size="md" icon={<Zap size={15} />}>Simuler des données de démo</Button></a>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 14, marginTop: 20 }}>
          {isLoading ? [0, 1, 2].map((i) => (
            <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, background: "var(--surface)" }}>
              <div className="wv-shimmer" style={{ height: 40, width: 40, borderRadius: 8 }} /><div className="wv-shimmer" style={{ height: 14, width: "50%", marginTop: 14 }} /><div className="wv-shimmer" style={{ height: 12, width: "75%", marginTop: 8 }} /><div className="wv-shimmer" style={{ height: 32, marginTop: 16 }} />
            </div>
          )) : CONNECTORS.map((c) => {
            const st = status(c.id);
            const connected = st === "connected", errored = st === "error";
            return (
              <div key={c.id} style={{ border: errored ? "1px solid color-mix(in srgb, var(--lvl-org) 40%, var(--line))" : "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", padding: 16, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 8, background: "var(--subtle)", color: TILE_COLOR[c.id], display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ConnectorIcon id={c.id} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{c.name}</span>
                      {connected && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--lvl-team)" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--lvl-team)" }} />Connecté</span>}
                      {errored && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--lvl-org)" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--lvl-org)" }} />Reconnexion requise</span>}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>{c.role}</div>
                  </div>
                </div>

                {connected && <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--muted)", flexWrap: "wrap" }}><span>{c.items}</span><span>·</span><span>sync {c.lastSync}</span></div>}
                {errored && <div style={{ marginTop: 12, fontSize: 12, color: "var(--lvl-org)", background: "var(--lvl-org-bg)", border: "1px solid color-mix(in srgb, var(--lvl-org) 40%, transparent)", borderRadius: 6, padding: "7px 9px", lineHeight: 1.4 }}>Le jeton a expiré — les {c.items} ne sont plus synchronisés.</div>}

                <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                  {connected && <Button variant="secondary" size="sm" onClick={() => setDrawer(c.id)}>Gérer</Button>}
                  {errored && <Button variant="dark" size="sm" disabled={!!busy[c.id]} onClick={() => reconnect(c.id)}>{busy[c.id] ? "Reconnexion…" : "Reconnecter"}</Button>}
                  {st === "disconnected" && <Button variant="primary" size="sm" onClick={() => setDrawer(c.id)}>Connecter</Button>}
                  {c.id === "other" && <Button variant="secondary" size="sm">Configurer un webhook</Button>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 22, border: "1px solid var(--line)", borderRadius: 8, background: "var(--subtle)", padding: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Pas d&apos;accès aux outils en direct ?</div>
            <div style={{ marginTop: 2, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.45 }}>Importez un export existant, ou simulez des données de démo pour évaluer Weave immédiatement.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" size="md" icon={<Upload size={15} />}>Importer un export</Button>
            <a href="/espace-de-travail" style={{ textDecoration: "none" }}><Button variant="dark" size="md" icon={<Zap size={15} />}>Simuler des données de démo</Button></a>
          </div>
        </div>
      </div>

      {/* CONFIG OVERLAY */}
      {dc && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,15,15,0.14)" }} onClick={() => setDrawer(null)} />
          <div className="wv-scroll" role="dialog" aria-label="Configurer la source" style={panelStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: "var(--ink)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, flexShrink: 0 }}>{dc.name.charAt(0)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Configurer {dc.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Choisissez les éléments et le rattachement.</div>
                </div>
              </div>
              <button type="button" onClick={() => setDrawer(null)} aria-label="Fermer" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", padding: 4, borderRadius: 6, flexShrink: 0 }}><X size={18} /></button>
            </div>

            <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)" }}>
                <Lock size={16} color="var(--lvl-team)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}>Accès en lecture seule</div><div style={{ fontSize: 11, color: "var(--muted)" }}>Weave ne peut jamais écrire dans {dc.name}.</div></div>
                <Badge tone="team">verrouillé</Badge>
              </div>

              {dc.things.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 500, marginBottom: 8 }}>{dc.itemsLabel}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {dc.things.map((label, i) => {
                      const on = isSel(dc.id, i);
                      return (
                        <button key={i} type="button" onClick={() => setSel((s) => ({ ...s, [`${dc.id}:${i}`]: !on }))} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", textAlign: "left", cursor: "pointer", border: `1px solid ${on ? "color-mix(in srgb, var(--accent) 35%, var(--line))" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "var(--surface)", borderRadius: 6, padding: "9px 11px", transition: "background 120ms ease, border-color 120ms ease" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--ink)" }}>{label}</span>
                          <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "var(--accent)" : "transparent", border: on ? "1px solid var(--accent)" : "1px solid var(--line)" }}>{on && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 500, marginBottom: 8 }}>Rattacher à</div>
                <Select value={dTeam} onChange={(e) => setDrawerTeam((s) => ({ ...s, [dc.id]: e.target.value }))} options={TEAM_OPTIONS} />
              </div>

              <div style={{ marginTop: 16, border: "1px solid var(--line)", borderRadius: 8, background: "var(--subtle)", padding: 12 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 500, marginBottom: 6 }}>Aperçu de l&apos;ingestion</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>{drawerPreview}</div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
                <Shield size={14} style={{ flexShrink: 0, marginTop: 1 }} />Aucune donnée n&apos;est réécrite dans vos outils. Le parsing peut tourner en local (Ollama) — rien ne quitte votre infrastructure.
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "14px 18px", borderTop: "1px solid var(--line)", flexShrink: 0, background: "var(--surface)" }}>
              <Button variant="ghost" size="md" onClick={() => setDrawer(null)}>Annuler</Button>
              <Button variant="primary" size="md" disabled={drawerBusy} onClick={onSave} style={drawerMode === "sheet" ? { flex: 1, justifyContent: "center" } : undefined} icon={drawerBusy ? <LoaderCircle size={15} className="wv-spin" /> : <Check size={15} />}>{drawerBusy ? "Connexion…" : "Enregistrer & connecter"}</Button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 60, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, background: "var(--ink)", color: "#fff", fontSize: 13, boxShadow: "0 4px 14px rgba(15,15,15,0.16)", maxWidth: "calc(100% - 32px)" }}>
          <Check size={15} color="var(--accent)" style={{ flexShrink: 0 }} /><span>{toast}</span>
          <a href="/espace-de-travail" style={{ color: "#fff", textDecoration: "underline", whiteSpace: "nowrap", fontWeight: 500 }}>Voir le workspace</a>
        </div>
      )}
    </div>
  );
}
