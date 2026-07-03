"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { askMemory } from "../../lib/api";
import { useLocale } from "../../lib/i18n/context";
import { useWeaveDashboard } from "../../hooks/use-weave-dashboard";
import { intentLabel, parseChatInput } from "./chat-orchestrator";
import { useChatOnboarding } from "./onboarding/use-chat-onboarding";
import type { ChatBlock, ChatTurn, ParsedIntent } from "./types";

function newTurnId(): string {
  return crypto.randomUUID();
}

export function useWeaveChat(onSkillEmerged: () => void = () => {}) {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const onboarding = useChatOnboarding();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const cmdHandled = useRef(false);
  const feedSeen = useRef(0);
  const streamingSim = useRef(false);
  const onboardingSeeded = useRef(false);

  const dash = useWeaveDashboard(onSkillEmerged);

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
    await runIntent(intent, text);
  }, [busy, input, onboarding.isActive, runIntent, setInput, appendBlocks, t]);

  const runChip = useCallback((cmd: string) => {
    if (onboarding.isActive) {
      appendBlocks([{ type: "system", content: t("onboarding.composerLocked"), kind: "info" }]);
      return;
    }
    void submit(cmd);
  }, [appendBlocks, onboarding.isActive, submit, t]);

  // Seed onboarding intro
  useEffect(() => {
    if (onboarding.status === "loading") return;
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
    setTurns([{ id: newTurnId(), blocks: [{ type: "onboarding", stepId: "intro" }] }]);
  }, [onboarding.isActive, onboarding.status, searchParams]);

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

  // Track feed length during simulation (live trace renders inside sim_progress block)
  useEffect(() => {
    if (!streamingSim.current && dash.pendingAction !== "simulate") return;
    feedSeen.current = dash.feed.length;
  }, [dash.feed, dash.pendingAction]);

  useEffect(() => {
    if (dash.pendingAction !== "simulate" && streamingSim.current) {
      streamingSim.current = false;
      const blocks: ChatBlock[] = [
        { type: "system", content: t("chat.simulateDone"), kind: "success" },
      ];
      if (onboarding.isActive && onboarding.awaitingSimulate) {
        onboarding.onSimulateDone();
        blocks.push({ type: "feed_strip", limit: 12 });
        blocks.push({ type: "onboarding", stepId: "feed" });
      }
      appendBlocks(blocks);
    }
  }, [dash.pendingAction, appendBlocks, onboarding, t]);

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
