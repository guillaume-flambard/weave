"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  clearOnboardingState,
  markOnboardingFinished,
  readOnboardingState,
  writeOnboardingState,
} from "./onboarding-storage";
import {
  ONBOARDING_STEPS,
  type OnboardingStepDef,
  type OnboardingStepId,
} from "./onboarding-steps";

export type OnboardingStatus = "loading" | "active" | "done" | "skipped";

/** Derived UI phase for composer hints and progress */
export type OnboardingUiPhase =
  | "loading"
  | "intro"
  | "sources"
  | "simulate"
  | "simulating"
  | "feed"
  | "ask"
  | "govern"
  | "done"
  | "skipped";

export function useChatOnboardingState() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<OnboardingStatus>("loading");
  const [stepIndex, setStepIndex] = useState(0);
  const [awaitingSimulate, setAwaitingSimulate] = useState(false);
  const [pendingNextAfterSimulate, setPendingNextAfterSimulate] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const param = searchParams.get("onboarding");

    if (param === "restart") {
      clearOnboardingState();
      setStepIndex(0);
      setStatus("active");
      setAwaitingSimulate(false);
      setPendingNextAfterSimulate(false);
      setHydrated(true);
      return;
    }

    if (param === "off") {
      setStatus("done");
      setHydrated(true);
      return;
    }

    const saved = readOnboardingState();
    if (saved?.phase === "done") {
      setStatus("done");
      setHydrated(true);
      return;
    }
    if (saved?.phase === "skipped") {
      setStatus("skipped");
      setHydrated(true);
      return;
    }

    if (searchParams.get("cmd")) {
      setStatus("done");
      setHydrated(true);
      return;
    }

    if (saved?.phase === "active") {
      setStepIndex(saved.stepIndex);
      // If user refreshed mid-simulate, don't stay stuck in waiting without a live run
      setAwaitingSimulate(false);
      setPendingNextAfterSimulate(false);
      setStatus("active");
      setHydrated(true);
      return;
    }

    setStepIndex(0);
    setStatus("active");
    setHydrated(true);
  }, [searchParams]);

  const isActive = status === "active";
  const currentStep: OnboardingStepDef | null = isActive
    ? ONBOARDING_STEPS[stepIndex] ?? null
    : null;
  const currentStepId: OnboardingStepId | null = currentStep?.id ?? null;

  const uiPhase: OnboardingUiPhase = useMemo(() => {
    if (status === "loading") return "loading";
    if (status === "done") return "done";
    if (status === "skipped") return "skipped";
    if (awaitingSimulate && currentStepId === "simulate") return "simulating";
    return currentStepId ?? "intro";
  }, [status, awaitingSimulate, currentStepId]);

  const persistActive = useCallback(
    (index: number, waiting: boolean) => {
      if (status !== "active") return;
      const step = ONBOARDING_STEPS[index];
      if (!step) return;
      writeOnboardingState({
        v: 1,
        phase: "active",
        stepIndex: index,
        stepId: step.id,
        awaitingSimulate: waiting,
        updatedAt: new Date().toISOString(),
      });
    },
    [status],
  );

  useEffect(() => {
    if (!hydrated || status !== "active") return;
    persistActive(stepIndex, awaitingSimulate);
  }, [hydrated, status, stepIndex, awaitingSimulate, persistActive]);

  const skip = useCallback(() => {
    markOnboardingFinished("skipped");
    setStatus("skipped");
    setAwaitingSimulate(false);
    setPendingNextAfterSimulate(false);
  }, []);

  const complete = useCallback(() => {
    markOnboardingFinished("done");
    setStatus("done");
    setAwaitingSimulate(false);
    setPendingNextAfterSimulate(false);
  }, []);

  const advanceTo = useCallback(
    (index: number) => {
      if (index >= ONBOARDING_STEPS.length) {
        complete();
        return null;
      }
      setStepIndex(index);
      return ONBOARDING_STEPS[index]!;
    },
    [complete],
  );

  const advance = useCallback(() => advanceTo(stepIndex + 1), [advanceTo, stepIndex]);

  const onSimulateDone = useCallback(() => {
    if (!pendingNextAfterSimulate) return;
    setAwaitingSimulate(false);
    setPendingNextAfterSimulate(false);
    advance();
  }, [advance, pendingNextAfterSimulate]);

  const markAwaitingSimulate = useCallback(() => {
    setAwaitingSimulate(true);
    setPendingNextAfterSimulate(true);
  }, []);

  const goToStep = useCallback((id: OnboardingStepId) => {
    const idx = ONBOARDING_STEPS.findIndex((s) => s.id === id);
    if (idx >= 0) setStepIndex(idx);
  }, []);

  return {
    status,
    isActive,
    uiPhase,
    currentStep,
    currentStepId,
    stepIndex,
    stepCount: ONBOARDING_STEPS.length,
    awaitingSimulate,
    hydrated,
    skip,
    complete,
    advance,
    advanceTo,
    goToStep,
    onSimulateDone,
    markAwaitingSimulate,
  };
}

/** @deprecated use useOnboarding() from onboarding-context */
export function useChatOnboarding() {
  return useChatOnboardingState();
}

export type ChatOnboarding = ReturnType<typeof useChatOnboardingState>;
