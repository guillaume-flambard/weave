import { Icons, LEVEL_STYLE, PanelTitle, SubHead } from "./dashboard-ui";
import type { Answer } from "../lib/types";

export function AskPanel({
  question,
  setQuestion,
  ask,
  asking,
  pendingAction,
  answer,
}: {
  question: string;
  setQuestion: (value: string) => void;
  ask: () => void;
  asking: boolean;
  pendingAction: string | null;
  answer: Answer | null;
}) {
  return (
    <section data-tour="ask" data-testid="ask-panel" className="mt-4 rounded-lg border border-line bg-surface p-4">
      <PanelTitle icon={<Icons.MessageSquare size={15} strokeWidth={2} />}>Interroger la mémoire partagée</PanelTitle>
      <div className="mt-3 flex gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
          className="flex-1 rounded-md border border-line bg-subtle px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:bg-surface"
          placeholder="Posez une question à l'organisation…" />
        <button onClick={ask} disabled={asking || pendingAction === "ask"} className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-deep disabled:opacity-50">{pendingAction === "ask" ? "Recherche…" : asking ? "…" : "Demander"}</button>
      </div>
      {answer && (
        <div className="mt-4 grid grid-cols-12 gap-4">
          <div className="col-span-7">
            {answer.skill_used && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2 py-1 text-xs text-accent-deep">
                <Icons.Sparkles size={12} /> compétence utilisée : <span className="font-mono">{answer.skill_used}</span>
              </div>
            )}
            <div className="whitespace-pre-wrap rounded-lg border border-line bg-subtle p-3 text-sm leading-relaxed text-ink">{answer.answer}</div>
          </div>
          <div className="col-span-5">
            <SubHead>Provenance · couches mémoire</SubHead>
            <div className="space-y-2">
              {answer.layers.map((l) => (
                <div key={l.level} className={`rounded-md border p-2 ${LEVEL_STYLE[l.level] || "border-line"}`}>
                  <div className="text-xs font-semibold capitalize">{l.level}</div>
                  <ul className="mt-1 space-y-0.5">
                    {l.facts.slice(0, 4).map((f: { content: string; author: string; ftype: string }, i: number) => <li key={i} className="text-[11px] text-ink-soft"><span className="opacity-70">{f.author} :</span> {f.content}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
