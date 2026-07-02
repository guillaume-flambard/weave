"use client";

import { useRef } from "react";
import { Bot, Sparkles } from "lucide-react";
import { useWeaveDashboard } from "../hooks/use-weave-dashboard";
import { AskPanel } from "../components/AskPanel";
import { AgentsPanel } from "../components/AgentsPanel";
import { FeedPanel } from "../components/FeedPanel";
import { MemoryPanel } from "../components/MemoryPanel";
import { ScopeBar, getScopeLabel } from "../components/ScopeBar";
import { SkillsPanel } from "../components/SkillsPanel";
import { TopBar } from "../components/TopBar";
import { useGuidedTour } from "./tour";

export default function Page() {
  const { start: startTour, notifySkillEmerged } = useGuidedTour();
  const notifyRef = useRef(notifySkillEmerged);
  notifyRef.current = notifySkillEmerged;

  const {
    orgId,
    org,
    presets,
    scope,
    setScope,
    feed,
    skills,
    facts,
    agents,
    flash,
    newest,
    connected,
    llm,
    pendingAction,
    errorMessage,
    question,
    setQuestion,
    answer,
    asking,
    injectText,
    setInjectText,
    switchOrg,
    simulate,
    reset,
    ask,
    approveAgent,
    inject,
  } = useWeaveDashboard(() => notifyRef.current());

  // scope filtering
  const inScope = (team: string, ws: string) =>
    (!scope.team || team === scope.team) && (!scope.workstream || ws === scope.workstream);
  const fFacts = facts.filter((f) => inScope(f.team, f.workstream));
  const orgSkills = skills.filter((s) => s.memory_level === "organization");
  const projSkills = skills.filter((s) => s.memory_level !== "organization" && inScope(s.team, s.workstream));
  const fAgents = agents.filter((a) => !scope.team || a.team === scope.team || a.team === "");

  const scopeLabel = getScopeLabel(org, scope) ?? "Toute l'organisation";

  return (
    <main className="mx-auto max-w-[1360px] px-6 py-6">
      <TopBar
        orgId={orgId}
        presets={presets}
        llm={llm}
        connected={connected}
        pendingAction={pendingAction}
        onStartTour={startTour}
        onSwitchOrg={switchOrg}
        onReset={reset}
        onSimulate={simulate}
      />

      <ScopeBar org={org} scope={scope} setScope={setScope} scopeLabel={scopeLabel} />

      {errorMessage && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-medium">Erreur :</span> {errorMessage}
        </div>
      )}

      {flash && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm animate-emerge ${
          flash.kind === "agent" ? "border-lvl-org/50 bg-lvl-org-bg text-lvl-org"
          : flash.kind === "org" ? "border-lvl-org/40 bg-lvl-org-bg text-lvl-org"
          : "border-accent/40 bg-accent-soft text-accent-deep"}`}>
          <span className="flex items-center">{flash.kind === "agent" ? <Bot size={16} /> : <Sparkles size={16} />}</span>
          <span className="font-medium">{flash.msg}</span>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <FeedPanel feed={feed} />
        <MemoryPanel facts={fFacts} scopeLabel={scopeLabel} scoped={Boolean(scope.team)} />
        <SkillsPanel orgSkills={orgSkills} projSkills={projSkills} newest={newest} />
      </div>

      <AgentsPanel
        agents={fAgents}
        newest={newest}
        pendingAction={pendingAction}
        injectText={injectText}
        setInjectText={setInjectText}
        inject={inject}
        approveAgent={approveAgent}
        scopeLabel={scopeLabel}
        scopedToWorkstream={Boolean(scope.workstream)}
      />

      <AskPanel
        question={question}
        setQuestion={setQuestion}
        ask={ask}
        asking={asking}
        pendingAction={pendingAction}
        answer={answer}
      />

      <footer className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
        Rust · Axum · Postgres/pgvector · Ollama (local) · MCP — mémoire scopée perso → équipe → projet → organisation
      </footer>
    </main>
  );
}
