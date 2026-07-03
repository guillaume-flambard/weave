"use client";

import { ReactNode } from "react";
import { AppShell } from "../../components/layout/app-shell";
import { ShellHeaderProvider } from "../../components/layout/shell-header-context";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ShellHeaderProvider>
      <AppShell>{children}</AppShell>
    </ShellHeaderProvider>
  );
}
