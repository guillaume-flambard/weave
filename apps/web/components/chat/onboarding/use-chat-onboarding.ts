"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  type OnboardingStepDef,
  type OnboardingStepId,
} from "./onboarding-steps";

export type OnboardingStatus = "loading" | "active" | "done" | "skipped";

export function useChatOnboarding() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<OnboardingStatus>("loading");
  const [stepIndex, setStepIndex] = useState(0);
  const [awaitingSimulate, setAwaitingSimulate] = useState(false);
  const [pendingNextAfterSimulate, setPendingNextAfterSimulate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = searchParams.get("onboarding");
    if (param === "restart") {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      setStepIndex(0);
      setStatus("active");
      setAwaitingSimulate(false);
      setPendingNextAfterSimulate(false);
      return;
    }
    if (param === "off" || localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
      setStatus("done");
      return;
    }
    if (searchParams.get("cmd")) {
      setStatus("done");
      return;
    }
    setStatus("active");
  }, [searchParams]);

  const isActive = status === "active";
  const currentStep: OnboardingStepDef | null = isActive ? ONBOARDING_STEPS[stepIndex] ?? null : null;

  const skip = useCallback(() => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    setStatus("skipped");
    setAwaitingSimulate(false);
    setPendingNextAfterSimulate(false);
  }, []);

  const complete = useCallback(() => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    setStatus("done");
    setAwaitingSimulate(false);
    setPendingNextAfterSimulate(false);
  }, []);

  const advanceTo = useCallback((index: number) => {
    if (index >= ONBOARDING_STEPS.length) {
      complete();
      return null;
    }
    setStepIndex(index);
    return ONBOARDING_STEPS[index]!;
  }, [complete]);

  const advance = useCallback(() => {
    return advanceTo(stepIndex + 1);
  }, [advanceTo, stepIndex]);

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
    currentStep,
    stepIndex,
    stepCount: ONBOARDING_STEPS.length,
    awaitingSimulate,
    skip,
    complete,
    advance,
    advanceTo,
    goToStep,
    onSimulateDone,
    markAwaitingSimulate,
  };
}

export type ChatOnboarding = ReturnType<typeof useChatOnboarding>;
