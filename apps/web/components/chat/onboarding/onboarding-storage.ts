import type { OnboardingStepId } from "./onboarding-steps";
import { ONBOARDING_STEPS } from "./onboarding-steps";

/** @deprecated Migrated to ONBOARDING_STATE_KEY */
export const ONBOARDING_LEGACY_DONE_KEY = "weave_onboarding_done";

export const ONBOARDING_STATE_KEY = "weave_onboarding_state";

export type OnboardingPhase = "active" | "done" | "skipped";

export type OnboardingPersistedState = {
  v: 1;
  phase: OnboardingPhase;
  stepIndex: number;
  stepId: OnboardingStepId;
  awaitingSimulate: boolean;
  updatedAt: string;
};

export function readOnboardingState(): OnboardingPersistedState | null {
  if (typeof window === "undefined") return null;

  if (localStorage.getItem(ONBOARDING_LEGACY_DONE_KEY)) {
    return {
      v: 1,
      phase: "done",
      stepIndex: ONBOARDING_STEPS.length,
      stepId: "govern",
      awaitingSimulate: false,
      updatedAt: new Date().toISOString(),
    };
  }

  const raw = localStorage.getItem(ONBOARDING_STATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OnboardingPersistedState;
    if (parsed.v !== 1 || !parsed.phase) return null;
    const stepIndex = Math.min(
      Math.max(0, parsed.stepIndex),
      ONBOARDING_STEPS.length - 1,
    );
    const stepId = ONBOARDING_STEPS[stepIndex]?.id ?? "intro";
    return { ...parsed, stepIndex, stepId };
  } catch {
    return null;
  }
}

export function writeOnboardingState(state: OnboardingPersistedState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify(state));
  localStorage.removeItem(ONBOARDING_LEGACY_DONE_KEY);
}

export function clearOnboardingState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ONBOARDING_STATE_KEY);
  localStorage.removeItem(ONBOARDING_LEGACY_DONE_KEY);
}

export function markOnboardingFinished(phase: "done" | "skipped"): void {
  writeOnboardingState({
    v: 1,
    phase,
    stepIndex: ONBOARDING_STEPS.length,
    stepId: "govern",
    awaitingSimulate: false,
    updatedAt: new Date().toISOString(),
  });
}
