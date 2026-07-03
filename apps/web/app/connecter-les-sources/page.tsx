"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  MessagesSquare, GitBranch, FileText, NotebookText, SquareKanban, Plus, Zap, Upload,
  Lock, Shield, X, Check, LoaderCircle,
} from "lucide-react";
import { WeaveShell } from "../../components/layout/weave-shell";
import { Button, Badge, Avatar, StatusIndicator } from "../../components/ui/primitives";
import { Select } from "../../components/ui/workspace-ui";
import { ingestSlack } from "../../lib/api";
import { useWeaveProject } from "../../hooks/use-weave-project";

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
  const weave = useWeaveProject();
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
  const drawerMode = w >= 1200 ? "drawer" : w >= 768 ? "modal" : "sheet";

  const baseStatus = (id: string): Status => {
    if (isVierge) return id === "other" ? "add" : "disconnected";
    return ({ slack: "connected", notion: "connected", github: "error", gdocs: "disconnected", linear: "disconnected", other: "add" } as Record<string, Status>)[id];
  };
  const status = (id: string): Status => override[id] ?? baseStatus(id);
  const isSel = (id: string, i: number) => { const k = `${id}:${i}`; return k in sel ? sel[k] : true; };
  const flash = (msg: string) => { setToast(msg); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 4200); };

  const onSave = async () => {
    const id = drawer!;
    setDrawerBusy(true);
    try {
      if (id === "slack") {
        await ingestSlack(weave.orgId);
      }
      setOverride((o) => ({ ...o, [id]: "connected" }));
      setDrawer(null);
      flash(`La mémoire commence à se construire à partir de ${name(id)}.`);
      await weave.refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erreur lors de la connexion");
    } finally {
      setDrawerBusy(false);
    }
  };
  const reconnect = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      if (id === "slack") {
        await ingestSlack(weave.orgId);
      }
      setOverride((o) => ({ ...o, [id]: "connected" }));
      flash(`${name(id)} reconnecté · synchronisation reprise.`);
      await weave.refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Échec de la synchronisation");
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };
  const name = (id: string) => CONNECTORS.find((c) => c.id === id)?.name ?? "";

  const dc = drawer ? CONNECTORS.find((c) => c.id === drawer)! : null;
  const selCount = dc ? dc.things.reduce((n, _x, i) => n + (isSel(dc.id, i) ? 1 : 0), 0) : 0;
  const dTeam = dc ? (drawerTeam[dc.id] ?? dc.team) : "data";
  const dTeamLabel = TEAM_OPTIONS.find((o) => o.value === dTeam)?.label ?? "";
  const drawerPreview = selCount === 0 ? "Aucun élément sélectionné — rien ne sera ingéré." : `Weave lira ${selCount} élément${selCount > 1 ? "s" : ""} → ~${selCount * 180} messages/semaine ajoutés à la mémoire de ${dTeamLabel}, en lecture seule.`;

  const panelClasses = "fixed z-[51] bg-surface flex flex-col box-border";
  const modeClasses = drawerMode === "drawer"
    ? "top-0 right-0 bottom-0 w-[420px] border-l border-line"
    : drawerMode === "modal"
    ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(560px,92vw)] max-h-[86vh] rounded-xl border border-line"
    : "inset-0";
  const panelShadow: CSSProperties = { boxShadow: "0 8px 28px rgba(15,15,15,0.18)" };

  return (
    <WeaveShell width={w} connected llm="Ollama (local)">
      <div className="max-w-[1200px] mx-auto px-6 pb-16">
        <div className="pt-6 pb-1.5">
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Connecter vos sources</h1>
          <p className="mt-2 text-sm text-ink-soft leading-[1.55] max-w-[640px]">Weave lit l&apos;activité IA de vos outils pour construire la mémoire — en lecture seule, scopée par équipe. Rien n&apos;est réécrit dans vos outils.</p>
        </div>

        {isVierge && (
          <div className="mt-4 border border-[color-mix(in_srgb,var(--accent)_25%,var(--line))] rounded-lg bg-accent-soft p-[18px] flex items-center gap-3.5 flex-wrap">
            <svg viewBox="0 0 100 100" width="36" height="36" fill="none" className="shrink-0"><path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="var(--ink)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" /><circle cx="78" cy="30" r="7" fill="var(--accent)" /></svg>
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-semibold text-ink">Aucune source connectée pour l&apos;instant</div>
              <div className="mt-[3px] text-[13px] text-ink-soft leading-[1.5]">Connectez un outil ci-dessous, ou simulez des données de démo pour explorer Weave sans identifiants.</div>
            </div>
            <a href="/espace-de-travail" className="no-underline"><Button variant="primary" size="md" icon={<Zap size={15} />}>Simuler des données de démo</Button></a>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-5">
          {isLoading ? [0, 1, 2].map((i) => (
            <div key={i} className="border border-line rounded-lg p-4 bg-surface">
              <div className="wv-shimmer h-10 w-10 rounded-lg" /><div className="wv-shimmer h-3.5 w-1/2 mt-3.5" /><div className="wv-shimmer h-3 w-3/4 mt-2" /><div className="wv-shimmer h-8 mt-4" />
            </div>
          )) : CONNECTORS.map((c) => {
            const st = status(c.id);
            const connected = st === "connected", errored = st === "error";
            return (
              <div key={c.id} className="rounded-lg bg-surface p-4 flex flex-col" style={{ border: errored ? "1px solid color-mix(in srgb, var(--lvl-org) 40%, var(--line))" : "1px solid var(--line)" }}>
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-lg bg-subtle inline-flex items-center justify-center shrink-0" style={{ color: TILE_COLOR[c.id] }}><ConnectorIcon id={c.id} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[7px] flex-wrap">
                      <span className="text-sm font-semibold text-ink">{c.name}</span>
                      {connected && <span className="inline-flex items-center gap-1 text-[11px] text-lvl-team"><span className="w-[6px] h-[6px] rounded-full bg-lvl-team" />Connecté</span>}
                      {errored && <span className="inline-flex items-center gap-1 text-[11px] text-lvl-org"><span className="w-[6px] h-[6px] rounded-full bg-lvl-org" />Reconnexion requise</span>}
                    </div>
                    <div className="mt-[3px] text-[12.5px] text-muted leading-[1.4]">{c.role}</div>
                  </div>
                </div>

                {connected && <div className="mt-3 flex items-center gap-2 text-[11px] text-muted flex-wrap"><span>{c.items}</span><span>·</span><span>sync {c.lastSync}</span></div>}
                {errored && <div className="mt-3 text-[12px] text-lvl-org bg-lvl-org-bg rounded-md p-[7px_9px] leading-[1.4]" style={{ border: "1px solid color-mix(in srgb, var(--lvl-org) 40%, transparent)" }}>Le jeton a expiré — les {c.items} ne sont plus synchronisés.</div>}

                <div className="mt-3.5 flex gap-2">
                  {connected && <Button variant="secondary" size="sm" onClick={() => setDrawer(c.id)}>Gérer</Button>}
                  {errored && <Button variant="dark" size="sm" disabled={!!busy[c.id]} onClick={() => reconnect(c.id)}>{busy[c.id] ? "Reconnexion…" : "Reconnecter"}</Button>}
                  {st === "disconnected" && <Button variant="primary" size="sm" onClick={() => setDrawer(c.id)}>Connecter</Button>}
                  {c.id === "other" && <Button variant="secondary" size="sm">Configurer un webhook</Button>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-[22px] border border-line rounded-lg bg-subtle p-4 flex items-center gap-3.5 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[13.5px] font-semibold text-ink">Pas d&apos;accès aux outils en direct ?</div>
            <div className="mt-0.5 text-[12.5px] text-ink-soft leading-[1.45]">Importez un export existant, ou simulez des données de démo pour évaluer Weave immédiatement.</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="md" icon={<Upload size={15} />}>Importer un export</Button>
            <a href="/espace-de-travail" className="no-underline"><Button variant="dark" size="md" icon={<Zap size={15} />}>Simuler des données de démo</Button></a>
          </div>
        </div>
      </div>

      {/* CONFIG OVERLAY */}
      {dc && (
        <>
          <div className="fixed inset-0 z-50 bg-black/15" onClick={() => setDrawer(null)} />
          <div className={`wv-scroll ${panelClasses} ${modeClasses}`} role="dialog" aria-label="Configurer la source" style={panelShadow}>
            <div className="flex items-center justify-between gap-3 p-4 px-[18px] border-b border-line shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-[34px] h-[34px] rounded-lg bg-ink text-white inline-flex items-center justify-center text-base font-semibold shrink-0">{dc.name.charAt(0)}</span>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-ink">Configurer {dc.name}</div>
                  <div className="text-[12px] text-muted">Choisissez les éléments et le rattachement.</div>
                </div>
              </div>
              <button type="button" onClick={() => setDrawer(null)} aria-label="Fermer" className="border-none bg-transparent cursor-pointer text-muted p-1 rounded-md shrink-0"><X size={18} /></button>
            </div>

            <div className="p-[18px] overflow-y-auto flex-1">
              <div className="flex items-center gap-2.5 p-[10px_12px] border border-line rounded-lg bg-surface">
                <Lock size={16} color="var(--lvl-team)" className="shrink-0" />
                <div className="flex-1 min-w-0"><div className="text-[12.5px] font-medium text-ink">Accès en lecture seule</div><div className="text-[11px] text-muted">Weave ne peut jamais écrire dans {dc.name}.</div></div>
                <Badge tone="team">verrouillé</Badge>
              </div>

              {dc.things.length > 0 && (
                <div className="mt-4">
                  <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">{dc.itemsLabel}</div>
                  <div className="flex flex-col gap-1.5">
                    {dc.things.map((label, i) => {
                      const on = isSel(dc.id, i);
                      return (
                        <button key={i} type="button" onClick={() => setSel((s) => ({ ...s, [`${dc.id}:${i}`]: !on }))} className="flex items-center justify-between gap-2 w-full text-left cursor-pointer rounded-md p-[9px_11px] transition-colors duration-120" style={{ border: `1px solid ${on ? "color-mix(in srgb, var(--accent) 35%, var(--line))" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "var(--surface)" }}>
                          <span className="font-mono text-[12.5px] text-ink">{label}</span>
                          <span className="w-[18px] h-[18px] rounded-[5px] shrink-0 inline-flex items-center justify-center" style={{ background: on ? "var(--accent)" : "transparent", border: on ? "1px solid var(--accent)" : "1px solid var(--line)" }}>{on && <Check size={12} color="#fff" strokeWidth={3} />}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">Rattacher à</div>
                <Select value={dTeam} onChange={(e) => setDrawerTeam((s) => ({ ...s, [dc.id]: e.target.value }))} options={TEAM_OPTIONS} />
              </div>

              <div className="mt-4 border border-line rounded-lg bg-subtle p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-1.5">Aperçu de l&apos;ingestion</div>
                <div className="text-[12.5px] text-ink-soft leading-relaxed">{drawerPreview}</div>
              </div>

              <div className="mt-3 flex gap-2 items-start text-[11.5px] text-muted leading-relaxed">
                <Shield size={14} className="shrink-0 mt-[1px]" />Aucune donnée n&apos;est réécrite dans vos outils. Le parsing peut tourner en local (Ollama) — rien ne quitte votre infrastructure.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-3.5 px-[18px] border-t border-line shrink-0 bg-surface">
              <Button variant="ghost" size="md" onClick={() => setDrawer(null)}>Annuler</Button>
              <Button variant="primary" size="md" disabled={drawerBusy} onClick={onSave} className={drawerMode === "sheet" ? "flex-1 justify-center" : undefined} icon={drawerBusy ? <LoaderCircle size={15} className="wv-spin" /> : <Check size={15} />}>{drawerBusy ? "Connexion…" : "Enregistrer & connecter"}</Button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-60 flex items-center gap-2.5 p-[10px_14px] rounded-lg bg-ink text-white text-[13px] max-w-[calc(100%-32px)]" style={{ boxShadow: "0 4px 14px rgba(15,15,15,0.16)" }}>
          <Check size={15} color="var(--accent)" className="shrink-0" /><span>{toast}</span>
          <a href="/" className="text-white underline whitespace-nowrap font-medium">Voir le workspace</a>
        </div>
      )}
    </WeaveShell>
  );
}
