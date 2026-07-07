"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { askMemory } from "../../lib/api";
import { useLocale } from "../../lib/i18n/context";
import { useWeaveContext } from "../../hooks/weave-context";
import { intentLabel, parseChatInput } from "./chat-orchestrator";
import { useOnboarding } from "./onboarding/onboarding-context";
import type { ChatBlock, ChatTurn, ParsedIntent } from "./types";

const CHAT_STORAGE_KEY = "weave.chat.turns";

function newTurnId(): string {
  return crypto.randomUUID();
}

/** Human-readable label for the user bubble, so slash commands never surface as "/simulate". */
function friendlyLabel(
  intent: ParsedIntent,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  switch (intent.kind) {
    case "ask": return intent.question;
    case "simulate": return t("chat.chipSimulate");
    case "sources": return t("chat.chipConnect");
    case "agents": return t("chat.cmdAgents");
    case "memory": return t("chat.cmdMemory");
    case "overview": return t("chat.cmdOverview");
    case "govern": return t("chat.cmdGovern");
    case "scope": return `${t("chat.cmdScope")} · ${intent.team}`;
    case "help": return t("chat.cmdHelp");
    case "freeform": return intent.text;
  }
}

export function useWeaveChat(onSkillEmerged: () => void = () => {}) {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const onboarding = useOnboarding();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const cmdHandled = useRef(false);
  const feedSeen = useRef(0);
  const streamingSim = useRef(false);
  const onboardingSeeded = useRef(false);
  const simulateDoneHandled = useRef(false);
  const conversationRestored = useRef(false);

  const { dash, setSkillNotify } = useWeaveContext();

  useEffect(() => {
    setSkillNotify(onSkillEmerged);
    return () => setSkillNotify(() => {});
  }, [onSkillEmerged, setSkillNotify]);

  // Persist the conversation per tab so leaving the chat (Réglages, a skill/agent
  // page…) and coming back doesn't lose it. Restore once on mount, then mirror
  // every change. sessionStorage (not local) keeps it scoped to the tab session.
  useEffect(() => {
    if (conversationRestored.current) return;
    conversationRestored.current = true;
    try {
      const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as ChatTurn[];
        if (Array.isArray(saved) && saved.length > 0) setTurns(saved);
      }
    } catch {
      /* ignore corrupt/unavailable storage */
    }
  }, []);

  useEffect(() => {
    if (!conversationRestored.current) return;
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(turns));
    } catch {
      /* ignore quota/unavailable storage */
    }
  }, [turns]);

  // "Repartir de zéro" clears the memory; clear the conversation with it so the chat
  // returns to a fresh welcome instead of showing turns about now-deleted data.
  const resetSeen = useRef(false);
  useEffect(() => {
    if (dash.pendingAction === "reset") {
      if (!resetSeen.current) {
        resetSeen.current = true;
        setTurns([]);
        try {
          sessionStorage.removeItem(CHAT_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
    } else {
      resetSeen.current = false;
    }
  }, [dash.pendingAction]);

  const appendTurn = useCallback((userText: string, blocks: ChatBlock[]) => {
    setTurns((prev) => [...prev, { id: newTurnId(), userText, blocks }]);
  }, []);

  const appendBlocks = useCallback((blocks: ChatBlock[]) => {
    setTurns((prev) => {
      if (prev.length === 0) {
        return [{ id: newTurnId(), blocks }];
      }
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, blocks: [...last.blocks, ...blocks] }];
    });
  }, []);

  const buildIntentBlocks = useCallback(async (
    intent: ParsedIntent,
    opts?: { deferFeed?: boolean },
  ): Promise<ChatBlock[]> => {
    const blocks: ChatBlock[] = [];
    switch (intent.kind) {
      case "sources":
        blocks.push({ type: "connector_setup" });
        break;
      case "simulate":
        streamingSim.current = true;
        feedSeen.current = dash.feed.length;
        blocks.push({ type: "sim_progress" });
        await dash.simulate();
        if (!opts?.deferFeed) {
          blocks.push({ type: "feed_strip", limit: 12 });
        }
        break;
      case "ask": {
        blocks.push({ type: "system", content: t("chat.askSearching"), kind: "info" });
        const res = await askMemory(dash.orgId, intent.question);
        if (res.answer?.trim()) {
          blocks.push({ type: "answer", data: res });
        } else {
          blocks.push({ type: "system", content: t("chat.noMemory"), kind: "info" });
        }
        break;
      }
      case "agents":
        blocks.push({ type: "agent_queue" });
        break;
      case "memory":
        blocks.push({ type: "memory_snapshot" });
        break;
      case "overview":
        blocks.push({ type: "kpi_overview" });
        break;
      case "govern":
        blocks.push({ type: "governance_summary" });
        break;
      case "scope":
        dash.setScope(intent.team === "org" ? {} : { team: intent.team });
        blocks.push({
          type: "system",
          content: t("chat.scopeSet", { scope: intent.team }),
          kind: "success",
        });
        break;
      case "help":
        blocks.push({ type: "text", role: "assistant", content: t("chat.helpBody") });
        break;
      case "freeform":
        blocks.push({ type: "text", role: "assistant", content: t("chat.freeformHint") });
        break;
    }
    return blocks;
  }, [dash, t]);

  const runIntent = useCallback(async (intent: ParsedIntent, displayText?: string) => {
    const label = displayText ?? intentLabel(intent);
    setBusy(true);
    try {
      const assistantBlocks = await buildIntentBlocks(intent);
      appendTurn(label, assistantBlocks);
    } catch (e) {
      appendTurn(label, [{
        type: "system",
        content: e instanceof Error ? e.message : t("errors.unexpected"),
        kind: "error",
      }]);
    }
    setBusy(false);
  }, [appendTurn, buildIntentBlocks, t]);

  const handleOnboardingAction = useCallback(async () => {
    const step = onboarding.currentStep;
    if (!step || busy) return;

    setBusy(true);
    const userLabel = t(step.userLabelKey);

    try {
      if (step.id === "govern") {
        appendTurn(userLabel, [
          { type: "text", role: "assistant", content: `${t("onboarding.done.title")}\n\n${t("onboarding.done.body")}` },
        ]);
        onboarding.complete();
        setBusy(false);
        return;
      }

      let intentBlocks: ChatBlock[] = [];
      if (step.intent) {
        let intent = step.intent;
        if (intent.kind === "ask") {
          intent = { kind: "ask", question: t("workspace.ask.defaultQuestion") };
        }
        intentBlocks = await buildIntentBlocks(intent, { deferFeed: step.waitForSimulate });
      }

      if (step.waitForSimulate) {
        simulateDoneHandled.current = false;
        onboarding.markAwaitingSimulate();
        appendTurn(userLabel, intentBlocks);
        setBusy(false);
        return;
      }

      const next = onboarding.advance();
      const blocks = [...intentBlocks];
      if (next) {
        blocks.push({ type: "onboarding", stepId: next.id });
      }
      appendTurn(userLabel, blocks);
    } catch (e) {
      appendTurn(t(step.userLabelKey), [{
        type: "system",
        content: e instanceof Error ? e.message : t("errors.unexpected"),
        kind: "error",
      }]);
    }
    setBusy(false);
  }, [appendTurn, buildIntentBlocks, busy, onboarding, t]);

  const handleOnboardingSkip = useCallback(() => {
    appendTurn(t("onboarding.skip"), [
      { type: "text", role: "assistant", content: t("onboarding.skippedBody") },
    ]);
    onboarding.skip();
  }, [appendTurn, onboarding, t]);

  const submit = useCallback(async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;

    if (onboarding.isActive) {
      setInput("");
      appendBlocks([{ type: "system", content: t("onboarding.composerLocked"), kind: "info" }]);
      return;
    }

    setInput("");
    const intent = parseChatInput(text);
    // Echo a human label in the user bubble, never the raw "/simulate" etc.
    const label = text.startsWith("/") ? friendlyLabel(intent, t) : text;
    await runIntent(intent, label);
  }, [busy, input, onboarding.isActive, runIntent, setInput, appendBlocks, t]);

  const runChip = useCallback((cmd: string) => {
    if (onboarding.isActive) {
      appendBlocks([{ type: "system", content: t("onboarding.composerLocked"), kind: "info" }]);
      return;
    }
    void submit(cmd);
  }, [appendBlocks, onboarding.isActive, submit, t]);

  // Seed onboarding at current persisted step
  useEffect(() => {
    if (!onboarding.hydrated || onboarding.status === "loading") return;
    const restart = searchParams.get("onboarding") === "restart";
    if (restart && onboarding.isActive) {
      onboardingSeeded.current = true;
      setTurns([{ id: newTurnId(), blocks: [{ type: "onboarding", stepId: "intro" }] }]);
      return;
    }
    if (onboardingSeeded.current) return;
    if (!onboarding.isActive) return;
    if (searchParams.get("cmd")) return;
    onboardingSeeded.current = true;
    const stepId = onboarding.currentStepId ?? "intro";
    setTurns([{ id: newTurnId(), blocks: [{ type: "onboarding", stepId }] }]);
  }, [onboarding.hydrated, onboarding.isActive, onboarding.status, onboarding.currentStepId, searchParams]);

  // URL ?cmd=
  useEffect(() => {
    if (cmdHandled.current || onboarding.isActive) return;
    const cmd = searchParams.get("cmd");
    if (!cmd) return;
    cmdHandled.current = true;
    const map: Record<string, ParsedIntent> = {
      sources: { kind: "sources" },
      connect: { kind: "sources" },
      simulate: { kind: "simulate" },
      ask: { kind: "ask", question: t("workspace.ask.defaultQuestion") },
      agents: { kind: "agents" },
      memory: { kind: "memory" },
      overview: { kind: "overview" },
      govern: { kind: "govern" },
    };
    const intent = map[cmd];
    if (intent) void runIntent(intent);
  }, [onboarding.isActive, runIntent, searchParams, t]);

  const completeOnboardingSimulate = useCallback(() => {
    if (simulateDoneHandled.current) return;
    if (!onboarding.isActive || !onboarding.awaitingSimulate) return;
    simulateDoneHandled.current = true;
    streamingSim.current = false;
    onboarding.onSimulateDone();
    appendBlocks([
      { type: "system", content: t("chat.simulateDone"), kind: "success" },
      { type: "feed_strip", limit: 12 },
      { type: "onboarding", stepId: "feed" },
    ]);
  }, [appendBlocks, onboarding, t]);

  // Track feed length during simulation (live trace renders inside sim_progress block)
  useEffect(() => {
    if (!streamingSim.current && dash.pendingAction !== "simulate") return;
    feedSeen.current = dash.feed.length;
  }, [dash.feed, dash.pendingAction]);

  // Finish onboarding simulate step when batch completes (SSE or pendingAction clear)
  useEffect(() => {
    if (!onboarding.awaitingSimulate) return;
    const sseDone = dash.feed.some((e) => e.type === "simulation_complete");
    const actionDone = streamingSim.current && dash.pendingAction !== "simulate";
    if (sseDone || actionDone) completeOnboardingSimulate();
  }, [dash.feed, dash.pendingAction, onboarding.awaitingSimulate, completeOnboardingSimulate]);

  // Non-onboarding simulate: success message only
  useEffect(() => {
    if (onboarding.awaitingSimulate) return;
    if (dash.pendingAction !== "simulate" && streamingSim.current) {
      streamingSim.current = false;
      appendBlocks([
        { type: "system", content: t("chat.simulateDone"), kind: "success" },
        { type: "next_steps" },
      ]);
    }
  }, [dash.pendingAction, appendBlocks, onboarding.awaitingSimulate, t]);

  const flashRef = useRef(dash.flash);
  useEffect(() => {
    if (dash.flash && dash.flash !== flashRef.current) {
      appendBlocks([{ type: "system", content: dash.flash.msg, kind: "success" }]);
    }
    flashRef.current = dash.flash;
  }, [dash.flash, appendBlocks]);

  const showWelcome = turns.length === 0 && !busy && !onboarding.isActive;

  const composerHintKey = onboarding.isActive && onboarding.currentStep
    ? onboarding.currentStep.composerHintKey
    : null;

  return {
    turns,
    input,
    setInput,
    submit,
    runChip,
    busy,
    showWelcome,
    dash,
    onboarding,
    handleOnboardingAction,
    handleOnboardingSkip,
    composerHintKey,
    onboardingLocked: onboarding.isActive,
  };
}

export type WeaveChat = ReturnType<typeof useWeaveChat>;
