"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bot, Sparkles, Route, Shield, MessageSquare, TrendingUp, Check, Play, Info,
  ChevronRight, ChevronDown, List, GitBranch, Clock,
} from "lucide-react";
import { Button, Badge, Avatar } from "../../components/ui/primitives";
import { Panel, AnswerBlock, EmptyState } from "../../components/ui/workspace-ui";
import { WeaveShell } from "../../components/layout/weave-shell";
import { useWeaveProject } from "../../hooks/use-weave-project";
import { useViewport } from "../../hooks/use-viewport";
import type { AgentRun, TraceStep } from "../../lib/types";

type Kind = "plan" | "delegate" | "verify" | "respond";

const GUARDRAILS = ["profondeur max 2", "≤ 3 agents", "budget 30 s"];
const KIND_COLOR: Record<Kind, string> = { plan: "var(--ink)", delegate: "var(--lvl-project)", verify: "var(--lvl-team)", respond: "var(--accent)" };
const KIND_LABEL: Record<Kind, string> = { plan: "plan", delegate: "délégation", verify: "vérification", respond: "réponse" };
const KIND_FG: Record<Kind, string> = { plan: "var(--ink-soft)", delegate: "var(--lvl-project)", verify: "var(--lvl-team)", respond: "var(--accent-deep)" };
const KIND_BG: Record<Kind, string> = { plan: "var(--subtle)", delegate: "var(--lvl-project-bg)", verify: "var(--lvl-team-bg)", respond: "var(--accent-soft)" };

function inferKind(action: string): Kind {
  const a = action.toLowerCase();
  if (a.includes("délégu") || a.includes("deleg")) return "delegate";
  if (a.includes("vérif") || a.includes("verif")) return "verify";
  if (a.includes("plan")) return "plan";
  return "respond";
}

function mapTrace(trace: TraceStep[]) {
  return trace.map((s) => ({
    kind: inferKind(s.action),
    agent: s.agent,
    action: s.action,
    depth: s.depth,
    note: s.note,
  }));
}

const DEFAULT_TASK = "Comment relancer la synchro bancaire d'un client ?";

export default function AgentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <AgentPageInner />
    </Suspense>
  );
}

