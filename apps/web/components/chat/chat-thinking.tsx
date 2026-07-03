"use client";

import { useT } from "../../lib/i18n/context";

export function ChatThinking() {
  const t = useT();
  return (
    <div className="wv-chat-thinking" role="status" aria-live="polite" aria-label={t("chat.thinking")}>
      <span className="wv-chat-thinking-dot" style={{ animationDelay: "0ms" }} />
      <span className="wv-chat-thinking-dot" style={{ animationDelay: "160ms" }} />
      <span className="wv-chat-thinking-dot" style={{ animationDelay: "320ms" }} />
    </div>
  );
}
