"use client";

import { useEffect, useRef } from "react";
import { useT } from "../../lib/i18n/context";
import { ChatBlockView } from "./chat-blocks";
import { ChatThinking } from "./chat-thinking";
import type { WeaveChat } from "./use-weave-chat";

export function ChatThread({ chat }: { chat: WeaveChat }) {
  const t = useT();
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const { turns, showWelcome, busy, dash } = chat;

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [turns.length, turns[turns.length - 1]?.blocks.length, busy]);

  return (
    <div
      ref={threadRef}
      className="flex-1 overflow-y-auto wv-scroll wv-chat-scroll px-4 py-6"
      data-testid="chat-thread"
    >
      <div className="mx-auto max-w-[760px] flex flex-col gap-6">
        {showWelcome && (
          <div className="pt-8 pb-4 wv-chat-welcome-in">
            <h1 className="m-0 text-[26px] font-semibold tracking-tight text-ink">{t("chat.welcomeTitle")}</h1>
            <p className="mt-2 text-[15px] text-ink-soft leading-[1.55] max-w-[560px]">{t("chat.welcomeBody")}</p>
          </div>
        )}

        {turns.map((turn, turnIndex) => (
          <div
            key={turn.id}
            className="wv-chat-turn flex flex-col gap-3"
            style={{ "--wv-chat-delay": `${Math.min(turnIndex * 40, 120)}ms` } as React.CSSProperties}
          >
            {turn.userText && (
              <div className="wv-chat-user-in text-[15px] font-medium text-ink border-b border-line-soft pb-2">
                {turn.userText}
              </div>
            )}
            <div className="flex flex-col gap-2.5 pl-0">
              {turn.blocks.map((block, i) => (
                <div
                  key={`${turn.id}-${i}`}
                  className="wv-chat-block-in"
                  style={{ "--wv-chat-delay": `${i * 55}ms` } as React.CSSProperties}
                >
                  <ChatBlockView block={block} chat={chat} />
                </div>
              ))}
            </div>
          </div>
        ))}

        {busy && (
          <div className="wv-chat-block-in pl-1" style={{ "--wv-chat-delay": "0ms" } as React.CSSProperties}>
            <ChatThinking />
          </div>
        )}

        {dash.errorMessage && (
          <div className="wv-chat-block-in wv-chat-block text-sm text-[#b91c1c] bg-[#fef2f2] border-[#fecaca]">
            {dash.errorMessage}
          </div>
        )}

        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>
    </div>
  );
}