function AgentPageInner() {
  const { width: w } = useViewport();
  const weave = useWeaveProject();
  const params = useSearchParams();
  const agentName = params.get("name") || "specialiste-data-finance-ops";

  const agent = useMemo(
    () => weave.agents.find((a) => a.name === agentName) ?? weave.agents.find((a) => a.status === "pending") ?? null,
    [weave.agents, agentName],
  );

  const [runResult, setRunResult] = useState<AgentRun | null>(null);
  const [running, setRunning] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [justApproved, setJustApproved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true, 1: true });
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pulseT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const on = () => setCollapsed((window.scrollY || 0) > 130);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => () => { clearTimeout(toastT.current); clearTimeout(pulseT.current); }, []);

  const isLoading = weave.loading;
  const isNotFound = !weave.loading && !agent;
  const isActive = agent?.status === "active";
  const isPending = agent?.status === "pending";
  const isNarrow = w < 768;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const TRACE = runResult ? mapTrace(runResult.trace) : isPending ? [] : [];

  const onApprove = useCallback(async () => {
    if (!agent) return;
    await weave.approveAgent(agent.name);
    setJustApproved(true);
    setToast(`Agent approuvé · ${agent.name} est actif`);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 3200);
    clearTimeout(pulseT.current);
    pulseT.current = setTimeout(() => setJustApproved(false), 900);
  }, [agent, weave]);

  const onRun = useCallback(async () => {
    if (!agent || !isActive) return;
    setRunning(true);
    try {
      const run = await weave.runAgentTask(agent.name, DEFAULT_TASK);
      setRunResult(run);
    } finally {
      setRunning(false);
    }
  }, [agent, isActive, weave]);

  if (isNotFound) {
    return (
      <WeaveShell width={w} connected={weave.connected} llm={weave.llm}>
        <div className="max-w-[1360px] mx-auto p-6 flex justify-center">
          <div className="max-w-[440px] w-full text-center border border-line rounded-lg bg-surface p-[32px_28px] mt-8 box-border">
            <div className="mt-4 text-[16px] font-semibold">Agent introuvable</div>
            <div className="mt-1.5 text-sm text-ink-soft leading-relaxed">Lancez une simulation sur l&apos;espace de travail pour faire émerger des agents.</div>
            <div className="mt-[18px]"><a href="/" className="no-underline"><Button variant="secondary">← Espace de travail</Button></a></div>
          </div>
        </div>
      </WeaveShell>
    );
  }

  const cluster = (agent?.skills ?? []).map((name) => ({ name, uses: 0 }));

  return (
    <WeaveShell width={w} connected={weave.connected} llm={weave.llm}>
      <div className="max-w-[1360px] mx-auto px-6 pb-24">
        <nav aria-label="Fil d'ariane" className="pt-4 flex items-center gap-[7px] text-[12.5px] text-muted">
          <a href="/" className="text-muted no-underline">Agents</a><span>/</span>
          <span className="font-mono text-ink-soft">{agent?.name}</span>
        </nav>

        <div className="sticky top-0 z-20 bg-bg mb-4"
          style={{
            padding: collapsed ? "12px 0" : "18px 0 20px",
            borderBottom: collapsed ? "1px solid var(--line)" : "1px solid transparent",
          }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <Bot size={17} className={`shrink-0 ${isActive ? "text-accent" : "text-lvl-org"}`} />
                <span className="font-mono text-lg font-semibold text-ink break-words">{agent?.name}</span>
                <span className={justApproved && !reduce ? "wv-pulse" : undefined}>
                  <Badge tone={isActive ? "active" : "pending"}>{isActive ? "actif" : "en attente d'approbation"}</Badge>
                </span>
              </div>
              {!collapsed && agent && (
                <div className="mt-2 flex items-center gap-2 flex-wrap text-[12.5px] text-muted">
                  {agent.team && <><span>équipe {agent.team}</span><span>·</span></>}
                  <span>domaine {agent.domain}</span><span>·</span><span>dérivé de {agent.skills.length} compétences</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isPending ? (
                <Button variant="dark" size="md" icon={<Check size={15} />} onClick={onApprove}>Approuver</Button>
              ) : (
                <Button variant="primary" size="md" icon={<Play size={14} />} onClick={onRun} disabled={running}>{running ? "Exécution…" : "Lancer une tâche"}</Button>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="wv-shimmer h-[200px] rounded-lg" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
            <div className="flex flex-col gap-4 min-w-0">
              <Panel title="Compétences sources" icon={<Sparkles size={15} strokeWidth={2} />} count={agent?.skills.length ?? 0}>
                <div className="flex flex-wrap gap-2">
                  {cluster.map((s) => (
                    <a key={s.name} href={`/competence?name=${encodeURIComponent(s.name)}`} className="flex items-center gap-[7px] no-underline border border-line rounded-lg bg-surface flex-1 min-w-[200px] p-[9px_11px]">
                      <Sparkles size={14} color="var(--accent)" />
                      <span className="font-mono text-[12.5px] text-ink">{s.name}</span>
                    </a>
                  ))}
                </div>
              </Panel>

              <Panel title="Trace de raisonnement" icon={<Route size={15} strokeWidth={2} />} subtitle={TRACE.length ? "Plan → déléguer → vérifier" : "Lancez une tâche pour voir la trace."}>
                <div className="flex flex-wrap gap-1.5 mb-3.5">
                  {GUARDRAILS.map((g) => <span key={g} className="text-[11px] border border-line rounded-md p-[3px_8px] bg-subtle">{g}</span>)}
                </div>
                {TRACE.length === 0 ? (
                  <EmptyState>{isPending ? "Approuvez l'agent puis lancez une tâche." : "Aucune exécution pour l'instant."}</EmptyState>
                ) : (
                  TRACE.map((s, i) => {
                    const open = !!expanded[i];
                    const StepIcon = s.kind === "plan" ? List : s.kind === "delegate" ? GitBranch : s.kind === "verify" ? Check : MessageSquare;
                    return (
                      <div key={i} className="mb-3" style={{ marginLeft: s.depth * (isNarrow ? 16 : 28) }}>
                        <button type="button" onClick={() => setExpanded((p) => ({ ...p, [i]: !p[i] }))} className="w-full text-left border-0 bg-transparent cursor-pointer flex gap-2.5 items-start">
                          <span className="inline-flex items-center justify-center shrink-0 w-6 h-6 rounded-full" style={{ background: KIND_COLOR[s.kind] }}><StepIcon size={12} color="#fff" /></span>
                          <span className="flex-1">
                            <span className="text-sm font-semibold">{s.action}</span>
                            <span className="block font-mono text-[11px] text-muted">{s.agent}</span>
                            {open && <span className="block mt-1.5 text-[12.5px] text-ink-soft">{s.note}</span>}
                          </span>
                        </button>
                      </div>
                    );
                  })
                )}
              </Panel>

              {runResult && (
                <Panel title="Réponse produite" icon={<MessageSquare size={15} strokeWidth={2} />}>
                  <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{runResult.answer}</div>
                </Panel>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <Panel title="Gouvernance" icon={<Shield size={15} strokeWidth={2} />}>
                <Badge tone={isActive ? "active" : "pending"}>{isActive ? "actif" : "en attente"}</Badge>
                <p className="mt-3 text-xs text-ink-soft leading-relaxed">{agent?.derived_from}</p>
              </Panel>
              <Panel title="Activité" icon={<TrendingUp size={15} strokeWidth={2} />}>
                <div className="text-[12.5px] text-muted">{runResult ? "1 exécution récente" : "Aucune exécution"}</div>
              </Panel>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-60 rounded-lg bg-ink text-white text-sm" style={{ padding: "9px 14px" }}>{toast}</div>
      )}
    </WeaveShell>
  );
}
