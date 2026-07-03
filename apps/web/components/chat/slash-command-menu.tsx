"use client";

import type { LucideIcon } from "lucide-react";
import {
  Bot, Brain, HelpCircle, LayoutGrid, MessageSquare, Plug, Shield, Target, Zap,
} from "lucide-react";
import { useT } from "../../lib/i18n/context";
import type { SlashCommandDef } from "./chat-orchestrator";

const ICONS: Record<string, LucideIcon> = {
  sources: Plug,
  simulate: Zap,
  ask: MessageSquare,
  agents: Bot,
  memory: Brain,
  overview: LayoutGrid,
  govern: Shield,
  scope: Target,
  help: HelpCircle,
};

export function SlashCommandMenu({
  commands,
  activeIndex,
  onPick,
  onHover,
}: {
  commands: SlashCommandDef[];
  activeIndex: number;
  onPick: (cmd: SlashCommandDef) => void;
  onHover: (index: number) => void;
}) {
  const t = useT();
  if (commands.length === 0) return null;

  return (
    <div
      id="slash-command-menu"
      role="listbox"
      aria-label={t("chat.slashMenuLabel")}
      data-testid="slash-command-menu"
      className="wv-slash-menu absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_8px_32px_rgba(15,15,15,0.12)]"
    >
      <div className="px-3 py-2 border-b border-line-soft">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{t("chat.slashMenuTitle")}</span>
      </div>
      <ul className="m-0 p-1.5 list-none max-h-[280px] overflow-y-auto wv-scroll">
        {commands.map((cmd, i) => {
          const Icon = ICONS[cmd.id] ?? HelpCircle;
          const active = i === activeIndex;
          return (
            <li key={cmd.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={active}
                data-slash-index={i}
                onMouseEnter={() => onHover(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(cmd);
                }}
                className={`wv-slash-menu-item w-full flex items-start gap-3 rounded-lg px-2.5 py-2 text-left border-none cursor-pointer font-sans transition-colors ${
                  active ? "bg-accent-soft" : "bg-transparent hover:bg-subtle"
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-lg shrink-0 inline-flex items-center justify-center ${
                    active ? "bg-accent text-white" : "bg-subtle text-ink-soft"
                  }`}
                >
                  <Icon size={15} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="flex items-center gap-2">
                    <span className={`font-mono text-[13px] font-medium ${active ? "text-accent-deep" : "text-ink"}`}>
                      /{cmd.prefix}
                    </span>
                    <span className="text-[12px] text-ink-soft">{t(cmd.labelKey)}</span>
                  </span>
                  <span className="block mt-0.5 text-[12px] text-muted leading-snug">{t(cmd.descKey)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
