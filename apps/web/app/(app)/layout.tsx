"use client";

import { ReactNode } from "react";
import { AppShell } from "../../components/layout/app-shell";
import { ShellHeaderProvider } from "../../components/layout/shell-header-context";
import { WeaveProvider } from "../../hooks/weave-context";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ShellHeaderProvider>
      <WeaveProvider>
        <AppShell>{children}</AppShell>
      </WeaveProvider>
    </ShellHeaderProvider>
  );
}
