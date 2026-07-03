"use client";

import { useMemo, useRef, useState } from "react";
import {
  Activity, Brain, Sparkles, Bot, MessageSquare, Zap, CircleHelp, Search, WifiOff,
  Building2,
} from "lucide-react";
import { Button, Badge, Avatar } from "../ui/primitives";
import {
  Panel, Card, EmptyState, Input, Select, FlashBanner, AnswerBlock, ScopeSelector,
} from "../ui/workspace-ui";
import { useWeaveDashboard, simProgressMetrics } from "../../hooks/use-weave-dashboard";
import { useViewport, prefersReducedMotion } from "../../hooks/use-viewport";
import { useT } from "../../lib/i18n/context";
import { getScopeLabel, inScope, orgToScopeTeams } from "../../lib/scope";
import type { Fact, OrgCfg, Skill } from "../../lib/types";
import { ApiFeedRow } from "./api-feed-row";
import { useShellHeader } from "../layout/use-shell-header";

const LEVEL_KEYS = ["personal", "team", "project", "organization"] as const;

type WorkspaceDashboardProps = {
  onStartTour: () => void;
  onSkillEmerged: () => void;
  subtitle?: string;
};

export function WorkspaceDashboard({ onStartTour, onSkillEmerged, subtitle }: WorkspaceDashboardProps) {
  const t = useT();
  const notifyRef = useRef(onSkillEmerged);
  notifyRef.current = onSkillEmerged;

  const dash = useWeaveDashboard(() => notifyRef.current());
  const {
    orgId, org, presets, scope, setScope, feed, skills, facts, flash, newest,
    connected, llm, pendingAction, simProgress, errorMessage, question, setQuestion, answer, asking,
    injectText, setInjectText, switchOrg, simulate, reset, ask, inject,
  } = dash;

  const { width, layout, isTabs, isMobile, showSubtitle, showSearch, showTour, showStatus } = useViewport();
  const [activeTab, setActiveTab] = useState<"flux" | "memoire" | "skills">("flux");
  const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({});
  const askRef = useRef<HTMLDivElement>(null);

  const scopeTeams = orgToScopeTeams(org);
  const scopeLabel = getScopeLabel(org, scope);
  const simRunning = pendingAction === "simulate";

  const fFacts = facts.filter((f) => inScope(scope, f.team, f.workstream));
  const orgSkills = skills.filter((s) => s.memory_level === "organization");
  const projSkills = skills.filter((s) => s.memory_level !== "organization" && inScope(scope, s.team, s.workstream));
  const shownSkills = [...orgSkills, ...projSkills];

  const tabDefs = [
    { id: "flux" as const, label: t("workspace.tabs.feed"), count: feed.length },
    { id: "memoire" as const, label: t("workspace.tabs.memory"), count: fFacts.length },
    { id: "skills" as const, label: t("workspace.tabs.skills"), count: shownSkills.length },
  ];
  const showFlux = !isTabs || activeTab === "flux";
  const showMemoire = !isTabs || activeTab === "memoire";
  const showSkills = !isTabs || activeTab === "skills";

  const gridStyle = isTabs
    ? { display: "block" as const }
    : {
        display: "grid" as const,
        gridTemplateColumns: layout === "3col" ? "repeat(3,minmax(0,1fr))" : "repeat(2,minmax(0,1fr))",
        gap: 16,
        alignItems: "start" as const,
      };
  const scrollBody = { maxHeight: 460, overflowY: "auto" as const };
  const defaultSubtitle = t("workspace.subtitle");

  const mobileScopeOptions = [
    { value: "", label: t("common.organization") },
    ...scopeTeams.map((team) => ({ value: team.id, label: team.name })),
  ];
  const mobileScopeValue = scope.team ?? "";

  const headerActions = useMemo(() => (
    <>
      {showSearch && width >= 1180 && (
        <div className="relative w-[200px] max-w-[280px]">
          <Search size={15} color="var(--muted)" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="search" disabled placeholder={t("common.search")} aria-label={t("common.search")} className="w-full h-8 box-border border border-line bg-subtle rounded-md pl-[34px] pr-3 text-sm text-muted" />
        </div>
      )}
      {showTour && (
        <Button variant="ghost" size="md" icon={<CircleHelp size={15} />} onClick={onStartTour}>
          {t("common.guidedTour")}
        </Button>
      )}
      <select
        value={orgId}
        onChange={(e) => switchOrg(e.target.value)}
        disabled={pendingAction === "switchOrg"}
        aria-label={t("nav.org")}
        className="h-9 border border-line rounded-md bg-surface px-2.5 text-sm text-ink font-sans"
      >
        {presets.map((p: OrgCfg) => (
          <option key={p.org} value={p.org}>{p.name}</option>
        ))}
      </select>
      {!isTabs && (
        <>
          <Button variant="ghost" size="md" onClick={reset} disabled={pendingAction === "reset"}>
            {pendingAction === "reset" ? t("common.resetting") : t("common.reset")}
          </Button>
          <Button data-tour="simulate" variant="primary" size="md" icon={<Zap size={15} />} onClick={simulate} disabled={simRunning || !connected}>
            {simRunning ? t("common.ingesting") : t("common.ingest")}
          </Button>
        </>
      )}
    </>
  ), [connected, isTabs, onStartTour, orgId, pendingAction, presets, reset, showSearch, showTour, simRunning, simulate, switchOrg, t, width]);

  useShellHeader({ subtitle: subtitle ?? defaultSubtitle, actions: headerActions });

  return (
    <>
      {flash && (
        <div className="fixed top-3.5 left-1/2 -translate-x-1/2 z-60 w-[calc(100%-32px)] max-w-[520px]">
          <FlashBanner kind={flash.kind === "agent" ? "agent" : flash.kind === "org" ? "org" : "skill"} emerge={!prefersReducedMotion()}>
            <span className="inline-flex items-center gap-2">
              {flash.kind === "agent" ? <Bot size={15} /> : <Sparkles size={15} />}
              {flash.msg}
            </span>
          </FlashBanner>
        </div>
      )}

      <div className={`mx-auto max-w-[1360px] ${isTabs ? "px-4 pb-24" : "px-6 pb-12"}`}>
        {!showSubtitle && (
          <p className="mt-3 text-xs text-muted leading-normal">{subtitle ?? defaultSubtitle}</p>
        )}

        <div className="pt-[18px] pb-[14px] flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            {isMobile ? (
              <Select
                value={mobileScopeValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setScope(v ? { team: v } : {});
                }}
                options={mobileScopeOptions}
              />
            ) : (
              <ScopeSelector teams={scopeTeams} scope={scope} onChange={setScope} trailing={scopeLabel} />
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="mb-3.5 px-3.5 py-[11px] rounded-lg border border-[#fecaca] bg-[#fef2f2] text-sm text-[#b91c1c]">
            <strong>{t("common.error")}</strong> {errorMessage}
          </div>
        )}

        {!connected && (
          <div className="mb-3.5 flex items-center gap-2.5 px-3.5 py-[11px] border border-line rounded-lg bg-subtle">
            <WifiOff size={16} color="var(--muted)" className="shrink-0" />
            <span className="text-sm text-ink-soft flex-1">
              {t("errors.apiOfflineBanner")}
            </span>
          </div>
        )}

        {simProgress && (() => {
          const { processed, pct, target } = simProgressMetrics(simProgress);
          return (
          <div className="mb-3.5 px-3.5 py-[11px] border border-line rounded-lg bg-subtle">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-ink">{t("workspace.ingestion.running")}</span>
              <span className="text-xs text-muted tabular-nums">
                {t("workspace.ingestion.progress", {
                  events: processed,
                  target,
                  facts: simProgress.facts,
                  skills: simProgress.skills,
                })}
              </span>
            </div>
            <p className="m-0 text-xs text-ink-soft leading-relaxed">{t("workspace.ingestion.subtitle")}</p>
            <div className="w-full h-[6px] rounded-full bg-line overflow-hidden mt-2">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          );
        })()}

        {isTabs && (
          <div className="flex gap-1 border border-line rounded-lg p-[3px] bg-surface mb-3.5">
            {tabDefs.map((t) => {
              const active = t.id === activeTab;
              return (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                  className={`flex-1 border-none cursor-pointer rounded-[5px] px-1.5 py-2 text-[12.5px] font-medium font-sans inline-flex items-center justify-center gap-1.5 min-h-10 ${active ? "bg-accent-soft text-accent-deep" : "bg-transparent text-ink-soft"}`}>
                  {t.label}
                  <span className={`text-[10px] tabular-nums px-1.5 py-px rounded-full ${active ? "bg-surface" : "bg-subtle"} text-muted`}>{t.count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div style={gridStyle}>
          {showFlux && (
            <div data-tour="feed" data-testid="feed-panel">
              <Panel title={t("workspace.feed.title")} icon={<Activity size={15} strokeWidth={2} />} count={feed.length} bodyStyle={scrollBody}>
                <div className="wv-scroll flex flex-col gap-1.5">
                  {feed.length === 0 ? (
                    <EmptyState>{t("workspace.feed.empty")}</EmptyState>
                  ) : (
                    feed.map((ev, i) => <ApiFeedRow key={`${ev.type}-${i}`} ev={ev} />)
                  )}
                </div>
              </Panel>
            </div>
          )}

          {showMemoire && (
            <div data-testid="memory-panel">
              <Panel title={scope.team ? t("workspace.memory.scoped", { scope: scopeLabel }) : t("workspace.memory.shared")} icon={<Brain size={15} strokeWidth={2} />} count={fFacts.length} bodyStyle={scrollBody}>
                <div className="wv-scroll flex flex-col gap-1.5">
                  {fFacts.length === 0 ? (
                    <EmptyState>{t("workspace.memory.empty")}</EmptyState>
                  ) : (
                    fFacts.map((m) => <FactCard key={m.id} fact={m} />)
                  )}
                </div>
              </Panel>
            </div>
          )}

          {showSkills && (
            <div className={layout === "2col" ? "col-span-full" : ""} data-tour="skills" data-testid="skills-panel">
              <Panel title={t("workspace.skills.title")} icon={<Sparkles size={15} strokeWidth={2} />} count={shownSkills.length} subtitle={t("workspace.skills.subtitle")} bodyStyle={scrollBody}>
                <div className="wv-scroll flex flex-col gap-2.5">
                  {shownSkills.length === 0 ? (
                    <EmptyState>{t("workspace.skills.empty")}</EmptyState>
                  ) : (
                    shownSkills.map((s) => (
                      <SkillCard
                        key={s.id}
                        skill={s}
                        newest={newest}
                        expanded={!!expandedSkills[s.id]}
                        onToggle={() => setExpandedSkills((p) => ({ ...p, [s.id]: !p[s.id] }))}
                      />
                    ))
                  )}
                </div>
              </Panel>
            </div>
          )}
        </div>

        <div className="mt-4">
          <Panel title={t("workspace.agents.injectTitle")} icon={<Zap size={15} strokeWidth={2} />} subtitle={t("workspace.agents.injectHint")}>
            <div className="flex gap-2 flex-wrap">
              <Input
                value={injectText}
                onChange={(e) => setInjectText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") inject(); }}
                placeholder={scope.workstream ? t("workspace.agents.injectPlaceholderScoped", { scope: scopeLabel }) : t("workspace.agents.injectPlaceholder")}
              />
              <Button variant="dark" size="md" onClick={inject} disabled={pendingAction === "inject"}>
                {pendingAction === "inject" ? t("common.sending") : t("common.send")}
              </Button>
            </div>
          </Panel>
        </div>

        <div className="mt-4" ref={askRef} data-tour="ask" data-testid="ask-panel">
          <Panel title={t("workspace.ask.title")} icon={<MessageSquare size={15} strokeWidth={2} />}>
            <div className="flex gap-2 flex-wrap">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
                placeholder={t("workspace.ask.placeholder")}
              />
              <Button variant="primary" size="md" onClick={ask} disabled={asking || pendingAction === "ask" || !connected}>
                {pendingAction === "ask" || asking ? t("common.asking") : t("common.ask")}
              </Button>
            </div>
            {(asking || pendingAction === "ask") && (
              <div className="mt-4 flex flex-col gap-2">
                <div className="wv-shimmer h-4 w-[40%]" />
                <div className="wv-shimmer h-12" />
              </div>
            )}
            {answer && !asking && (
              <div className="mt-4" data-testid="ask-answer">
                <AnswerBlock
                  answer={answer.answer}
                  skillUsed={answer.skill_used ?? undefined}
                  layers={answer.layers.map((l) => ({
                    level: l.level,
                    facts: l.facts.map((f) => ({ author: f.author, content: f.content })),
                  }))}
                />
              </div>
            )}
          </Panel>
        </div>

        <footer className="mt-7 border-t border-line pt-4 text-center text-xs text-muted">
          {t("workspace.footer")}
        </footer>
      </div>

      {isTabs && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 px-4 py-3 bg-bg border-t border-line">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => askRef.current?.scrollIntoView({ behavior: "smooth" })}>
            {t("nav.ask")}
          </Button>
          <Button data-tour="simulate" variant="primary" size="lg" className="flex-1 w-full" icon={<Zap size={15} />} onClick={simulate} disabled={simRunning || !connected}>
            {simRunning ? t("common.ingesting") : t("common.ingestShort")}
          </Button>
          <Button variant="ghost" size="lg" onClick={reset} disabled={pendingAction === "reset"} title={t("common.reset")}>
            Reset
          </Button>
        </div>
      )}
    </>
  );
}

function FactCard({ fact }: { fact: Fact }) {
  const t = useT();
  const tone = (fact.memory_level as "personal" | "team" | "project" | "organization") || "neutral";
  const levelKey = LEVEL_KEYS.includes(fact.memory_level as typeof LEVEL_KEYS[number])
    ? (fact.memory_level as typeof LEVEL_KEYS[number])
    : null;
  return (
    <Card tone={tone === "organization" ? "organization" : tone === "project" ? "project" : tone === "team" ? "team" : "personal"} radius="md" padding="10px">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="white" shape="tag" uppercase>{fact.ftype}</Badge>
        <Badge tone={tone}>{levelKey ? t(`levels.${levelKey}`) : fact.memory_level}</Badge>
        <span className="text-xs text-muted">{fact.workstream} · {fact.author}</span>
      </div>
      <div className="mt-[5px] text-sm text-ink-soft leading-normal">{fact.content}</div>
    </Card>
  );
}

function SkillCard({ skill, newest, expanded, onToggle }: { skill: Skill; newest: string | null; expanded: boolean; onToggle: () => void }) {
  const t = useT();
  const isNewest = skill.name === newest;
  const isOrg = skill.memory_level === "organization";
  const levelKey = LEVEL_KEYS.includes(skill.memory_level as typeof LEVEL_KEYS[number])
    ? (skill.memory_level as typeof LEVEL_KEYS[number])
    : null;
  return (
    <div data-testid="skill-item" data-skill-name={skill.name}>
    <Card tone={isNewest ? "accent" : isOrg ? "organization" : "neutral"} emerge={isNewest && !prefersReducedMotion()} radius="lg" padding="12px">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-[7px] min-w-0">
          {isOrg ? <Building2 size={14} color="var(--lvl-org)" className="shrink-0" /> : <Sparkles size={14} color="var(--accent)" className="shrink-0" />}
          <span className="font-mono text-[12.5px] font-medium text-ink truncate">{skill.name}</span>
        </span>
        <Badge tone={skill.memory_level as "organization"}>{levelKey ? t(`levels.${levelKey}`) : skill.memory_level}</Badge>
      </div>
      <div className="mt-[5px] text-[12.5px] text-ink-soft leading-normal">{skill.trigger}</div>
      {expanded && (
        <pre className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-surface p-[9px] text-xs leading-relaxed text-ink-soft font-mono">{skill.body}</pre>
      )}
      <div className="mt-[9px] flex items-center gap-1.5 text-xs text-muted flex-wrap">
        <button type="button" onClick={onToggle} className="border-none bg-transparent p-0 cursor-pointer text-accent font-sans text-xs font-medium">
          {expanded ? t("common.hideDetail") : t("common.showDetail")}
        </button>
        <span>·</span>
        <span>{t("common.referents")}</span>
        {skill.referents.map((r) => <Avatar key={r} name={r} size="sm" />)}
        <span className="ml-auto tabular-nums">{skill.sources.length} {t("common.sources")}</span>
      </div>
    </Card>
    </div>
  );
}

