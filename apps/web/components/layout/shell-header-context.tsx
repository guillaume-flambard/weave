"use client";

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";

export type ShellHeaderState = {
  subtitle?: string;
  actions?: ReactNode;
};

type ShellHeaderContextValue = {
  header: ShellHeaderState;
  setHeader: (state: ShellHeaderState) => void;
};

const ShellHeaderContext = createContext<ShellHeaderContextValue | null>(null);

export function ShellHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] = useState<ShellHeaderState>({});
  const setHeader = useCallback((state: ShellHeaderState) => setHeaderState(state), []);
  const value = useMemo(() => ({ header, setHeader }), [header, setHeader]);
  return <ShellHeaderContext.Provider value={value}>{children}</ShellHeaderContext.Provider>;
}

export function useShellHeaderContext() {
  const ctx = useContext(ShellHeaderContext);
  if (!ctx) throw new Error("useShellHeaderContext must be used within ShellHeaderProvider");
  return ctx;
}
