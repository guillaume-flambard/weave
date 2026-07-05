"use client";

import { useCallback, useEffect, useState } from "react";
import { askMemory, getStats, runAgent } from "../lib/api";
import type { WeaveStats } from "../lib/types";
import { useWeaveDash } from "./weave-context";

/** Project-scoped read helpers — backed by the shared WeaveProvider dashboard. */
export function useWeaveProject() {
  const dash = useWeaveDash();
  const [stats, setStats] = useState<WeaveStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStats = useCallback(async (id: string) => {
    const st = await getStats(id);
    setStats(st);
    if (st.llm) {
      /* llm already on dash from health/SSE */
    }
    return st;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refreshStats(dash.orgId)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dash.orgId, dash.skills.length, dash.facts.length, dash.agents.length, refreshStats]);

  const ask = useCallback(
    (question: string) => askMemory(dash.orgId, question),
    [dash.orgId],
  );

  const runAgentTask = useCallback(
    (agent: string, task: string) => runAgent(dash.orgId, agent, task),
    [dash.orgId],
  );

  const isEmpty =
    !loading &&
    !dash.errorMessage &&
    (stats?.events ?? 0) === 0 &&
    dash.facts.length === 0 &&
    dash.skills.length === 0;

  return {
    orgId: dash.orgId,
    org: dash.org,
    presets: dash.presets,
    stats,
    skills: dash.skills,
    facts: dash.facts,
    agents: dash.agents,
    connected: dash.connected,
    llm: dash.llm,
    loading,
    error: dash.errorMessage,
    isEmpty,
    refresh: () => refreshStats(dash.orgId),
    switchOrg: dash.switchOrg,
    approveAgent: dash.approveAgent,
    ask,
    runAgentTask,
  };
}

export type WeaveProject = ReturnType<typeof useWeaveProject>;
