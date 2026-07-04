"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bot, Brain, Building2, GitBranch, MessagesSquare, NotebookText, Plug, Shield, Sparkles, Zap,
} from "lucide-react";
import { Button, Badge } from "../ui/primitives";
import { AnswerBlock, Card, ProgressBar } from "../ui/workspace-ui";
import { ApiFeedRow } from "../workspace/api-feed-row";
import { authorizeUrl, fetchConnections, ingestNotion, ingestSlack } from "../../lib/api";
import {
  defaultConnectorStatus,
  primaryConnectors,
  secondaryConnectors,
  summaryConnectors,
} from "../../lib/connectors";
import { deriveKpis } from "../../lib/live-metrics";
import { getScopeLabel, inScope, orgToScopeTeams } from "../../lib/scope";
import { simProgressMetrics } from "../../hooks/use-weave-dashboard";
import { useT } from "../../lib/i18n/context";
import { OnboardingBlock } from "./onboarding/onboarding-block";
import { ONBOARDING_STEPS, stepIndexFor, type OnboardingStepId } from "./onboarding/onboarding-steps";
import type { WeaveChat } from "./use-weave-chat";
import type { ChatBlock } from "./types";

function ConnectorIcon({ id }: { id: string }) {
  const p = { size: 16 as const, strokeWidth: 2 as const };
  if (id === "slack") return <MessagesSquare {...p} />;
  if (id === "notion") return <NotebookText {...p} />;
  if (id === "github") return <GitBranch {...p} />;
  return <Plug {...p} />;
}

