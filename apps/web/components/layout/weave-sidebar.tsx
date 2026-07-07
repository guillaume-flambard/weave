"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType } from "react";
import { MessageSquare, Settings, X } from "lucide-react";
import { LOCALES } from "../../lib/i18n/types";
import { useLocale } from "../../lib/i18n/context";
import { Avatar, StatusIndicator } from "../ui/primitives";

type NavItem = {
  href: string;
  labelKey: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  match: (path: string) => boolean;
};

const ITEMS: NavItem[] = [
  { href: "/", labelKey: "nav.conversation", icon: MessageSquare, match: (p) => p === "/" },
  { href: "/reglages", labelKey: "nav.settings", icon: Settings, match: (p) => p.startsWith("/reglages") },
];

const navLinkClass = "wv-nav-link";

function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as typeof locale)}
      aria-label={t("locale.label")}
      className="h-8 w-full border border-line rounded-md bg-surface px-2 text-xs text-ink-soft font-sans cursor-pointer"
    >
      {LOCALES.map((item) => (
        <option key={item.code} value={item.code}>{item.label}</option>
      ))}
    </select>
  );
}

export function WeaveSidebar({
  connected,
  llm,
  variant = "static",
  onClose,
}: {
  connected?: boolean;
  llm?: string;
  variant?: "static" | "drawer";
  onClose?: () => void;
}) {
  const pathname = usePathname() || "/";
  const { t } = useLocale();

  const inner = (
    <aside
      className={variant === "drawer" ? "wv-drawer-panel" : undefined}
      style={{
        width: 244,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        height: variant === "drawer" ? "100%" : "100vh",
        borderRight: variant === "drawer" ? "none" : "1px solid var(--line)",
        background: "var(--bg)",
        boxSizing: "border-box",
      }}
    >
      <div className="flex items-center gap-2 p-3 px-3.5 border-b border-line-soft shrink-0">
        <Link href="/" className="flex items-center gap-2 no-underline text-ink font-semibold text-[15px] tracking-tight min-w-0">
          <svg viewBox="0 0 100 100" width="22" height="22" fill="none" className="shrink-0">
            <path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="78" cy="30" r="7" fill="var(--accent)" />
          </svg>
          <span>Weave</span>
        </Link>
        {variant === "drawer" && onClose && (
          <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto border-none bg-transparent cursor-pointer text-muted p-1">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto wv-scroll p-2 flex flex-col gap-0.5" aria-label={t("nav.main")}>
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active}
              className={navLinkClass}
              onClick={variant === "drawer" ? onClose : undefined}
            >
              <span className="wv-nav-icon"><Icon size={16} strokeWidth={2} /></span>
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line-soft shrink-0 flex flex-col gap-2.5">
        <LocaleSwitcher />
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <StatusIndicator
            connected={connected}
            labelConnected={t("status.live")}
            labelOffline={t("status.offline")}
          />
          {llm && <span className="ml-auto truncate max-w-[100px] font-mono text-[10px]">{llm}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Avatar name="vous" size="sm" />
          <span className="text-xs text-ink-soft">Cognitive Runtime</span>
        </div>
      </div>
    </aside>
  );

  if (variant === "drawer") {
    return (
      <div className="wv-drawer-root" role="dialog" aria-modal="true">
        <div className="wv-drawer-overlay" onClick={onClose} />
        {inner}
      </div>
    );
  }
  return inner;
}
