"use client";

import { Suspense, useMemo } from "react";
import { WifiOff } from "lucide-react";
import { useShellHeader } from "../layout/use-shell-header";
import { useT } from "../../lib/i18n/context";
import { ChatComposer } from "./chat-composer";
import { ChatThread } from "./chat-thread";
import { useWeaveChat } from "./use-weave-chat";
import type { OrgCfg } from "../../lib/types";

function ChatShellInner() {
  const t = useT();
  const chat = useWeaveChat();
  const { dash } = chat;

  const orgSwitcher = useMemo(() => (
    dash.presets.length > 0 ? (
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
    ) : null
  ), [dash.orgId, dash.pendingAction, dash.presets, dash.switchOrg, t]);

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
      <ChatShellInner />
    </Suspense>
  );
}
