"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { askMemory, approveAgent as approveAgentRequest, API, getAgents, getFacts, getHealth, getOrgConfig, getPresets, getSkills, getStats, injectMessage, loadOrg, resetProject, simulateOrg } from "../lib/api";
import { useLocale } from "../lib/i18n/context";
import type { Agent, Answer, Fact, Feed, OrgCfg, Skill, WeaveStats } from "../lib/types";
import type { Scope } from "../lib/scope";

export type { Scope };
export type Flash = { msg: string; kind: "skill" | "agent" | "org" } | null;

export type SimProgress = {
  /** Total events in store when simulation started */
  startEvents: number;
  /** Number of new messages being processed in this batch */
  batchSize: number;
  events: number;
  /** Events ingested this batch (from live SSE), used when stats lag */
  ingested: number;
  facts: number;
  skills: number;
};

export function simProgressMetrics(p: SimProgress) {
  const fromStats = Math.max(0, p.events - p.startEvents);
  const processed = Math.min(p.batchSize, Math.max(fromStats, p.ingested));
  const pct = p.batchSize > 0 ? Math.min(100, Math.round((processed / p.batchSize) * 100)) : 100;
  return { processed, pct, target: p.batchSize };
}

export function useWeaveDashboard(notifySkillEmerged: () => void) {
  const { t } = useLocale();
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

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);

  const [injectText, setInjectText] = useState("");
  const [pendingAction, setPendingAction] = useState<"simulate" | "reset" | "ask" | "inject" | "approveAgent" | "switchOrg" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [simProgress, setSimProgress] = useState<SimProgress | null>(null);
  const [dataReady, setDataReady] = useState(false);

  const orgIdRef = useRef(orgId);
  orgIdRef.current = orgId;
  const notifyRef = useRef(notifySkillEmerged);
  notifyRef.current = notifySkillEmerged;
  const tRef = useRef(t);
  tRef.current = t;
  const pendingActionRef = useRef(pendingAction);
  pendingActionRef.current = pendingAction;
  const finishSimulationRef = useRef<() => void>(() => {});

  const normalizeError = useCallback((error: unknown) => {
    if (error instanceof Error) {
      if (/Failed to fetch|NetworkError|Load failed|INSUFFICIENT_RESOURCES/i.test(error.message)) {
        return t("errors.apiOffline");
      }
      return error.message;
    }
    return t("errors.unexpected");
  }, [t]);

  useEffect(() => {
    setQuestion((prev) => prev || t("workspace.ask.defaultQuestion"));
  }, [t]);

  const refetch = useCallback(async (id: string) => {
    try {
      const [s, f, ag] = await Promise.all([getSkills(id), getFacts(id), getAgents(id)]);
      setSkills(s);
      setFacts(f);
      setAgents(ag);
    } catch (error) {
      setErrorMessage(normalizeError(error));
    }
  }, [normalizeError]);

  const finishSimulation = useCallback(() => {
    setPendingAction(null);
    setSimProgress(null);
    void refetch(orgIdRef.current);
  }, [refetch]);
  finishSimulationRef.current = finishSimulation;

  // Bootstrap: health + presets once on mount.
  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((h) => {
        if (cancelled) return;
        setLlm(h.llm || "");
        setConnected(true);
        setErrorMessage(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setConnected(false);
        setErrorMessage(normalizeError(error));
      });
    getPresets()
      .then((p) => { if (!cancelled) setPresets(p); })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [normalizeError]);

  // Reload org-scoped data when org changes (no new SSE).
  useEffect(() => {
    let cancelled = false;
    setDataReady(false);
    (async () => {
      try {
        const cfg = await getOrgConfig(orgId);
        if (cancelled) return;
        setOrg(cfg);
        const [s, f, ag] = await Promise.all([getSkills(orgId), getFacts(orgId), getAgents(orgId)]);
        if (cancelled) return;
        setSkills(s);
        setFacts(f);
        setAgents(ag);
      } catch (error) {
        if (!cancelled) setErrorMessage(normalizeError(error));
      } finally {
        if (!cancelled) setDataReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, normalizeError]);

  // Single SSE connection for the lifetime of the dashboard.
  const refetchThrottle = useRef(0);
  const apiKey = process.env.NEXT_PUBLIC_WEAVE_API_KEY || "";
  useEffect(() => {
    const eventsUrl = apiKey
      ? `${API}/events?api_key=${encodeURIComponent(apiKey)}`
      : `${API}/events`;
    const es = new EventSource(eventsUrl);
    let healthCheckTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleHealthCheck = () => {
      if (healthCheckTimer) return;
      healthCheckTimer = setTimeout(() => {
        healthCheckTimer = null;
        getHealth()
          .then((h) => {
            setLlm(h.llm || "");
            setConnected(true);
            setErrorMessage(null);
          })
          .catch(() => setConnected(false));
      }, 5000);
    };

    es.onopen = () => {
      setConnected(true);
      setErrorMessage(null);
    };
    es.onerror = () => scheduleHealthCheck();
    es.onmessage = (e) => {
      const ev: Feed = JSON.parse(e.data);
      setFeed((prev) => [ev, ...prev].slice(0, 70));
      const tr = tRef.current;
      if (ev.type === "event_ingested" && pendingActionRef.current === "simulate") {
        setSimProgress((prev) => (prev ? { ...prev, ingested: prev.ingested + 1 } : prev));
      }
      if (ev.type === "simulation_complete") {
        finishSimulationRef.current();
      }
      if (ev.type === "skill_emerged") {
        const isOrg = (ev.name || "").startsWith("org/");
        setFlash({
          msg: isOrg
            ? tr("flash.orgSkill", { name: ev.name || "" })
            : tr("flash.teamSkill", { name: ev.name || "" }),
          kind: isOrg ? "org" : "skill",
        });
        setNewest(ev.name || null);
        notifyRef.current();
        setTimeout(() => setFlash(null), 6000);
      }
      if (ev.type === "agent_emerged") {
        setFlash({ msg: tr("flash.agent", { name: ev.name || "" }), kind: "agent" });
        setNewest(ev.name || null);
        setTimeout(() => setFlash(null), 6000);
      }
      const now = Date.now();
      if (now - refetchThrottle.current > 500) {
        refetchThrottle.current = now;
        const id = orgIdRef.current;
        Promise.all([getSkills(id), getFacts(id), getAgents(id)])
          .then(([s, f, ag]) => { setSkills(s); setFacts(f); setAgents(ag); })
          .catch(() => { /* SSE-driven refresh is best-effort */ });
      }
    };

    return () => {
      es.close();
      if (healthCheckTimer) clearTimeout(healthCheckTimer);
    };
  }, [apiKey]);

  const switchOrg = useCallback(async (id: string) => {
    setPendingAction("switchOrg");
    setErrorMessage(null);
    try {
      await loadOrg(id);
      setFeed([]);
      setSkills([]);
      setFacts([]);
      setAgents([]);
      setAnswer(null);
      setScope({});
      setNewest(null);
      setDataReady(false);
      setOrgId(id);
      setTimeout(() => refetch(id), 300);
    } catch (error) {
      setErrorMessage(normalizeError(error));
    } finally {
      setPendingAction(null);
    }
  }, [normalizeError, refetch]);

  const simulate = useCallback(async () => {
    setPendingAction("simulate");
    setErrorMessage(null);
    setSimProgress(null);
    try {
      const initial = await getStats(orgId);
      const res = await simulateOrg(orgId) as { events?: number };
      const batchSize = res.events ?? 66;
      setSimProgress({
        startEvents: initial.events,
        batchSize,
        events: initial.events,
        ingested: 0,
        facts: initial.facts,
        skills: initial.skills.length,
      });
    } catch (error) {
      setErrorMessage(normalizeError(error));
      setPendingAction(null);
    }
  }, [orgId, normalizeError]);

  const simProgressRef = useRef(simProgress);
  simProgressRef.current = simProgress;
  useEffect(() => {
    if (!simProgressRef.current || pendingAction !== "simulate") return;
    const interval = setInterval(async () => {
      try {
        const stats = await getStats(orgId);
        const prev = simProgressRef.current;
        if (!prev) return;
        if (
          stats.events >= prev.startEvents + prev.batchSize
          || prev.ingested >= prev.batchSize
        ) {
          finishSimulationRef.current();
          return;
        }
        setSimProgress({
          ...prev,
          events: stats.events,
          facts: stats.facts,
          skills: stats.skills.length,
        });
        if (stats.llm) setLlm(stats.llm);
      } catch {
        // ignore polling errors during simulation
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [pendingAction, orgId, refetch]);

  const reset = useCallback(async () => {
    setPendingAction("reset");
    setErrorMessage(null);
    try {
      await resetProject(orgId);
      setFeed([]);
      setAnswer(null);
      setNewest(null);
      setTimeout(() => refetch(orgId), 300);
    } catch (error) {
      setErrorMessage(normalizeError(error));
    } finally {
      setPendingAction(null);
    }
  }, [orgId, refetch, normalizeError]);

  const ask = useCallback(async () => {
    setAsking(true);
    setPendingAction("ask");
    setErrorMessage(null);
    setAnswer(null);
    try {
      const res = await askMemory(orgId, question);
      setAnswer(res);
    } catch (error) {
      setErrorMessage(normalizeError(error));
    } finally {
      setAsking(false);
      setPendingAction(null);
    }
  }, [orgId, question, normalizeError]);

  const approveAgent = useCallback(async (name: string) => {
    setPendingAction("approveAgent");
    setErrorMessage(null);
    try {
      await approveAgentRequest(orgId, name);
      setTimeout(() => refetch(orgId), 200);
    } catch (error) {
      setErrorMessage(normalizeError(error));
    } finally {
      setPendingAction(null);
    }
  }, [orgId, refetch, normalizeError]);

  const inject = useCallback(async () => {
    if (!injectText.trim()) return;
    setPendingAction("inject");
    setErrorMessage(null);
    try {
      await injectMessage(orgId, scope.team || "", scope.workstream || "", injectText, "vous");
      setInjectText("");
      setTimeout(() => refetch(orgId), 300);
    } catch (error) {
      setErrorMessage(normalizeError(error));
    } finally {
      setPendingAction(null);
    }
  }, [injectText, orgId, refetch, scope.team, scope.workstream, normalizeError]);

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
    pendingAction,
    simProgress,
    errorMessage,
    dataReady,
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
