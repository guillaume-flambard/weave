"use client";

import { ReactNode, useState } from "react";
import { Menu } from "lucide-react";
import { useLocale } from "../../lib/i18n/context";
import { useWeaveProject } from "../../hooks/use-weave-project";
import { useViewport } from "../../hooks/use-viewport";
import { useShellHeaderContext } from "./shell-header-context";
import { WeaveSidebar } from "./weave-sidebar";
import { PageTransition } from "./page-transition";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { width } = useViewport();
  const weave = useWeaveProject();
  const { header } = useShellHeaderContext();
  const desktop = width >= 900;
  const [menuOpen, setMenuOpen] = useState(false);

  const { subtitle, actions } = header;
  const hasTopBar = !desktop || Boolean(subtitle) || Boolean(actions);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        display: "flex",
        background: "var(--bg)",
        fontFamily: "var(--font-sans)",
        color: "var(--ink)",
        WebkitFontSmoothing: "antialiased",
        boxSizing: "border-box",
      }}
    >
      {desktop && <WeaveSidebar connected={weave.connected} llm={weave.llm} variant="static" />}
      {!desktop && menuOpen && (
        <WeaveSidebar connected={weave.connected} llm={weave.llm} variant="drawer" onClose={() => setMenuOpen(false)} />
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {hasTopBar && (
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 24px",
              minHeight: 56,
              boxSizing: "border-box",
              borderBottom: "1px solid var(--line)",
            }}
          >
            {!desktop && (
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label={t("nav.main")}
                className="border border-line bg-surface rounded-md h-[34px] w-[34px] inline-flex items-center justify-center cursor-pointer text-ink-soft shrink-0"
              >
                <Menu size={18} />
              </button>
            )}
            {subtitle && width >= 640 && (
              <span className="text-[12.5px] text-muted overflow-hidden text-ellipsis whitespace-nowrap min-w-0">{subtitle}</span>
            )}
            {actions && (
              <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">{actions}</div>
            )}
          </header>
        )}
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
