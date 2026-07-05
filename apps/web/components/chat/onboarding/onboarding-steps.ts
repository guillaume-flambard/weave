import type { ParsedIntent } from "../types";

export const ONBOARDING_STORAGE_KEY = "weave_onboarding_done";

export { ONBOARDING_STATE_KEY, ONBOARDING_LEGACY_DONE_KEY } from "./onboarding-storage";

export type OnboardingStepId = "intro" | "sources" | "simulate" | "feed" | "ask" | "govern";

export type OnboardingStepDef = {
  id: OnboardingStepId;
  titleKey: string;
  bodyKey: string;
  ctaKey: string;
  composerHintKey: string;
  /** User message shown when the CTA is clicked */
  userLabelKey: string;
  /** If set, run this intent when the step CTA is clicked */
  intent?: ParsedIntent;
  /** After intent, wait for simulation to finish before showing the next step */
  waitForSimulate?: boolean;
};

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    id: "intro",
    titleKey: "onboarding.intro.title",
    bodyKey: "onboarding.intro.body",
    ctaKey: "onboarding.start",
    composerHintKey: "onboarding.composerHint.intro",
    userLabelKey: "onboarding.start",
  },
  {
    id: "sources",
    titleKey: "onboarding.sources.title",
    bodyKey: "onboarding.sources.body",
    ctaKey: "onboarding.connectSources",
    composerHintKey: "onboarding.composerHint.sources",
    userLabelKey: "onboarding.connectSources",
    intent: { kind: "sources" },
  },
  {
    id: "simulate",
    titleKey: "onboarding.simulate.title",
    bodyKey: "onboarding.simulate.body",
    ctaKey: "onboarding.runSimulate",
    composerHintKey: "onboarding.composerHint.simulate",
    userLabelKey: "onboarding.runSimulate",
    intent: { kind: "simulate" },
    waitForSimulate: true,
  },
  {
    id: "feed",
    titleKey: "onboarding.feed.title",
    bodyKey: "onboarding.feed.body",
    ctaKey: "onboarding.continue",
    composerHintKey: "onboarding.composerHint.feed",
    userLabelKey: "onboarding.continue",
  },
  {
    id: "ask",
    titleKey: "onboarding.ask.title",
    bodyKey: "onboarding.ask.body",
    ctaKey: "onboarding.askDemo",
    composerHintKey: "onboarding.composerHint.ask",
    userLabelKey: "onboarding.askDemo",
    intent: { kind: "ask", question: "" }, // filled at runtime with default question
  },
  {
    id: "govern",
    titleKey: "onboarding.govern.title",
    bodyKey: "onboarding.govern.body",
    ctaKey: "onboarding.finish",
    composerHintKey: "onboarding.composerHint.govern",
    userLabelKey: "onboarding.finish",
  },
];

export function stepIndexFor(id: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((s) => s.id === id);
}
