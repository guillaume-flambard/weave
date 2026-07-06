"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Zap, Plug, MessageSquare } from "lucide-react";
import { useT } from "../../lib/i18n/context";
import { filterSlashCommands, isSlashMenuOpen, type SlashCommandDef } from "./chat-orchestrator";
import { SlashCommandMenu } from "./slash-command-menu";
import type { WeaveChat } from "./use-weave-chat";

// No hardcoded topics: connect + run the demo are actions; "ask" just primes the
// composer so the user (or the emerged-skill suggestions) drives the question.
const CHIPS = [
  { cmd: "/sources", labelKey: "chat.chipConnect" as const, icon: Plug },
  { cmd: "/simulate", labelKey: "chat.chipSimulate" as const, icon: Zap, tour: "simulate" },
  { prefill: "/ask ", labelKey: "chat.chipAsk" as const, icon: MessageSquare },
] as const;

export function ChatComposer({ chat }: { chat: WeaveChat }) {
  const t = useT();
  const { input, setInput, submit, runChip, busy, showWelcome, onboardingLocked, composerHintKey } = chat;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const slashOpen = isSlashMenuOpen(input);
  const slashCommands = useMemo(() => filterSlashCommands(input), [input]);

  useEffect(() => {
    setActiveIndex(0);
  }, [input]);

  useEffect(() => {
    if (!slashOpen || slashCommands.length === 0) return;
    const el = document.querySelector(`[data-slash-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, slashOpen, slashCommands.length]);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [input, resize]);

  const pickCommand = useCallback((cmd: SlashCommandDef) => {
    setInput(cmd.template);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(cmd.template.length, cmd.template.length);
      resize();
    });
  }, [resize, setInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && slashCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % slashCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + slashCommands.length) % slashCommands.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        pickCommand(slashCommands[activeIndex]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const placeholder = composerHintKey ? t(composerHintKey) : t("chat.placeholder");
  const inputLocked = onboardingLocked || busy;

  return (
    <div className="wv-chat-composer shrink-0 border-t border-line/80 px-4 py-3">
      <div className="mx-auto max-w-[760px] wv-chat-composer-shell">
        {showWelcome && (
          <div className="flex flex-wrap gap-2 mb-3">
            {CHIPS.map((chip, i) => {
              const { labelKey, icon: Icon } = chip;
              const prefill = "prefill" in chip ? chip.prefill : undefined;
              const cmd = "cmd" in chip ? chip.cmd : undefined;
              const onClick = () => {
                if (prefill) {
                  setInput(prefill);
                  requestAnimationFrame(() => {
                    const el = textareaRef.current;
                    el?.focus();
                    el?.setSelectionRange(prefill.length, prefill.length);
                  });
                } else if (cmd) {
                  runChip(cmd);
                }
              };
              return (
                <button
                  key={labelKey}
                  type="button"
                  data-tour={"tour" in chip ? chip.tour : undefined}
                  disabled={busy}
                  onClick={onClick}
                  className="wv-chat-chip-in inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:bg-subtle hover:text-ink cursor-pointer font-sans disabled:opacity-50"
                  style={{ "--wv-chip-delay": `${i * 70}ms` } as React.CSSProperties}
                >
                  <Icon size={14} />
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        )}

        <div className="relative">
          {slashOpen && slashCommands.length > 0 && (
            <SlashCommandMenu
              commands={slashCommands}
              activeIndex={activeIndex}
              onPick={pickCommand}
              onHover={setActiveIndex}
            />
          )}

          <form
            data-testid="chat-composer"
            className={`wv-chat-composer-field flex items-end gap-2 rounded-2xl border bg-surface p-2 shadow-[0_2px_16px_rgba(15,15,15,0.05)] ${focused ? "border-accent/40" : "border-line"}`}
            onSubmit={(e) => {
              e.preventDefault();
              if (isSlashMenuOpen(input)) return;
              void submit();
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={placeholder}
              readOnly={onboardingLocked}
              disabled={busy}
              aria-expanded={slashOpen && slashCommands.length > 0}
              aria-autocomplete="list"
              aria-controls={slashOpen ? "slash-command-menu" : undefined}
              className="flex-1 resize-none border-none bg-transparent px-2 py-2 text-[15px] leading-[1.5] text-ink outline-none font-sans min-h-[44px] max-h-[160px] placeholder:text-muted transition-opacity duration-200"
            />
            <button
              type="submit"
              disabled={inputLocked || !input.trim() || input === "/"}
              aria-label={t("common.send")}
              className="wv-chat-send-btn shrink-0 w-9 h-9 mb-0.5 rounded-xl bg-ink text-white inline-flex items-center justify-center border-none cursor-pointer disabled:cursor-not-allowed"
            >
              <ArrowUp size={18} strokeWidth={2.25} />
            </button>
          </form>
        </div>
        <p className="wv-chat-hint m-0 mt-2.5 text-[11px] text-muted text-center">
          {onboardingLocked ? placeholder : t("chat.slashHint")}
        </p>
      </div>
    </div>
  );
}
