"use client";

import { useRef } from "react";
import { Activity, Brain, Sparkles, Bot, MessageSquare, Building2, Circle, CircleDot, HelpCircle } from "lucide-react";
import type { Feed, Skill, TeamCfg, Project } from "../lib/types";
import { useWeaveDashboard } from "../hooks/use-weave-dashboard";
import { useGuidedTour } from "./tour";

// mirror weave_core::OrgConfig::slug
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}



const LEVEL_STYLE: Record<string, string> = {
  personal: "text-lvl-personal border-lvl-personal/30 bg-lvl-personal-bg",
  team: "text-lvl-team border-lvl-team/30 bg-lvl-team-bg",
  project: "text-lvl-project border-lvl-project/30 bg-lvl-project-bg",
  organization: "text-lvl-org border-lvl-org/40 bg-lvl-org-bg",
};

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

  const scopeLabel = scope.workstream
    ? org?.teams.flatMap((t: TeamCfg) => t.projects).find((p: Project) => slug(p.name) === scope.workstream)?.name
    : scope.team
    ? org?.teams.find((t: TeamCfg) => slug(t.name) === scope.team)?.name
    : "Toute l'organisation";

  return (
    <main className="mx-auto max-w-[1360px] px-6 py-6">
      {/* Top bar */}
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
          <button onClick={startTour} className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-soft hover:bg-subtle">
            <HelpCircle size={15} strokeWidth={2} /> Visite guidée
          </button>
          <select value={orgId} onChange={(e) => switchOrg(e.target.value)}
            className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none hover:bg-subtle">
            {presets.map((p) => <option key={p.org} value={p.org}>{p.name}</option>)}
          </select>
          {llm && <span className="rounded-md border border-line bg-subtle px-2 py-1 text-[11px] text-ink-soft">{llm}</span>}
          <span className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${connected ? "text-accent-deep bg-accent-soft" : "text-muted bg-subtle border border-line"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-accent" : "bg-muted"}`} />{connected ? "en direct" : "hors ligne"}
          </span>
          <button onClick={reset} className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft hover:bg-subtle">Réinitialiser</button>
          <button data-tour="simulate" onClick={simulate} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-deep">Simuler l&apos;activité</button>
        </div>
      </header>

      {/* Scope bar */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted">Vue :</span>
        <button onClick={() => setScope({})}
          className={`rounded-full px-2.5 py-1 text-xs ${!scope.team ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:bg-subtle"}`}>
          Organisation
        </button>
        {org?.teams.map((t: TeamCfg) => {
          const ts = slug(t.name);
          const active = scope.team === ts && !scope.workstream;
          return (
            <div key={t.name} className="flex items-center gap-1">
              <button onClick={() => setScope({ team: ts })}
                className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-accent text-white" : "border border-line bg-surface text-ink-soft hover:bg-subtle"}`}>
                {t.name}
              </button>
              {scope.team === ts && t.projects.map((p: Project) => {
                const ws = slug(p.name);
                return (
                  <button key={p.name} onClick={() => setScope({ team: ts, workstream: ws })}
                    className={`rounded-full px-2 py-1 text-[11px] ${scope.workstream === ws ? "bg-accent-deep text-white" : "border border-line bg-surface text-muted hover:bg-subtle"}`}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          );
        })}
        <span className="ml-auto text-xs text-muted">{scopeLabel}</span>
      </div>

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
        {/* Live feed */}
        <section data-tour="feed" className="col-span-4 rounded-lg border border-line bg-surface p-4">
          <PanelTitle icon={<Activity size={15} strokeWidth={2} />} count={feed.length}>Flux d&apos;activité IA</PanelTitle>
          <div className="mt-3 max-h-[540px] space-y-1.5 overflow-y-auto pr-1">
            {feed.length === 0 && <Empty>Cliquez « Simuler l&apos;activité » : chaque personne de chaque équipe se met à travailler avec l&apos;IA.</Empty>}
            {feed.map((ev, i) => <FeedRow key={i} ev={ev} />)}
          </div>
        </section>

        {/* Knowledge */}
        <section className="col-span-4 rounded-lg border border-line bg-surface p-4">
          <PanelTitle icon={<Brain size={15} strokeWidth={2} />} count={fFacts.length}>Mémoire {scope.team ? `· ${scopeLabel}` : "partagée"}</PanelTitle>
          <div className="mt-3 max-h-[540px] space-y-1.5 overflow-y-auto pr-1">
            {fFacts.length === 0 && <Empty>—</Empty>}
            {fFacts.slice(0, 30).map((f) => (
              <div key={f.id} className="rounded-md border border-line-soft bg-subtle px-2.5 py-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag>{f.ftype}</Tag>
                  <LevelTag level={f.memory_level} />
                  {f.workstream && <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-ink-soft">{f.workstream}</span>}
                  <span className="text-muted">{f.author}</span>
                </div>
                <div className="mt-1 text-ink-soft">{f.content}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Skills */}
        <section data-tour="skills" className="col-span-4 rounded-lg border border-line bg-surface p-4">
          <PanelTitle icon={<Sparkles size={15} strokeWidth={2} />} count={orgSkills.length + projSkills.length}>Compétences vivantes</PanelTitle>
          <p className="mt-0.5 text-xs text-muted">Nées des projets · promues au niveau org quand partagées entre équipes.</p>
          <div className="mt-3 max-h-[520px] space-y-2.5 overflow-y-auto pr-1">
            {orgSkills.length === 0 && projSkills.length === 0 && <Empty>Aucune encore. Simulez l&apos;activité et regardez-les apparaître.</Empty>}
            {orgSkills.map((s) => <SkillCard key={s.id} s={s} newest={newest} org />)}
            {projSkills.map((s) => <SkillCard key={s.id} s={s} newest={newest} />)}
          </div>
        </section>
      </div>

      {/* Agents */}
      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <PanelTitle icon={<Bot size={15} strokeWidth={2} />} count={fAgents.length}>Agents · un spécialiste par équipe, né de ses compétences</PanelTitle>
        <div className="mt-3 grid grid-cols-12 gap-4">
          <div className="col-span-5 space-y-2">
            {fAgents.map((a) => (
              <div key={a.id} className={`rounded-lg border p-3 ${
                a.name === newest && a.status === "pending" ? "border-lvl-org bg-lvl-org-bg animate-emerge"
                : a.status === "pending" ? "border-lvl-org/60 bg-lvl-org-bg" : "border-line bg-subtle"}`}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono text-sm font-medium text-ink">
                    {a.status === "pending" ? <CircleDot size={13} className="text-lvl-org" /> : a.domain === "general" ? <Circle size={13} className="text-muted" /> : <Sparkles size={13} className="text-accent" />}
                    {a.name}
                  </span>
                  {a.status === "pending"
                    ? <button onClick={() => approveAgent(a.name)} className="rounded-md bg-ink px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-ink-soft">Approuver</button>
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
          {/* Manual inject */}
          <div className="col-span-7">
            <SubHead>Injecter un message (vous jouez un membre de l&apos;équipe)</SubHead>
            <div className="flex gap-2">
              <input value={injectText} onChange={(e) => setInjectText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && inject()}
                className="flex-1 rounded-md border border-line bg-subtle px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:bg-surface"
                placeholder={scope.workstream ? `Message dans ${scopeLabel}…` : "Sélectionnez une équipe/projet dans la barre de vue, puis écrivez…"} />
              <button onClick={inject} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-soft">Envoyer</button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Répétez une même question dans un projet (5×) et regardez une compétence naître. Posez la même dans deux équipes → une compétence d&apos;organisation.
            </p>
          </div>
        </div>
      </section>

      {/* Ask */}
      <section data-tour="ask" className="mt-4 rounded-lg border border-line bg-surface p-4">
        <PanelTitle icon={<MessageSquare size={15} strokeWidth={2} />}>Interroger la mémoire partagée</PanelTitle>
        <div className="mt-3 flex gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
            className="flex-1 rounded-md border border-line bg-subtle px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:bg-surface"
            placeholder="Posez une question à l'organisation…" />
          <button onClick={ask} disabled={asking} className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-deep disabled:opacity-50">{asking ? "…" : "Demander"}</button>
        </div>
        {answer && (
          <div className="mt-4 grid grid-cols-12 gap-4">
            <div className="col-span-7">
              {answer.skill_used && (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2 py-1 text-xs text-accent-deep">
                  <Sparkles size={12} /> compétence utilisée : <span className="font-mono">{answer.skill_used}</span>
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

      <footer className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
        Rust · Axum · Postgres/pgvector · Ollama (local) · MCP — mémoire scopée perso → équipe → projet → organisation
      </footer>
    </main>
  );
}

function SkillCard({ s, newest, org }: { s: Skill; newest: string | null; org?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${
      s.name === newest ? "border-accent bg-accent-soft animate-emerge"
      : org ? "border-lvl-org/50 bg-lvl-org-bg" : "border-line bg-subtle"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[13px] font-medium text-ink">
          {org ? <Building2 size={13} className="text-lvl-org" /> : <Sparkles size={13} className="text-accent" />} {s.name}
        </span>
        <LevelTag level={s.memory_level} />
      </div>
      <div className="mt-0.5 text-xs text-ink-soft">{s.trigger}</div>
      <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-surface p-2 text-[11px] leading-relaxed text-ink-soft">{s.body}</pre>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <span>référents :</span>
        {s.referents.map((r: string) => <span key={r} className="rounded bg-white px-1.5 py-0.5 text-ink-soft">{r}</span>)}
        <span className="ml-auto">{s.sources.length} sources</span>
      </div>
    </div>
  );
}

function PanelTitle({ children, count, icon }: { children: React.ReactNode; count?: number; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">{icon && <span className="text-ink-soft">{icon}</span>}{children}</h2>
      {count !== undefined && <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">{count}</span>}
    </div>
  );
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</h3>;
}
function FeedRow({ ev }: { ev: Feed }) {
  if (ev.type === "event_ingested")
    return <div className="rounded-md border border-line-soft bg-subtle px-2.5 py-1.5 text-xs"><span className="text-muted">{ev.actor}</span><span className="ml-1.5 text-ink">{ev.text}</span></div>;
  if (ev.type === "fact_extracted")
    return <div className="px-2.5 py-0.5 text-[11px] text-muted"><Tag>{ev.ftype}</Tag> <span className="ml-1">fait · {ev.topic}</span></div>;
  if (ev.type === "pattern_observed") {
    const pct = Math.min(100, Math.round(((ev.occurrences || 0) / (ev.threshold || 5)) * 100));
    return <div className="rounded-md border border-lvl-org/30 bg-lvl-org-bg px-2.5 py-1 text-[11px] text-lvl-org">schéma « {ev.signature} » — {ev.occurrences}/{ev.threshold}<div className="mt-1 h-1 w-full rounded bg-white"><div className="h-1 rounded bg-lvl-org" style={{ width: `${pct}%` }} /></div></div>;
  }
  if (ev.type === "skill_emerged") {
    const isOrg = (ev.name || "").startsWith("org/");
    return <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs animate-emerge ${isOrg ? "border-lvl-org/40 bg-lvl-org-bg text-lvl-org" : "border-accent/40 bg-accent-soft text-accent-deep"}`}>{isOrg ? <Building2 size={13} /> : <Sparkles size={13} />} <b>{isOrg ? "compétence org promue" : "compétence née"}</b> : {ev.name}</div>;
  }
  if (ev.type === "agent_emerged")
    return <div className="flex items-center gap-1.5 rounded-md border border-lvl-org/50 bg-lvl-org-bg px-2.5 py-1.5 text-xs text-lvl-org animate-emerge"><Bot size={13} /> <b>agent émergé</b> : {ev.name}</div>;
  return null;
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-white px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft">{children}</span>;
}
function LevelTag({ level }: { level: string }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] capitalize ${LEVEL_STYLE[level] || "border-line text-muted"}`}>{level}</span>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}
