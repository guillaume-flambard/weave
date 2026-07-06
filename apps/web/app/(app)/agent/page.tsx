"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bot, Sparkles, Route, Shield, MessageSquare, Check, Play, Zap, GitBranch,
  List, ChevronDown, Plug, Layers, ArrowRight,
} from "lucide-react";
import { Button, Badge } from "../../../components/ui/primitives";
import { Panel, EmptyState } from "../../../components/ui/workspace-ui";
import { PageSkeleton, PageSuspenseFallback } from "../../../components/ui/page-skeleton";
import { useShellHeader } from "../../../components/layout/use-shell-header";
import { useT } from "../../../lib/i18n/context";
import { useWeaveProject } from "../../../hooks/use-weave-project";
import { useViewport } from "../../../hooks/use-viewport";
import type { AgentRun, TraceStep } from "../../../lib/types";

type Kind = "plan" | "delegate" | "verify" | "respond";
const LEVELS = ["personal", "team", "project", "organization"] as const;
const KIND_COLOR: Record<Kind, string> = { plan: "var(--ink)", delegate: "var(--lvl-project)", verify: "var(--lvl-team)", respond: "var(--accent)" };

function inferKind(action: string): Kind {
  const a = action.toLowerCase();
  if (a.includes("délégu") || a.includes("deleg")) return "delegate";
  if (a.includes("vérif") || a.includes("verif")) return "verify";
  if (a.includes("plan")) return "plan";
  return "respond";
}

const DEFAULT_TASK_KEY = "workspace.ask.defaultQuestion";

