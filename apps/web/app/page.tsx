"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_WEAVE_API || "http://127.0.0.1:8787";

// mirror weave_core::OrgConfig::slug
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Types ---
type Feed = {
  type: string;
  source?: string; actor?: string; text?: string;
  ftype?: string; author?: string; topic?: string; content?: string; memory_level?: string;
  name?: string; sources_count?: number; skills?: string[]; domain?: string;
  signature?: string; occurrences?: number; threshold?: number;
  src?: string; dst?: string; rel?: string;
};
type Skill = { id: string; name: string; team: string; workstream: string; trigger: string; body: string; referents: string[]; sources: string[]; memory_level: string };
type Fact = { id: string; ftype: string; author: string; team: string; workstream: string; topic: string; content: string; memory_level: string };
type Layer = { level: string; facts: { content: string; author: string; ftype: string }[] };
type Answer = { answer: string; skill_used: string | null; layers: Layer[] };
type Agent = { id: string; name: string; team: string; role: string; domain: string; skills: string[]; status: string; derived_from: string };
type TraceStep = { agent: string; action: string; note: string; depth: number };
type AgentRun = { answer: string; trace: TraceStep[] };
type Project = { name: string; theme: string; domain: string };
type TeamCfg = { name: string; members: string[]; projects: Project[] };
type OrgCfg = { org: string; name: string; teams: TeamCfg[] };

const LEVEL_STYLE: Record<string, string> = {
  personal: "text-sky border-sky/30 bg-sky-tint",
  team: "text-teal border-teal/30 bg-mint2",
  project: "text-brand-ink border-brand-deep/30 bg-mint",
  organization: "text-[#9a6b00] border-gold/40 bg-gold-tint",
};

