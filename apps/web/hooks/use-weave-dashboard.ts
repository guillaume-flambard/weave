"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { askMemory, approveAgent as approveAgentRequest, API, getAgents, getFacts, getHealth, getOrgConfig, getPresets, getSkills, injectMessage, loadOrg, resetProject, simulateOrg } from "../lib/api";
import type { Agent, Answer, Fact, Feed, OrgCfg, Skill } from "../lib/types";

export type Scope = { team?: string; workstream?: string };
export type Flash = { msg: string; kind: "skill" | "agent" | "org" } | null;

export function useWeaveDashboard(notifySkillEmerged: () => void) {
  const [orgId, setOrgId] = useState("pennylane");
  const [org, setOrg] = useState<OrgCfg | null>(null);
  const [presets, setPresets] = useState<OrgCfg[]>([]);
  const [scope, setScope] = useState<Scope>({});

  const [feed, setFeed] = useState<Feed[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [flash, setFlash] = useState<Flash>(null);
  const [newest, setNewest] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [llm, setLlm] = useState("");

  const [question, setQuestion] = useState("Comment relancer la synchro bancaire ?");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);

  const [injectText, setInjectText] = useState("");

  const refetch = useCallback(async (id: string) => {
    try {
      const [s, f, ag] = await Promise.all([getSkills(id), getFacts(id), getAgents(id)]);
      setSkills(s);
      setFacts(f);
      setAgents(ag);
    } catch {}
  }, []);

  const loadOrgConfig = useCallback(async (id: string) => {
    const cfg = await getOrgConfig(id);
    setOrg(cfg);
  }, []);

  useEffect(() => {
    getHealth().then((d) => setLlm(d.llm || "")).catch(() => {});
    getPresets().then(setPresets).catch(() => {});
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
        setFlash({
          msg: isOrg
            ? `Compétence d'organisation promue : ${ev.name} — convention partagée entre équipes`
            : `Compétence née du travail de l'équipe : ${ev.name}`,
          kind: isOrg ? "org" : "skill",
        });
        setNewest(ev.name || null);
        notifySkillEmerged();
        setTimeout(() => setFlash(null), 6000);
      }
      if (ev.type === "agent_emerged") {
        setFlash({ msg: `Agent spécialiste émergé : ${ev.name} (en attente d'approbation)`, kind: "agent" });
        setNewest(ev.name || null);
        setTimeout(() => setFlash(null), 6000);
      }
      const now = Date.now();
      if (now - throttle.current > 500) {
        throttle.current = now;
        refetch(orgId);
      }
    };
    return () => es.close();
  }, [loadOrgConfig, notifySkillEmerged, orgId, refetch]);

  const switchOrg = useCallback(async (id: string) => {
    await loadOrg(id);
    setFeed([]);
    setSkills([]);
    setFacts([]);
    setAgents([]);
    setAnswer(null);
    setScope({});
    setNewest(null);
    setOrgId(id);
    loadOrgConfig(id);
    setTimeout(() => refetch(id), 300);
  }, [loadOrgConfig, refetch]);

  const simulate = useCallback(async () => {
    await simulateOrg(orgId);
  }, [orgId]);

  const reset = useCallback(async () => {
    await resetProject(orgId);
    setFeed([]);
    setAnswer(null);
    setNewest(null);
    setTimeout(() => refetch(orgId), 300);
  }, [orgId, refetch]);

  const ask = useCallback(async () => {
    setAsking(true);
    setAnswer(null);
    try {
      const res = await askMemory(orgId, question);
      setAnswer(res);
    } finally {
      setAsking(false);
    }
  }, [orgId, question]);

  const approveAgent = useCallback(async (name: string) => {
    await approveAgentRequest(orgId, name);
    setTimeout(() => refetch(orgId), 200);
  }, [orgId, refetch]);

  const inject = useCallback(async () => {
    if (!injectText.trim()) return;
    await injectMessage(orgId, scope.team || "", scope.workstream || "", injectText, "vous");
    setInjectText("");
    setTimeout(() => refetch(orgId), 300);
  }, [injectText, orgId, refetch, scope.team, scope.workstream]);

  return {
    orgId,
    setOrgId,
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
  };
}