function AgentPageInner() {
  const { width: w } = useViewport();
  const t = useT();
  const weave = useWeaveProject();
  const params = useSearchParams();
  const agentName = params.get("name");

  const agent = useMemo(
    () => (agentName ? weave.agents.find((a) => a.name === agentName) ?? null : null),
    [weave.agents, agentName],
  );

  const sourceSkills = useMemo(
    () => (agent ? weave.skills.filter((s) => agent.skills.includes(s.name)) : []),
    [weave.skills, agent],
  );
  const sources = useMemo(
    () => Array.from(new Set(sourceSkills.flatMap((s) => s.sources ?? []))),
    [sourceSkills],
  );

  const [runResult, setRunResult] = useState<AgentRun | null>(null);
  const [running, setRunning] = useState(false);
  const [justApproved, setJustApproved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true, 1: true });
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pulseT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => { clearTimeout(toastT.current); clearTimeout(pulseT.current); }, []);

  const isLoading = weave.loading;
  const isNotFound = weave.dataReady && !!agentName && !agent;
  const isActive = agent?.status === "active";
  const isPending = agent?.status === "pending";
  const isNarrow = w < 768;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const TRACE = runResult
    ? runResult.trace.map((s: TraceStep) => ({ kind: inferKind(s.action), agent: s.agent, action: s.action, depth: s.depth, note: s.note }))
    : [];

  const onApprove = useCallback(async () => {
    if (!agent) return;
    await weave.approveAgent(agent.name);
    setJustApproved(true);
    setToast(t("agentDetail.approved", { name: agent.name }));
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 3200);
    clearTimeout(pulseT.current);
    pulseT.current = setTimeout(() => setJustApproved(false), 900);
  }, [agent, weave, t]);

  const onRun = useCallback(async () => {
    if (!agent || !isActive) return;
    setRunning(true);
    try {
      setRunResult(await weave.runAgentTask(agent.name, t(DEFAULT_TASK_KEY)));
      setTraceOpen(true);
    } finally {
      setRunning(false);
    }
  }, [agent, isActive, weave, t]);

  useShellHeader({ subtitle: agent?.name ?? t("agentDetail.breadcrumb") });

  if (isLoading) {
    return <PageSkeleton variant={agentName ? "detail" : "list"} />;
  }

  if (!agentName) {
    return (
      <div className="max-w-[860px] mx-auto px-6 pb-24">
        <h1 className="pt-6 text-[22px] font-semibold text-ink">{t("agentDetail.breadcrumb")}</h1>
        <p className="mt-1 text-sm text-muted">{t("library.subtitle")}</p>
        {weave.agents.length === 0 ? (
          <div className="mt-6 border border-line rounded-2xl bg-surface p-6 text-center">
            <Bot size={24} className="mx-auto text-muted" />
            <p className="mt-3 text-sm font-medium text-ink m-0">{t("library.emptyTitle")}</p>
            <p className="mt-1.5 text-sm text-ink-soft m-0">{t("library.emptyBody")}</p>
            <Link href="/" className="inline-block mt-4 no-underline">
              <Button variant="secondary">{t("library.goIngest")}</Button>
            </Link>
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-2">
            {weave.agents.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/agent?name=${encodeURIComponent(a.name)}`}
                  className="flex items-center gap-2.5 no-underline border border-line rounded-lg bg-surface p-[11px_14px] hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--line))]"
                >
                  <Bot size={15} className="text-accent shrink-0" />
                  <span className="font-mono text-sm text-ink truncate flex-1">{a.name}</span>
                  <Badge tone={a.status === "active" ? "active" : "pending"}>
                    {a.status === "active" ? t("agentDetail.statusActive") : t("agentDetail.statusPending")}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="max-w-[1080px] mx-auto p-6 flex justify-center">
        <div className="max-w-[440px] w-full text-center border border-line rounded-2xl bg-surface p-[32px_28px] mt-8 box-border wv-fade-in">
          <Bot size={26} className="mx-auto text-muted" />
          <div className="mt-4 text-[16px] font-semibold">{t("agent.notFoundTitle")}</div>
          <div className="mt-1.5 text-sm text-ink-soft leading-relaxed">{t("agent.notFoundBody")}</div>
          {agentName && (
            <div className="mt-3 font-mono text-[11.5px] text-muted break-all px-2">{agentName}</div>
          )}
          <div className="mt-[18px] flex justify-center gap-2 flex-wrap">
            <Link href="/agent" className="no-underline">
              <Button variant="secondary">{t("agentDetail.breadcrumb")}</Button>
            </Link>
            <Link href="/" className="no-underline">
              <Button variant="ghost">{t("library.goIngest")}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const guardrails = [t("agentDetail.guardrailDepth"), t("agentDetail.guardrailAgents"), t("agentDetail.guardrailBudget")];

  return (
    <>
      <div className="max-w-[860px] mx-auto px-6 pb-24">
        <nav aria-label={t("agentDetail.breadcrumb")} className="pt-5 flex items-center gap-[7px] text-[12.5px] text-muted">
          <Link href="/agent" className="text-muted no-underline hover:text-ink-soft">{t("agentDetail.breadcrumb")}</Link><span>/</span>
          <span className="font-mono text-ink-soft">{agent?.name}</span>
        </nav>

        <div className="pt-4 pb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <Bot size={22} className={`shrink-0 ${isActive ? "text-accent" : "text-lvl-org"}`} />
                <span className="font-mono text-[22px] font-semibold text-ink break-all tracking-[-0.01em]">{agent?.name}</span>
                <span className={justApproved && !reduce ? "wv-pulse" : undefined}>
                  <Badge tone={isActive ? "active" : "pending"}>{isActive ? t("agentDetail.statusActive") : t("agentDetail.statusPending")}</Badge>
                </span>
              </div>
              {agent && (
                <div className="mt-2 flex items-center gap-2 flex-wrap text-[12.5px] text-muted">
                  {agent.team && <><span>{t("agentDetail.metaTeam", { team: agent.team })}</span><span>·</span></>}
                  <span>{t("agentDetail.metaDomain", { domain: agent.domain })}</span><span>·</span>
                  <span>{t("agentDetail.metaSkills", { count: agent.skills.length })}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isPending ? (
                <Button variant="dark" size="md" icon={<Check size={15} />} onClick={onApprove}>{t("agentDetail.approve")}</Button>
              ) : (
                <Button variant="primary" size="md" icon={<Play size={14} />} onClick={onRun} disabled={running}>{running ? t("agentDetail.running") : t("agentDetail.run")}</Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
            {/* Block 1 — Triggers */}
            <Panel title={t("agentDetail.triggersTitle")} icon={<Zap size={15} strokeWidth={2} />} subtitle={t("agentDetail.triggersSubtitle")}>
              <div className="flex flex-col gap-2.5">
                <BlockRow icon={<Play size={14} className="text-accent" />} title={t("agentDetail.triggerManualTitle")} body={t("agentDetail.triggerManualBody")} />
                <BlockRow
                  icon={<GitBranch size={14} style={{ color: "var(--lvl-project)" }} />}
                  title={t("agentDetail.triggerEmergenceTitle")}
                  body={agent?.team ? t("agentDetail.triggerEmergenceBody", { team: agent.team }) : t("agentDetail.triggerEmergenceBodyOrg")}
                />
              </div>
            </Panel>

            {/* Block 2 — Instructions */}
            <Panel title={t("agentDetail.instructionsTitle")} icon={<List size={15} strokeWidth={2} />} subtitle={t("agentDetail.instructionsSubtitle")}>
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("agentDetail.mandate")}</h3>
                <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">{agent?.role || agent?.derived_from}</p>
              </div>
              <div className="mt-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("agentDetail.playbook")}</h3>
                {sourceSkills.length === 0 ? (
                  <div className="mt-1.5"><EmptyState>{t("agentDetail.noSkills")}</EmptyState></div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sourceSkills.map((s) => (
                      <Link key={s.id} href={`/competence?name=${encodeURIComponent(s.name)}`} className="group flex items-center gap-[7px] no-underline border border-line rounded-lg bg-surface flex-1 min-w-[220px] p-[9px_11px] hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--line))]">
                        <Sparkles size={14} color="var(--accent)" className="shrink-0" />
                        <span className="font-mono text-[12.5px] text-ink truncate flex-1">{s.name}</span>
                        <ArrowRight size={13} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </Panel>

            {/* Block 3 — Tools & access */}
            <Panel title={t("agentDetail.toolsTitle")} icon={<Shield size={15} strokeWidth={2} />} subtitle={t("agentDetail.toolsSubtitle")}>
              <div className="flex items-start gap-2.5">
                <Layers size={14} className="mt-1 text-muted shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("agentDetail.memoryLayers")}</h3>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {LEVELS.map((lvl) => <Badge key={lvl} tone={lvl}>{t(`levels.${lvl}`)}</Badge>)}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2.5">
                <Plug size={14} className="mt-1 text-muted shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("agentDetail.connectedSources")}</h3>
                  {sources.length === 0 ? (
                    <div className="mt-1.5"><EmptyState>{t("agentDetail.noSources")}</EmptyState></div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {sources.map((src) => <span key={src} className="text-[11px] border border-line rounded-md px-2 py-[3px] bg-subtle text-ink-soft">{src}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2.5">
                <Shield size={14} className="mt-1 text-muted shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("agentDetail.guardrails")}</h3>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {guardrails.map((g) => <span key={g} className="text-[11px] border border-line rounded-md px-2 py-[3px] bg-subtle text-ink-soft">{g}</span>)}
                  </div>
                </div>
              </div>
            </Panel>

            {/* Progressive disclosure — reasoning + response */}
            <div className="border border-line rounded-2xl bg-surface">
              <button type="button" onClick={() => setTraceOpen((o) => !o)} className="w-full flex items-center gap-2 py-3 px-[14px] cursor-pointer bg-transparent border-0 text-left">
                <Route size={15} strokeWidth={2} className="text-ink-soft" />
                <span className="text-sm font-semibold text-ink flex-1">{t("agentDetail.reasoningTitle")}</span>
                <span className="text-[11px] text-muted">{TRACE.length ? t("agentDetail.reasoningHint") : t("agentDetail.reasoningRunHint")}</span>
                <ChevronDown size={16} className={`text-muted transition-transform duration-150 ${traceOpen ? "rotate-180" : ""}`} />
              </button>
              {traceOpen && (
                <div className="px-[14px] pb-[14px] border-t border-line-soft pt-3.5">
                  {TRACE.length === 0 ? (
                    <EmptyState>{isPending ? t("agentDetail.reasoningEmptyPending") : t("agentDetail.reasoningEmpty")}</EmptyState>
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
                </div>
              )}
            </div>

            {runResult && (
              <Panel title={t("agentDetail.responseTitle")} icon={<MessageSquare size={15} strokeWidth={2} />}>
                <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink">{runResult.answer}</div>
              </Panel>
            )}
          </div>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-60 rounded-lg bg-ink text-white text-sm" style={{ padding: "9px 14px" }}>{toast}</div>
      )}
    </>
  );
}

function BlockRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-2.5 border border-line rounded-lg bg-subtle p-[11px_12px]">
      <span className="mt-0.5 inline-flex shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{title}</div>
        <div className="mt-0.5 text-[12.5px] text-ink-soft leading-normal">{body}</div>
      </div>
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={<PageSuspenseFallback />}>
      <AgentPageInner />
    </Suspense>
  );
}