function ConnectorSetupBlock({ dash }: { dash: WeaveChat["dash"] }) {
  const t = useT();
  const orgId = dash.orgId;
  const primary = primaryConnectors(orgId);
  const secondary = secondaryConnectors(orgId);
  const [busy, setBusy] = useState<string | null>(null);
  // Providers that are really connected in the backend (from GET /connections).
  const [live, setLive] = useState<Set<string> | null>(null);
  // Providers with a real OAuth flow (button → full-page redirect).
  const OAUTH = new Set(["slack", "notion"]);
  // Post-redirect flash: "connected" | "error" from ?connected/?connect_error.
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; provider: string } | null>(null);

  // Load real connection state, and read the OAuth redirect result from the URL.
  useEffect(() => {
    let alive = true;
    fetchConnections()
      .then((conns) => {
        if (alive) setLive(new Set(conns.map((c) => c.provider)));
      })
      .catch(() => {
        // API unreachable (offline demo) → fall back to the demo profile.
        if (alive) setLive(null);
      });

    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const err = params.get("connect_error");
    if (connected) setFlash({ tone: "ok", provider: connected });
    else if (err) setFlash({ tone: "err", provider: err });
    if (connected || err) {
      // Clean the URL so a refresh doesn't re-flash.
      params.delete("connected");
      params.delete("connect_error");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    return () => {
      alive = false;
    };
  }, []);

  // OAuth providers (Slack, Notion): real backend state from GET /connections,
  // falling back to the demo profile only when the API is unreachable.
  const status = (id: string) => {
    if (live) {
      if (OAUTH.has(id)) return live.has(id) ? "connected" : "disconnected";
      return live.has(id) ? "connected" : defaultConnectorStatus(id, orgId);
    }
    return defaultConnectorStatus(id, orgId);
  };

  // Connect → full-page OAuth redirect to the backend (→ provider consent).
  const connect = (id: string) => {
    if (id !== "slack" && id !== "notion") return;
    setBusy(id);
    window.location.href = authorizeUrl(id);
  };

  // Sync is separate from connecting: pull content from the stored connection.
  const sync = async (id: string) => {
    setBusy(id);
    try {
      if (id === "slack") await ingestSlack(orgId);
      else if (id === "notion") await ingestNotion(orgId);
    } finally {
      setBusy(null);
    }
  };

  const renderRow = (c: (typeof primary)[0], isPrimary?: boolean) => {
    const connected = status(c.id) === "connected";
    const connectable = OAUTH.has(c.id);
    return (
      <div
        key={c.id}
        className={`wv-chat-block flex items-start gap-3 ${isPrimary ? "wv-connector-primary" : ""}`}
      >
        <span className="w-9 h-9 rounded-lg bg-subtle inline-flex items-center justify-center shrink-0 text-ink-soft">
          <ConnectorIcon id={c.id} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink">{c.name}</span>
            {connected && <Badge tone="active">{t("sources.connectedBadge")}</Badge>}
            {isPrimary && <Badge tone="team">{t("sources.primaryLabel")}</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-muted">{c.role}</div>
          {connected && c.items && (
            <div className="mt-1 text-[11px] text-muted">{c.items} · sync {c.lastSync}</div>
          )}
        </div>
        {!connected && connectable && (
          <Button variant="primary" size="sm" disabled={busy === c.id} onClick={() => connect(c.id)}>
            {busy === c.id ? "…" : t("chat.connect")}
          </Button>
        )}
        {connected && connectable && (
          <Button variant="secondary" size="sm" disabled={busy === c.id} onClick={() => sync(c.id)}>
            {busy === c.id ? "…" : t("sources.sync")}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {flash && (
        <div
          className={`rounded-md px-3 py-2 text-[13px] ${
            flash.tone === "ok"
              ? "bg-accent-soft text-accent-deep border border-accent/40"
              : "bg-[#fef2f2] text-[#b42318] border border-[#fecaca]"
          }`}
        >
          {flash.tone === "ok"
            ? t("sources.connectedFlash").replace("{provider}", flash.provider)
            : t("sources.errorFlash").replace("{provider}", flash.provider)}
        </div>
      )}
      <p className="m-0 text-[13px] text-ink-soft">{t("sources.primaryHint")}</p>
      {primary.map((c) => renderRow(c, true))}
      {secondary.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mt-2">{t("sources.otherIntegrations")}</div>
          {secondary.filter((c) => c.id !== "other").map((c) => renderRow(c))}
        </>
      )}
    </div>
  );
}

function MemorySnapshotBlock({ dash }: { dash: WeaveChat["dash"] }) {
  const t = useT();
  const scopeTeams = orgToScopeTeams(dash.org);
  const scopeLabel = getScopeLabel(dash.org, dash.scope);
  const facts = dash.facts.filter((f) => inScope(dash.scope, f.team, f.workstream)).slice(0, 5);
  const skills = dash.skills
    .filter((s) => s.memory_level === "organization" || inScope(dash.scope, s.team, s.workstream))
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-muted">{scopeLabel}</div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">{t("workspace.tabs.memory")}</div>
        <div className="flex flex-col gap-1.5">
          {facts.length === 0 ? (
            <p className="m-0 text-xs text-muted">{t("chat.emptyMemory")}</p>
          ) : facts.map((f) => (
            <Card key={f.id} tone="neutral" radius="md" padding="8px 10px">
              <div className="text-[11px] text-muted">{f.author} · {f.topic}</div>
              <div className="text-[12.5px] text-ink mt-0.5">{f.content}</div>
            </Card>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">{t("workspace.tabs.skills")}</div>
        <div className="flex flex-col gap-1.5">
          {skills.map((s) => (
            <Link key={s.id} href={`/competence?name=${encodeURIComponent(s.name)}`} className="no-underline">
              <Card tone={s.memory_level === "organization" ? "organization" : "accent"} radius="md" padding="8px 10px">
                <span className="font-mono text-xs text-ink">{s.name}</span>
              </Card>
            </Link>
          ))}
        </div>
      </div>
      {scopeTeams.length > 0 && (
        <p className="m-0 text-[11px] text-muted">{t("chat.scopeHint")}</p>
      )}
    </div>
  );
}

function AgentQueueBlock({ dash }: { dash: WeaveChat["dash"] }) {
  const t = useT();
  const pending = dash.agents.filter((a) => a.status === "pending");
  const active = dash.agents.filter((a) => a.status !== "pending");

  return (
    <div className="flex flex-col gap-3">
      {pending.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">{t("library.pending")}</div>
          {pending.map((a) => (
            <div key={a.id} className="wv-chat-block flex items-center justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="font-mono text-sm text-ink">{a.name}</div>
                <div className="text-xs text-muted mt-0.5">{a.derived_from}</div>
              </div>
              <Button
                variant="dark"
                size="sm"
                disabled={dash.pendingAction === "approveAgent"}
                onClick={() => dash.approveAgent(a.name)}
              >
                {t("common.approve")}
              </Button>
            </div>
          ))}
        </div>
      )}
      {active.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">{t("library.active")}</div>
          {active.map((a) => (
            <Link key={a.id} href={`/agent?name=${encodeURIComponent(a.name)}`} className="block no-underline mb-2">
              <div className="wv-chat-block flex items-center gap-2">
                <Bot size={14} className="text-accent shrink-0" />
                <span className="font-mono text-sm text-ink">{a.name}</span>
                <Badge tone="active">{t("common.active")}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
      {pending.length === 0 && active.length === 0 && (
        <p className="m-0 text-sm text-muted">{t("library.emptyBody")}</p>
      )}
    </div>
  );
}

function KpiOverviewBlock({ dash }: { dash: WeaveChat["dash"] }) {
  const t = useT();
  const k = deriveKpis(null, dash.skills, dash.agents, dash.facts, dash.scope);
  const items = [
    { label: t("overview.memoryGrowth"), value: k.memory, icon: Brain },
    { label: t("overview.featuredSkills"), value: k.skills, icon: Sparkles },
    { label: t("workspace.agents.title"), value: k.agents, icon: Bot },
    { label: t("overview.resolvedQuestions"), value: k.resolved, icon: Building2 },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="wv-chat-block">
          <div className="flex items-center gap-1.5 text-muted text-[11px] uppercase tracking-wider">
            <Icon size={13} />{label}
          </div>
          <div className="mt-2 text-2xl font-semibold text-ink tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}

function GovernanceSummaryBlock({ dash }: { dash: WeaveChat["dash"] }) {
  const t = useT();
  const sources = summaryConnectors(dash.orgId);
  const pending = dash.agents.filter((a) => a.status === "pending");

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">{t("overview.connectedSources")}</div>
        {sources.map((c) => {
          const st = defaultConnectorStatus(c.id, dash.orgId);
          return (
            <div key={c.id} className="wv-chat-block flex items-center gap-2 mb-2">
              <Plug size={14} className="text-muted" />
              <span className="text-sm text-ink">{c.name}</span>
              <Badge tone={st === "connected" ? "active" : "neutral"}>
                {st === "connected" ? t("sources.connectedBadge") : t("governance.sourcesDisconnected")}
              </Badge>
            </div>
          );
        })}
      </div>
      {pending.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">{t("library.pending")}</div>
          {pending.map((a) => (
            <div key={a.id} className="text-sm text-ink-soft font-mono">{a.name}</div>
          ))}
        </div>
      )}
      <Link href="/reglages" className="text-sm font-medium text-accent-deep no-underline hover:text-accent">
        {t("chat.openSettings")} →
      </Link>
    </div>
  );
}

function SimProgressBlock({ dash }: { dash: WeaveChat["dash"] }) {
  const t = useT();
  const p = dash.simProgress;
  if (!p) return null;
  const { processed, pct, target } = simProgressMetrics(p);
  const traceTypes = new Set(["event_ingested", "fact_extracted", "pattern_observed", "skill_emerged", "agent_emerged"]);
  const trace = dash.feed.filter((e) => traceTypes.has(e.type)).slice(0, 14);

  return (
    <div className="wv-chat-block" data-testid="ingestion-live">
      <div className="text-sm font-medium text-ink">{t("workspace.ingestion.running")}</div>
      <p className="mt-1.5 mb-0 text-[13px] text-ink-soft leading-relaxed">{t("workspace.ingestion.subtitle")}</p>
      <div className="mt-3 h-1.5 rounded-full bg-subtle overflow-hidden">
        <div className="wv-chat-progress-bar h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-muted tabular-nums">
        {t("workspace.ingestion.progress", { events: processed, target, facts: p.facts, skills: p.skills })}
      </div>
      {trace.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line-soft flex flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted font-medium">
            {t("workspace.ingestion.traceTitle")}
          </div>
          {trace.map((ev, i) => (
            <div key={`${ev.type}-${i}`} className="wv-chat-feed-in">
              <ApiFeedRow ev={ev} showPipelineStep />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatBlockView({ block, chat }: { block: ChatBlock; chat: WeaveChat }) {
  const t = useT();
  const { dash, onboarding, handleOnboardingAction, handleOnboardingSkip, busy } = chat;

  if (block.type === "text") {
    return (
      <div className={block.role === "user" ? "text-[15px] text-ink font-medium py-1" : "text-[14px] text-ink-soft leading-[1.6] whitespace-pre-wrap"}>
        {block.content}
      </div>
    );
  }

  if (block.type === "system") {
    const tone = block.kind === "error" ? "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
      : block.kind === "success" ? "border-lvl-team/30 bg-lvl-team-bg text-lvl-team"
      : "border-line bg-subtle text-ink-soft";
    return <div className={`wv-chat-block text-[13px] ${tone}`}>{block.content}</div>;
  }

  if (block.type === "connector_setup") return <ConnectorSetupBlock dash={dash} />;
  if (block.type === "memory_snapshot") return <MemorySnapshotBlock dash={dash} />;
  if (block.type === "agent_queue") return <AgentQueueBlock dash={dash} />;
  if (block.type === "kpi_overview") return <KpiOverviewBlock dash={dash} />;
  if (block.type === "governance_summary") return <GovernanceSummaryBlock dash={dash} />;
  if (block.type === "sim_progress") return <SimProgressBlock dash={dash} />;

  if (block.type === "answer") {
    return (
      <div className="wv-chat-block">
        <AnswerBlock
          answer={block.data.answer}
          skillUsed={block.data.skill_used ?? undefined}
          layers={block.data.layers}
        />
      </div>
    );
  }

  if (block.type === "feed_strip") {
    const items = dash.feed.slice(0, block.limit ?? 10);
    return (
      <div data-testid="chat-feed" className="flex flex-col gap-1.5">
        {items.length === 0 ? (
          <p className="m-0 text-xs text-muted">{t("chat.emptyFeed")}</p>
        ) : items.map((ev, i) => (
          <div key={`${ev.type}-${i}`}><ApiFeedRow ev={ev} /></div>
        ))}
      </div>
    );
  }

  if (block.type === "feed_event") {
    return (
      <div className="wv-chat-feed-in">
        <ApiFeedRow ev={block.event} />
      </div>
    );
  }

  if (block.type === "onboarding") {
    const step = ONBOARDING_STEPS.find((s) => s.id === block.stepId);
    if (!step) return null;
    const stepIndex = stepIndexFor(block.stepId as OnboardingStepId);
    const isCurrent = onboarding.isActive && onboarding.currentStep?.id === block.stepId;
    if (!isCurrent) {
      return (
        <div className="wv-chat-block wv-onboarding-block opacity-80" data-testid={`onboarding-step-${step.id}-done`}>
          <h2 className="m-0 text-[15px] font-semibold tracking-tight text-ink">{t(step.titleKey)}</h2>
          <p className="mt-1.5 mb-0 text-[13px] text-muted leading-[1.5]">{t(step.bodyKey)}</p>
        </div>
      );
    }
    return (
      <OnboardingBlock
        step={step}
        stepIndex={stepIndex}
        stepCount={onboarding.stepCount}
        busy={busy || onboarding.awaitingSimulate}
        onAction={handleOnboardingAction}
        onSkip={handleOnboardingSkip}
      />
    );
  }

  return null;
}
