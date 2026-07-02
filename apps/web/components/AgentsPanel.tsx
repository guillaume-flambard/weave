import { Empty, Icons, PanelTitle, SubHead } from "./dashboard-ui";
import type { Agent } from "../lib/types";

export function AgentsPanel({
  agents,
  newest,
  pendingAction,
  injectText,
  setInjectText,
  inject,
  approveAgent,
  scopeLabel,
  scopedToWorkstream,
}: {
  agents: Agent[];
  newest: string | null;
  pendingAction: string | null;
  injectText: string;
  setInjectText: (value: string) => void;
  inject: () => void;
  approveAgent: (name: string) => void;
  scopeLabel: string;
  scopedToWorkstream: boolean;
}) {
  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-4">
      <PanelTitle icon={<Icons.Bot size={15} strokeWidth={2} />} count={agents.length}>Agents · un spécialiste par équipe, né de ses compétences</PanelTitle>
      <div className="mt-3 grid grid-cols-12 gap-4">
        <div className="col-span-5 space-y-2">
          {agents.length === 0 && <Empty>Aucun agent visible dans ce scope.</Empty>}
          {agents.map((a) => (
            <div key={a.id} className={`rounded-lg border p-3 ${
              a.name === newest && a.status === "pending" ? "border-lvl-org bg-lvl-org-bg animate-emerge"
              : a.status === "pending" ? "border-lvl-org/60 bg-lvl-org-bg" : "border-line bg-subtle"}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-sm font-medium text-ink">
                  {a.status === "pending" ? <Icons.CircleDot size={13} className="text-lvl-org" /> : a.domain === "general" ? <Icons.Circle size={13} className="text-muted" /> : <Icons.Sparkles size={13} className="text-accent" />}
                  {a.name}
                </span>
                {a.status === "pending"
                  ? <button onClick={() => approveAgent(a.name)} disabled={pendingAction === "approveAgent"} className="rounded-md bg-ink px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-ink-soft disabled:opacity-60">{pendingAction === "approveAgent" ? "Validation…" : "Approuver"}</button>
                  : <span className="rounded-md border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent-deep">actif</span>}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">{a.derived_from}</div>
              {a.skills.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {a.skills.map((s: string) => <span key={s} className="rounded bg-subtle px-1.5 py-0.5 text-[10px] text-ink-soft">✦ {s.split("/").pop()}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="col-span-7">
          <SubHead>Injecter un message (vous jouez un membre de l&apos;équipe)</SubHead>
          <div className="flex gap-2">
            <input
              value={injectText}
              onChange={(e) => setInjectText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && inject()}
              className="flex-1 rounded-md border border-line bg-subtle px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:bg-surface"
              placeholder={scopedToWorkstream ? `Message dans ${scopeLabel}…` : "Sélectionnez une équipe/projet dans la barre de vue, puis écrivez…"}
            />
            <button
              onClick={inject}
              disabled={pendingAction === "inject"}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-soft disabled:opacity-60"
            >
              {pendingAction === "inject" ? "Envoi…" : "Envoyer"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Répétez une même question dans un projet (5×) et regardez une compétence naître. Posez la même dans deux équipes → une compétence d&apos;organisation.
          </p>
        </div>
      </div>
    </section>
  );
}
