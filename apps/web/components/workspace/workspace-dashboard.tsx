"use client";

import { useRef, useState } from "react";
import {
  Activity, Brain, Sparkles, Bot, MessageSquare, Zap, CircleHelp, Search, WifiOff,
  Building2, CircleDot, Circle,
} from "lucide-react";
import { Button, Badge, Avatar } from "../ui/primitives";
import {
  Panel, Card, EmptyState, Input, Select, FlashBanner, AnswerBlock, ScopeSelector,
} from "../ui/workspace-ui";
import { useWeaveDashboard } from "../../hooks/use-weave-dashboard";
import { useViewport, prefersReducedMotion } from "../../hooks/use-viewport";
import { getScopeLabel, inScope, orgToScopeTeams } from "../../lib/scope";
import type { Agent, Fact, OrgCfg, Skill } from "../../lib/types";
import { ApiFeedRow } from "./api-feed-row";
import { WeaveShell } from "../layout/weave-shell";

const LEVEL_LABEL: Record<string, string> = {
  personal: "Personal",
  team: "Team",
  project: "Project",
  organization: "Organization",
};

type WorkspaceDashboardProps = {
  onStartTour: () => void;
  onSkillEmerged: () => void;
  subtitle?: string;
};

export function WorkspaceDashboard({ onStartTour, onSkillEmerged, subtitle }: WorkspaceDashboardProps) {
  const notifyRef = useRef(onSkillEmerged);
  notifyRef.current = onSkillEmerged;

  const dash = useWeaveDashboard(() => notifyRef.current());
  const {
    orgId, org, presets, scope, setScope, feed, skills, facts, agents, flash, newest,
    connected, llm, pendingAction, simProgress, errorMessage, question, setQuestion, answer, asking,
    injectText, setInjectText, switchOrg, simulate, reset, ask, approveAgent, inject,
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
  const fAgents = agents.filter((a) => !scope.team || a.team === scope.team || a.team === "");
  const shownSkills = [...orgSkills, ...projSkills];

  const tabDefs = [
    { id: "flux" as const, label: "Flux", count: feed.length },
    { id: "memoire" as const, label: "Mémoire", count: fFacts.length },
    { id: "skills" as const, label: "Compétences", count: shownSkills.length },
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
  const agentsLayout =
    width >= 760
      ? { display: "grid" as const, gridTemplateColumns: "5fr 7fr", gap: 16, alignItems: "start" as const }
      : { display: "flex" as const, flexDirection: "column" as const, gap: 16 };

  const scrollBody = { maxHeight: 460, overflowY: "auto" as const };
  const defaultSubtitle =
    "Espace de travail · l'intelligence de votre organisation se construit en direct";

  const mobileScopeOptions = [
    { value: "", label: "Organisation" },
    ...scopeTeams.map((t) => ({ value: t.id, label: t.name })),
  ];
  const mobileScopeValue = scope.team ?? "";

  const headerActions = (
    <>
      {showSearch && width >= 1180 && (
        <div className="relative w-[200px] max-w-[280px]">
          <Search size={15} color="var(--muted)" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="search" disabled placeholder="Rechercher…" aria-label="Rechercher" className="w-full h-8 box-border border border-line bg-subtle rounded-md pl-[34px] pr-3 text-sm text-muted" />
        </div>
      )}
      {showTour && (
        <Button variant="ghost" size="md" icon={<CircleHelp size={15} />} onClick={onStartTour}>
          Visite guidée
        </Button>
      )}
      <select
        value={orgId}
        onChange={(e) => switchOrg(e.target.value)}
        disabled={pendingAction === "switchOrg"}
        aria-label="Organisation"
        className="h-9 border border-line rounded-md bg-surface px-2.5 text-sm text-ink font-sans"
      >
        {presets.map((p: OrgCfg) => (
          <option key={p.org} value={p.org}>{p.name}</option>
        ))}
      </select>
      {!isTabs && (
        <>
          <Button variant="ghost" size="md" onClick={reset} disabled={pendingAction === "reset"}>
            {pendingAction === "reset" ? "Réinitialisation…" : "Réinitialiser"}
          </Button>
          <Button data-tour="simulate" variant="primary" size="md" icon={<Zap size={15} />} onClick={simulate} disabled={simRunning || !connected}>
            {simRunning ? "Simulation…" : "Simuler l'activité"}
          </Button>
        </>
      )}
    </>
  );

  return (
    <WeaveShell
      width={width}
      connected={connected}
      llm={llm}
      subtitle={subtitle ?? defaultSubtitle}
      actions={headerActions}
    >
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
            <strong>Erreur :</strong> {errorMessage}
          </div>
        )}

        {!connected && (
          <div className="mb-3.5 flex items-center gap-2.5 px-3.5 py-[11px] border border-line rounded-lg bg-subtle">
            <WifiOff size={16} color="var(--muted)" className="shrink-0" />
            <span className="text-sm text-ink-soft flex-1">
              API hors ligne — lancez <code className="text-xs">cargo run -p weave-api</code> puis rechargez.
            </span>
          </div>
        )}

        {simProgress && (
          <div className="mb-3.5 px-3.5 py-[11px] border border-line rounded-lg bg-subtle">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-ink">Simulation en cours…</span>
              <span className="text-xs text-muted tabular-nums">{simProgress.events}/{simProgress.target} events · {simProgress.facts} faits · {simProgress.skills} compétences</span>
            </div>
            <div className="w-full h-[6px] rounded-full bg-line overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, (simProgress.events / simProgress.target) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {isTabs && (
          <div className="flex gap-1 border border-line rounded-lg p-[3px] bg-surface mb-3.5">
            {tabDefs.map((t) => {
              const active = t.id === activeTab;
              return (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                  className={`flex-1 border-none cursor-pointer rounded-[5px] px-1.5 py-2 text-[12.5px] font-medium font-sans inline-flex items-center justify-center gap-1.5 min-h-10 ${active ? "bg-accent-soft text-accent-deep" : "bg-transparent text-ink-soft"}`}>
                  {t.label}
                  <span className={`text-[10px] tabular-nums px-1.5 py-[1px] rounded-full ${active ? "bg-surface" : "bg-subtle"} text-muted`}>{t.count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div style={gridStyle}>
          {showFlux && (
            <div data-tour="feed" data-testid="feed-panel">
              <Panel title="Flux d'activité IA" icon={<Activity size={15} strokeWidth={2} />} count={feed.length} bodyStyle={scrollBody}>
                <div className="wv-scroll flex flex-col gap-1.5">
                  {feed.length === 0 ? (
                    <EmptyState>Cliquez « Simuler l&apos;activité » : chaque personne de chaque équipe se met à travailler avec l&apos;IA.</EmptyState>
                  ) : (
                    feed.map((ev, i) => <ApiFeedRow key={`${ev.type}-${i}`} ev={ev} />)
                  )}
                </div>
              </Panel>
            </div>
          )}

          {showMemoire && (
            <div data-testid="memory-panel">
              <Panel title={scope.team ? `Mémoire · ${scopeLabel}` : "Mémoire partagée"} icon={<Brain size={15} strokeWidth={2} />} count={fFacts.length} bodyStyle={scrollBody}>
                <div className="wv-scroll flex flex-col gap-1.5">
                  {fFacts.length === 0 ? (
                    <EmptyState>La mémoire partagée se remplira à mesure que vos équipes échangent avec l&apos;IA.</EmptyState>
                  ) : (
                    fFacts.map((m) => <FactCard key={m.id} fact={m} />)
                  )}
                </div>
              </Panel>
            </div>
          )}

          {showSkills && (
            <div className={layout === "2col" ? "col-span-full" : ""} data-tour="skills" data-testid="skills-panel">
              <Panel title="Compétences vivantes" icon={<Sparkles size={15} strokeWidth={2} />} count={shownSkills.length} subtitle="Nées des projets · promues au niveau org quand partagées entre équipes." bodyStyle={scrollBody}>
                <div className="wv-scroll flex flex-col gap-2.5">
                  {shownSkills.length === 0 ? (
                    <EmptyState>Aucune compétence pour l&apos;instant — elles émergent quand un schéma se répète assez souvent.</EmptyState>
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
          <Panel title="Agents" icon={<Bot size={15} strokeWidth={2} />} count={fAgents.length} subtitle="Un spécialiste par équipe, né de ses compétences.">
            <div style={agentsLayout}>
              <div className="flex flex-col gap-2.5">
                {fAgents.length === 0 ? (
                  <EmptyState>Aucun agent visible dans ce scope.</EmptyState>
                ) : (
                  fAgents.map((a) => <AgentCard key={a.id} agent={a} newest={newest} pendingAction={pendingAction} onApprove={() => approveAgent(a.name)} />)
                )}
              </div>
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                  Injecter un message · vous jouez un membre de l&apos;équipe
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    value={injectText}
                    onChange={(e) => setInjectText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") inject(); }}
                    placeholder={scope.workstream ? `Message dans ${scopeLabel}…` : "Sélectionnez une équipe/projet dans la vue, puis écrivez…"}
                  />
                  <Button variant="dark" size="md" onClick={inject} disabled={pendingAction === "inject"}>
                    {pendingAction === "inject" ? "Envoi…" : "Envoyer"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted leading-normal">
                  Répétez une même question dans un projet (5×) et regardez une compétence naître. Posez-la dans deux équipes → une compétence d&apos;organisation.
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="mt-4" ref={askRef} data-tour="ask" data-testid="ask-panel">
          <Panel title="Interroger la mémoire partagée" icon={<MessageSquare size={15} strokeWidth={2} />}>
            <div className="flex gap-2 flex-wrap">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
                placeholder="Posez une question à l'organisation…"
              />
              <Button variant="primary" size="md" onClick={ask} disabled={asking || pendingAction === "ask" || !connected}>
                {pendingAction === "ask" || asking ? "Recherche…" : "Demander"}
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
          Rust · Axum · Postgres/pgvector · Ollama (local) · MCP — mémoire scopée perso → équipe → projet → organisation
        </footer>
      </div>

      {isTabs && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 px-4 py-3 bg-bg border-t border-line">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => askRef.current?.scrollIntoView({ behavior: "smooth" })}>
            Interroger
          </Button>
          <Button data-tour="simulate" variant="primary" size="lg" className="flex-1 w-full" icon={<Zap size={15} />} onClick={simulate} disabled={simRunning || !connected}>
            {simRunning ? "Simulation…" : "Simuler"}
          </Button>
          <Button variant="ghost" size="lg" onClick={reset} disabled={pendingAction === "reset"} title="Réinitialiser">
            Reset
          </Button>
        </div>
      )}
    </WeaveShell>
  );
}

function FactCard({ fact }: { fact: Fact }) {
  const tone = (fact.memory_level as "personal" | "team" | "project" | "organization") || "neutral";
  return (
    <Card tone={tone === "organization" ? "organization" : tone === "project" ? "project" : tone === "team" ? "team" : "personal"} radius="md" padding="10px">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="white" shape="tag" uppercase>{fact.ftype}</Badge>
        <Badge tone={tone}>{LEVEL_LABEL[fact.memory_level] ?? fact.memory_level}</Badge>
        <span className="text-xs text-muted">{fact.workstream} · {fact.author}</span>
      </div>
      <div className="mt-[5px] text-sm text-ink-soft leading-normal">{fact.content}</div>
    </Card>
  );
}

function SkillCard({ skill, newest, expanded, onToggle }: { skill: Skill; newest: string | null; expanded: boolean; onToggle: () => void }) {
  const isNewest = skill.name === newest;
  const isOrg = skill.memory_level === "organization";
  return (
    <div data-testid="skill-item" data-skill-name={skill.name}>
    <Card tone={isNewest ? "accent" : isOrg ? "organization" : "neutral"} emerge={isNewest && !prefersReducedMotion()} radius="lg" padding="12px">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-[7px] min-w-0">
          {isOrg ? <Building2 size={14} color="var(--lvl-org)" className="shrink-0" /> : <Sparkles size={14} color="var(--accent)" className="shrink-0" />}
          <span className="font-mono text-[12.5px] font-medium text-ink truncate">{skill.name}</span>
        </span>
        <Badge tone={skill.memory_level as "organization"}>{LEVEL_LABEL[skill.memory_level] ?? skill.memory_level}</Badge>
      </div>
      <div className="mt-[5px] text-[12.5px] text-ink-soft leading-normal">{skill.trigger}</div>
      {expanded && (
        <pre className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-surface p-[9px] text-xs leading-relaxed text-ink-soft font-mono">{skill.body}</pre>
      )}
      <div className="mt-[9px] flex items-center gap-1.5 text-xs text-muted flex-wrap">
        <button type="button" onClick={onToggle} className="border-none bg-transparent p-0 cursor-pointer text-accent font-sans text-xs font-medium">
          {expanded ? "Masquer le détail" : "Voir le détail"}
        </button>
        <span>·</span>
        <span>référents</span>
        {skill.referents.map((r) => <Avatar key={r} name={r} size="sm" />)}
        <span className="ml-auto tabular-nums">{skill.sources.length} sources</span>
      </div>
    </Card>
    </div>
  );
}

function AgentCard({ agent, newest, pendingAction, onApprove }: { agent: Agent; newest: string | null; pendingAction: string | null; onApprove: () => void }) {
  const pending = agent.status === "pending";
  const isNewest = agent.name === newest && pending;
  return (
    <Card tone={isNewest ? "accent" : pending ? "organization" : "neutral"} emerge={isNewest && !prefersReducedMotion()} radius="lg" padding="12px">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-[7px] min-w-0">
          {pending ? <CircleDot size={13} color="var(--lvl-org)" className="shrink-0" /> : <Circle size={13} color="var(--accent)" className="shrink-0" />}
          <span className="font-mono text-[12.5px] font-medium text-ink truncate">{agent.name}</span>
        </span>
        {pending ? (
          <Button variant="dark" size="sm" onClick={onApprove} disabled={pendingAction === "approveAgent"}>
            {pendingAction === "approveAgent" ? "…" : "Approuver"}
          </Button>
        ) : (
          <Badge tone="active">actif</Badge>
        )}
      </div>
      <div className="mt-1 text-xs text-muted">{agent.derived_from}</div>
      {agent.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-[5px]">
          {agent.skills.map((sk) => (
            <span key={sk} className="rounded bg-subtle px-[7px] py-0.5 text-[10px] text-ink-soft font-mono">✦ {sk.split("/").pop()}</span>
          ))}
        </div>
      )}
    </Card>
  );
}
