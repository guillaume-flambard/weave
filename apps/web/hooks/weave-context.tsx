"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { useWeaveDashboard } from "./use-weave-dashboard";

type WeaveDashboard = ReturnType<typeof useWeaveDashboard>;

type WeaveContextValue = {
  dash: WeaveDashboard;
  /** Chat registers a callback when a skill emerges (toast / onboarding). */
  setSkillNotify: (fn: () => void) => void;
};

const WeaveContext = createContext<WeaveContextValue | null>(null);

export function WeaveProvider({ children }: { children: ReactNode }) {
  const skillNotifyRef = useRef<() => void>(() => {});
  const dash = useWeaveDashboard(() => skillNotifyRef.current());
  const value: WeaveContextValue = {
    dash,
    setSkillNotify: (fn) => {
      skillNotifyRef.current = fn;
    },
  };
  return <WeaveContext.Provider value={value}>{children}</WeaveContext.Provider>;
}

export function useWeaveContext(): WeaveContextValue {
  const ctx = useContext(WeaveContext);
  if (!ctx) {
    throw new Error("useWeaveContext must be used within WeaveProvider");
  }
  return ctx;
}

/** Shared dashboard state (SSE, org, skills, simulate, …). */
export function useWeaveDash(): WeaveDashboard {
  return useWeaveContext().dash;
}
