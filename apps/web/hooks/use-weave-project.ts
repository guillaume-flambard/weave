"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveAgent as approveAgentApi,
  askMemory,
  getAgents,
  getFacts,
  getHealth,
  getOrgConfig,
  getPresets,
  getSkills,
  getStats,
  loadOrg,
  runAgent,
} from "../lib/api";
import type { Agent, Answer, Fact, OrgCfg, Skill, WeaveStats } from "../lib/types";

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    if (/Failed to fetch|NetworkError|Load failed/i.test(error.message)) {
      return "API hors ligne ou inaccessible. Vérifiez que weave-api tourne.";
    }
    return error.message;
  }
  return "Une erreur inattendue est survenue.";
}

export function useWeaveProject(initialOrgId = "pennylane") {
  const [orgId, setOrgId] = useState(initialOrgId);
  const [org, setOrg] = useState<OrgCfg | null>(null);
  const [presets, setPresets] = useState<OrgCfg[]>([]);
  const [stats, setStats] = useState<WeaveStats | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);
  const [llm, setLlm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    const [st, sk, f, ag] = await Promise.all([
      getStats(id),
      getSkills(id),
      getFacts(id),
      getAgents(id),
    ]);
    setStats(st);
    setSkills(sk);
    setFacts(f);
    setAgents(ag);
    if (st.llm) setLlm(st.llm);
  }, []);

  const loadAll = useCallback(async (id: string) => {
    setError(null);
    const cfg = await getOrgConfig(id);
    setOrg(cfg);
    await refresh(id);
  }, [refresh]);

  useEffect(() => {
    getPresets().then(setPresets).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const h = await getHealth();
        if (cancelled) return;
        setConnected(true);
        setLlm(h.llm ?? "");
        await loadAll(orgId);
      } catch (e) {
        if (!cancelled) {
          setConnected(false);
          setError(normalizeError(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll, orgId]);

  const switchOrg = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await loadOrg(id);
      setOrgId(id);
      await loadAll(id);
    } catch (e) {
      setError(normalizeError(e));
    } finally {
      setLoading(false);
    }
  }, [loadAll]);

  const approveAgent = useCallback(async (name: string) => {
    await approveAgentApi(orgId, name);
    await refresh(orgId);
  }, [orgId, refresh]);

  const ask = useCallback(async (question: string) => {
    return askMemory(orgId, question);
  }, [orgId]);

  const runAgentTask = useCallback(async (agent: string, task: string) => {
    return runAgent(orgId, agent, task);
  }, [orgId]);

  const isEmpty = !loading && !error && (stats?.events ?? 0) === 0 && facts.length === 0 && skills.length === 0;

  return {
    orgId,
    org,
    presets,
    stats,
    skills,
    facts,
    agents,
    connected,
    llm,
    loading,
    error,
    isEmpty,
    refresh: () => refresh(orgId),
    switchOrg,
    approveAgent,
    ask,
    runAgentTask,
  };
}

export type WeaveProject = ReturnType<typeof useWeaveProject>;