export default function Page() {
  const [orgId, setOrgId] = useState("pennylane");
  const [org, setOrg] = useState<OrgCfg | null>(null);
  const [presets, setPresets] = useState<OrgCfg[]>([]);
  const [scope, setScope] = useState<{ team?: string; workstream?: string }>({});

  const [feed, setFeed] = useState<Feed[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [flash, setFlash] = useState<{ msg: string; kind: "skill" | "agent" | "org" } | null>(null);
  const [newest, setNewest] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [llm, setLlm] = useState("");

  const [question, setQuestion] = useState("Comment relancer la synchro bancaire ?");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);

  const [injectText, setInjectText] = useState("");

  const refetch = useCallback(async (id: string) => {
    try {
      const [s, f, ag] = await Promise.all([
        fetch(`${API}/skills?project=${id}`).then((r) => r.json()),
        fetch(`${API}/facts?project=${id}`).then((r) => r.json()),
        fetch(`${API}/agents?project=${id}`).then((r) => r.json()),
      ]);
      setSkills(s); setFacts(f); setAgents(ag);
    } catch {}
  }, []);

  const loadOrgConfig = useCallback(async (id: string) => {
    const cfg = await fetch(`${API}/org?project=${id}`).then((r) => r.json());
    setOrg(cfg);
  }, []);

  useEffect(() => {
    fetch(`${API}/health`).then((r) => r.json()).then((d) => setLlm(d.llm || "")).catch(() => {});
    fetch(`${API}/org/presets`).then((r) => r.json()).then(setPresets).catch(() => {});
  }, []);

  const throttle = useRef(0);
  useEffect(() => {
    loadOrgConfig(orgId);
    refetch(orgId);
    const es = new EventSource(`${API}/events`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const ev: Feed = JSON.parse(e.data);
      setFeed((prev) => [ev, ...prev].slice(0, 70));
      if (ev.type === "skill_emerged") {
        const isOrg = (ev.name || "").startsWith("org/");
        setFlash({ msg: isOrg
          ? `Compétence d'organisation promue : ${ev.name} — convention partagée entre équipes`
          : `Compétence née du travail de l'équipe : ${ev.name}`, kind: isOrg ? "org" : "skill" });
        setNewest(ev.name || null);
        setTimeout(() => setFlash(null), 6000);
      }
      if (ev.type === "agent_emerged") {
        setFlash({ msg: `Agent spécialiste émergé : ${ev.name} (en attente d'approbation)`, kind: "agent" });
        setNewest(ev.name || null);
        setTimeout(() => setFlash(null), 6000);
      }
      const now = Date.now();
      if (now - throttle.current > 500) { throttle.current = now; refetch(orgId); }
    };
    return () => es.close();
  }, [orgId, refetch, loadOrgConfig]);

  const switchOrg = async (id: string) => {
    await fetch(`${API}/org/load`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ org: id }) });
    setFeed([]); setSkills([]); setFacts([]); setAgents([]); setAnswer(null); setScope({}); setNewest(null);
    setOrgId(id);
    loadOrgConfig(id);
    setTimeout(() => refetch(id), 300);
  };

  const simulate = async () => {
    await fetch(`${API}/simulate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: orgId }) });
  };
  const reset = async () => {
    await fetch(`${API}/reset`, { method: "POST" });
    setFeed([]); setAnswer(null); setNewest(null);
    setTimeout(() => refetch(orgId), 300);
  };

  const ask = async () => {
    setAsking(true); setAnswer(null);
    try {
      const res = await fetch(`${API}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: orgId, question }) }).then((r) => r.json());
      setAnswer(res);
    } finally { setAsking(false); }
  };
  const approveAgent = async (name: string) => {
    await fetch(`${API}/agents/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    setTimeout(() => refetch(orgId), 200);
  };
  const inject = async () => {
    if (!injectText.trim()) return;
    await fetch(`${API}/inject`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: orgId, team: scope.team || "", workstream: scope.workstream || "", text: injectText, actor: "vous" }) });
    setInjectText("");
    setTimeout(() => refetch(orgId), 300);
  };

  // scope filtering
  const inScope = (team: string, ws: string) =>
    (!scope.team || team === scope.team) && (!scope.workstream || ws === scope.workstream);
  const fFacts = facts.filter((f) => inScope(f.team, f.workstream));
  const orgSkills = skills.filter((s) => s.memory_level === "organization");
  const projSkills = skills.filter((s) => s.memory_level !== "organization" && inScope(s.team, s.workstream));
  const fAgents = agents.filter((a) => !scope.team || a.team === scope.team || a.team === "");

  const scopeLabel = scope.workstream
    ? org?.teams.flatMap((t) => t.projects).find((p) => slug(p.name) === scope.workstream)?.name
    : scope.team
    ? org?.teams.find((t) => slug(t.name) === scope.team)?.name
    : "Toute l'organisation";

  return (
    <main className="mx-auto max-w-[1360px] px-6 py-5">
      {/* Top bar */}
      <header className="mb-3 flex items-center justify-between border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-brand" style={{ fontWeight: 800 }}>W</div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-ink">Weave</h1>
              <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-soft">Cognitive Runtime</span>
            </div>
            <p className="text-xs text-muted">Bac à sable · ton équipe utilise l&apos;IA sur plusieurs projets, regarde la mémoire se créer</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <select value={orgId} onChange={(e) => switchOrg(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none">
            {presets.map((p) => <option key={p.org} value={p.org}>{p.name}</option>)}
          </select>
          {llm && <span className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-soft">{llm}</span>}
          <span className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${connected ? "text-brand-ink bg-mint" : "text-muted bg-surface border border-line"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-brand-deep" : "bg-muted"}`} />{connected ? "en direct" : "hors ligne"}
          </span>
          <button onClick={reset} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft hover:bg-mint2">Réinitialiser</button>
          <button onClick={simulate} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-sm hover:bg-brand-deep hover:text-white">Simuler l&apos;activité</button>
        </div>
      </header>

      {/* Scope bar */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted">Vue :</span>
        <button onClick={() => setScope({})}
          className={`rounded-full px-2.5 py-1 text-xs ${!scope.team ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:bg-mint2"}`}>
          Organisation
        </button>
        {org?.teams.map((t) => {
          const ts = slug(t.name);
          const active = scope.team === ts && !scope.workstream;
          return (
            <div key={t.name} className="flex items-center gap-1">
              <button onClick={() => setScope({ team: ts })}
                className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-teal text-white" : "border border-line bg-surface text-ink-soft hover:bg-mint2"}`}>
                {t.name}
              </button>
              {scope.team === ts && t.projects.map((p) => {
                const ws = slug(p.name);
                return (
                  <button key={p.name} onClick={() => setScope({ team: ts, workstream: ws })}
                    className={`rounded-full px-2 py-1 text-[11px] ${scope.workstream === ws ? "bg-brand-deep text-white" : "border border-line bg-surface text-muted hover:bg-mint"}`}>
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
        <div className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm animate-emerge ${
          flash.kind === "agent" ? "border-gold/50 bg-gold-tint text-[#8a5a00]"
          : flash.kind === "org" ? "border-[#9a6b00]/40 bg-gold-tint text-[#8a5a00]"
          : "border-brand-deep/40 bg-mint text-brand-ink"}`}>
          <span className="text-base">{flash.kind === "agent" ? "◆" : "✦"}</span>
          <span className="font-medium">{flash.msg}</span>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Live feed */}
        <section className="col-span-4 rounded-2xl border border-line bg-surface p-4">
          <PanelTitle icon="📡" count={feed.length}>Flux d&apos;activité IA</PanelTitle>
          <div className="mt-3 max-h-[540px] space-y-1.5 overflow-y-auto pr-1">
            {feed.length === 0 && <Empty>Clique « Simuler l&apos;activité » : chaque personne de chaque équipe se met à travailler avec l&apos;IA.</Empty>}
            {feed.map((ev, i) => <FeedRow key={i} ev={ev} />)}
          </div>
        </section>

        {/* Knowledge */}
        <section className="col-span-4 rounded-2xl border border-line bg-surface p-4">
          <PanelTitle icon="🧠" count={fFacts.length}>Mémoire {scope.team ? `· ${scopeLabel}` : "partagée"}</PanelTitle>
          <div className="mt-3 max-h-[540px] space-y-1.5 overflow-y-auto pr-1">
            {fFacts.length === 0 && <Empty>—</Empty>}
            {fFacts.slice(0, 30).map((f) => (
              <div key={f.id} className="rounded-lg border border-line-soft bg-cream px-2.5 py-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag>{f.ftype}</Tag>
                  <LevelTag level={f.memory_level} />
                  {f.workstream && <span className="rounded bg-mint2 px-1.5 py-0.5 text-[10px] text-teal">{f.workstream}</span>}
                  <span className="text-muted">{f.author}</span>
                </div>
                <div className="mt-1 text-ink-soft">{f.content}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Skills */}
        <section className="col-span-4 rounded-2xl border border-line bg-surface p-4">
          <PanelTitle icon="✦" count={orgSkills.length + projSkills.length}>Compétences vivantes</PanelTitle>
          <p className="mt-0.5 text-xs text-muted">Née des projets · promues au niveau org quand partagées entre équipes.</p>
          <div className="mt-3 max-h-[520px] space-y-2.5 overflow-y-auto pr-1">
            {orgSkills.length === 0 && projSkills.length === 0 && <Empty>Aucune encore. Simule l&apos;activité et regarde-les apparaître.</Empty>}
            {(!scope.team || scope.team) && orgSkills.map((s) => <SkillCard key={s.id} s={s} newest={newest} org />)}
            {projSkills.map((s) => <SkillCard key={s.id} s={s} newest={newest} />)}
          </div>
        </section>
      </div>

      {/* Agents */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <PanelTitle icon="🤖" count={fAgents.length}>Agents · un spécialiste par équipe, né de ses compétences</PanelTitle>
        <div className="mt-3 grid grid-cols-12 gap-4">
          <div className="col-span-5 space-y-2">
            {fAgents.map((a) => (
              <div key={a.id} className={`rounded-xl border p-3 ${
                a.name === newest && a.status === "pending" ? "border-gold bg-gold-tint animate-emerge"
                : a.status === "pending" ? "border-gold/60 bg-gold-tint" : "border-line bg-cream"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium text-ink">{a.status === "pending" ? "◆" : a.domain === "general" ? "◇" : "✦"} {a.name}</span>
                  {a.status === "pending"
                    ? <button onClick={() => approveAgent(a.name)} className="rounded-md bg-ink px-2.5 py-0.5 text-[11px] font-medium text-brand hover:bg-brand-deep hover:text-white">Approuver</button>
                    : <span className="rounded-md border border-brand-deep/30 bg-mint px-1.5 py-0.5 text-[10px] text-brand-ink">actif</span>}
                </div>
                <div className="mt-0.5 text-[11px] text-muted">{a.derived_from}</div>
                {a.skills.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {a.skills.map((s) => <span key={s} className="rounded bg-mint2 px-1.5 py-0.5 text-[10px] text-brand-ink">✦ {s.split("/").pop()}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Manual inject */}
          <div className="col-span-7">
            <SubHead>Injecter un message (tu joues un membre de l&apos;équipe)</SubHead>
            <div className="flex gap-2">
              <input value={injectText} onChange={(e) => setInjectText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && inject()}
                className="flex-1 rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-brand-deep focus:bg-surface"
                placeholder={scope.workstream ? `Message dans ${scopeLabel}…` : "Sélectionne une équipe/projet dans la barre de vue, puis écris…"} />
              <button onClick={inject} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-soft">Envoyer</button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Répète une même question dans un projet (5×) et regarde une compétence naître. Pose la même dans deux équipes → une compétence d&apos;organisation.
            </p>
          </div>
        </div>
      </section>

      {/* Ask */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <PanelTitle icon="💬">Interroger la mémoire partagée</PanelTitle>
        <div className="mt-3 flex gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
            className="flex-1 rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-brand-deep focus:bg-surface"
            placeholder="Pose une question à l'organisation…" />
          <button onClick={ask} disabled={asking} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-deep hover:text-white disabled:opacity-50">{asking ? "…" : "Demander"}</button>
        </div>
        {answer && (
          <div className="mt-4 grid grid-cols-12 gap-4">
            <div className="col-span-7">
              {answer.skill_used && (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-brand-deep/30 bg-mint px-2 py-1 text-xs text-brand-ink">
                  ✦ compétence utilisée : <span className="font-mono">{answer.skill_used}</span>
                </div>
              )}
              <div className="whitespace-pre-wrap rounded-xl border border-line bg-cream p-3 text-sm leading-relaxed text-ink">{answer.answer}</div>
            </div>
            <div className="col-span-5">
              <SubHead>Provenance · couches mémoire</SubHead>
              <div className="space-y-2">
                {answer.layers.map((l) => (
                  <div key={l.level} className={`rounded-lg border p-2 ${LEVEL_STYLE[l.level] || "border-line"}`}>
                    <div className="text-xs font-semibold capitalize">{l.level}</div>
                    <ul className="mt-1 space-y-0.5">
                      {l.facts.slice(0, 4).map((f, i) => <li key={i} className="text-[11px] text-ink-soft"><span className="opacity-70">{f.author} :</span> {f.content}</li>)}
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
    <div className={`rounded-xl border p-3 ${
      s.name === newest ? "border-brand-deep bg-mint animate-emerge"
      : org ? "border-[#e4c98a] bg-gold-tint" : "border-line bg-cream"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-medium text-ink">{org ? "🏛" : "✦"} {s.name}</span>
        <LevelTag level={s.memory_level} />
      </div>
      <div className="mt-0.5 text-xs text-ink-soft">{s.trigger}</div>
      <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-2 text-[11px] leading-relaxed text-ink-soft">{s.body}</pre>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <span>référents :</span>
        {s.referents.map((r) => <span key={r} className="rounded bg-mint2 px-1.5 py-0.5 text-ink">{r}</span>)}
        <span className="ml-auto">{s.sources.length} sources</span>
      </div>
    </div>
  );
}

function PanelTitle({ children, count, icon }: { children: React.ReactNode; count?: number; icon?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">{icon && <span>{icon}</span>}{children}</h2>
      {count !== undefined && <span className="rounded-full bg-cream px-2 py-0.5 text-xs text-muted">{count}</span>}
    </div>
  );
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</h3>;
}
function FeedRow({ ev }: { ev: Feed }) {
  if (ev.type === "event_ingested")
    return <div className="rounded-lg border border-line-soft bg-cream px-2.5 py-1.5 text-xs"><span className="mr-1.5">🤖</span><span className="text-muted">{ev.actor}</span><span className="ml-1.5 text-ink">{ev.text}</span></div>;
  if (ev.type === "fact_extracted")
    return <div className="px-2.5 py-0.5 text-[11px] text-muted"><Tag>{ev.ftype}</Tag> <span className="ml-1">fait · {ev.topic}</span></div>;
  if (ev.type === "pattern_observed") {
    const pct = Math.min(100, Math.round(((ev.occurrences || 0) / (ev.threshold || 5)) * 100));
    return <div className="rounded-lg border border-gold/30 bg-gold-tint px-2.5 py-1 text-[11px] text-[#8a5a00]">schéma « {ev.signature} » — {ev.occurrences}/{ev.threshold}<div className="mt-1 h-1 w-full rounded bg-white"><div className="h-1 rounded bg-gold" style={{ width: `${pct}%` }} /></div></div>;
  }
  if (ev.type === "skill_emerged") {
    const isOrg = (ev.name || "").startsWith("org/");
    return <div className={`rounded-lg border px-2.5 py-1.5 text-xs animate-emerge ${isOrg ? "border-[#9a6b00]/40 bg-gold-tint text-[#8a5a00]" : "border-brand-deep bg-mint text-brand-ink"}`}>{isOrg ? "🏛" : "✦"} <b>{isOrg ? "compétence org promue" : "compétence née"}</b> : {ev.name}</div>;
  }
  if (ev.type === "agent_emerged")
    return <div className="rounded-lg border border-gold bg-gold-tint px-2.5 py-1.5 text-xs text-[#8a5a00] animate-emerge">◆ <b>agent émergé</b> : {ev.name}</div>;
  return null;
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-mint2 px-1.5 py-0.5 text-[10px] uppercase text-teal">{children}</span>;
}
function LevelTag({ level }: { level: string }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] capitalize ${LEVEL_STYLE[level] || "border-line text-muted"}`}>{level}</span>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}
