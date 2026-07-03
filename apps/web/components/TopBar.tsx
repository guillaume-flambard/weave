import { HelpCircle } from "lucide-react";
import type { OrgCfg } from "../lib/types";

export function TopBar({
  orgId,
  presets,
  llm,
  connected,
  pendingAction,
  onStartTour,
  onSwitchOrg,
  onReset,
  onSimulate,
}: {
  orgId: string;
  presets: OrgCfg[];
  llm: string;
  connected: boolean;
  pendingAction: string | null;
  onStartTour: () => void;
  onSwitchOrg: (id: string) => void;
  onReset: () => void;
  onSimulate: () => void;
}) {
  return (
    <header className="mb-4 flex items-center justify-between border-b border-line pb-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink">
          <svg viewBox="0 0 100 100" className="h-5 w-5" fill="none" aria-label="Weave">
            <path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="78" cy="30" r="7" fill="#2383e2" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-ink">Weave</h1>
            <span className="rounded-full border border-line bg-subtle px-2 py-0.5 text-[11px] text-ink-soft">Cognitive Runtime</span>
          </div>
          <p className="text-xs text-muted">Bac à sable · votre équipe utilise l&apos;IA sur plusieurs projets, regardez la mémoire se créer</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <button onClick={onStartTour} className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-soft hover:bg-subtle">
          <HelpCircle size={15} strokeWidth={2} /> Visite guidée
        </button>
        <select value={orgId} onChange={(e) => onSwitchOrg(e.target.value)} disabled={pendingAction === "switchOrg"}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none hover:bg-subtle disabled:opacity-60">
          {presets.map((p) => <option key={p.org} value={p.org}>{p.name}</option>)}
        </select>
        {llm && <span className="rounded-md border border-line bg-subtle px-2 py-1 text-[11px] text-ink-soft">{llm}</span>}
        <span className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${connected ? "text-accent-deep bg-accent-soft" : "text-muted bg-subtle border border-line"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-accent" : "bg-muted"}`} />{connected ? "en direct" : "hors ligne"}
        </span>
        <button onClick={onReset} disabled={pendingAction === "reset"} className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft hover:bg-subtle disabled:opacity-60">{pendingAction === "reset" ? "Réinitialisation…" : "Réinitialiser"}</button>
        <button data-tour="simulate" onClick={onSimulate} disabled={pendingAction === "simulate"} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-deep disabled:opacity-60">{pendingAction === "simulate" ? "Simulation…" : "Simuler l'activité"}</button>
      </div>
    </header>
  );
}
