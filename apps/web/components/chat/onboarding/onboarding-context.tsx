"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useChatOnboardingState } from "./use-chat-onboarding";
import type { ChatOnboarding } from "./use-chat-onboarding";

const OnboardingContext = createContext<ChatOnboarding | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const value = useChatOnboardingState();
  return (
    <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
  );
}

export function useOnboarding(): ChatOnboarding {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}
