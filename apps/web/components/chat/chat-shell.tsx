"use client";

import { Suspense, useMemo } from "react";
import { RotateCcw, WifiOff } from "lucide-react";
import { useShellHeader } from "../layout/use-shell-header";
import { useT } from "../../lib/i18n/context";
import { ChatComposer } from "./chat-composer";
import { ChatThread } from "./chat-thread";
import { OnboardingProvider } from "./onboarding/onboarding-context";
import { useWeaveChat } from "./use-weave-chat";
import type { OrgCfg } from "../../lib/types";

function ChatShellInner() {
  const t = useT();
  const chat = useWeaveChat();
  const { dash } = chat;

  const orgSwitcher = useMemo(() => (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {dash.llm && (
        <span
          className="hidden sm:inline text-[10px] font-mono uppercase tracking-wide text-muted px-2 py-1 rounded-md bg-subtle border border-line-soft"
          title={t("status.llmProvider")}
        >
          {dash.llm}
        </span>
      )}
      {dash.presets.length > 0 ? (
        <select
          value={dash.orgId}
          onChange={(e) => dash.switchOrg(e.target.value)}
          disabled={dash.pendingAction === "switchOrg"}
          aria-label={t("nav.org")}
          className="h-9 border border-line rounded-md bg-surface px-2.5 text-sm text-ink font-sans cursor-pointer"
        >
          {dash.presets.map((p: OrgCfg) => (
            <option key={p.org} value={p.org}>{p.name}</option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        onClick={() => dash.reset()}
        disabled={dash.pendingAction === "reset"}
        title={t("common.reset")}
        aria-label={t("common.reset")}
        className="h-9 inline-flex items-center gap-1.5 border border-line rounded-md bg-surface px-2.5 text-sm text-ink-soft hover:text-ink hover:bg-subtle cursor-pointer font-sans disabled:opacity-50"
      >
        <RotateCcw size={14} />
        <span className="hidden sm:inline">{t("common.reset")}</span>
      </button>
    </div>
  ), [dash.orgId, dash.llm, dash.pendingAction, dash.presets, dash.switchOrg, dash.reset, t]);

  useShellHeader({ actions: orgSwitcher });

  return (
    <div className="wv-chat-canvas flex flex-col flex-1 min-h-0">
      {!dash.connected && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line bg-subtle text-sm text-ink-soft">
          <WifiOff size={15} className="shrink-0 text-muted" />
          {t("errors.apiOfflineBanner")}
        </div>
      )}
      <ChatThread chat={chat} />
      <ChatComposer chat={chat} />
    </div>
  );
}

export function ChatShell() {
  return (
    <Suspense fallback={<div className="flex-1 min-h-[50vh]" />}>
      <OnboardingProvider>
        <ChatShellInner />
      </OnboardingProvider>
    </Suspense>
  );
}
