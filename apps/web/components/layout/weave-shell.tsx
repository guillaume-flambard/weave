"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { Avatar, Badge, StatusIndicator } from "../ui/primitives";

const NAV: { href: string; label: string; match?: (path: string) => boolean }[] = [
  { href: "/", label: "Espace de travail", match: (p) => p === "/" || p === "/espace-de-travail" },
  { href: "/vue-d-ensemble", label: "Vue d'ensemble" },
  { href: "/interroger-la-memoire", label: "Interroger" },
  { href: "/gouvernance", label: "Gouvernance" },
  { href: "/connecter-les-sources", label: "Sources" },
];

function isActive(pathname: string, item: (typeof NAV)[number]): boolean {
  if (item.match) return item.match(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function WeaveShell({
  width,
  children,
  connected,
  llm,
  subtitle,
  actions,
}: {
  width: number;
  children: ReactNode;
  connected?: boolean;
  llm?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const pathname = usePathname() || "/";
  const showNav = width >= 900;
  const showStatus = width >= 560;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-sans)", color: "var(--ink)", WebkitFontSmoothing: "antialiased", boxSizing: "border-box" }}>
      <div style={{ borderBottom: "1px solid var(--line)" }}>
        <header style={{ maxWidth: 1360, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0, textDecoration: "none", color: "inherit" }}>
            <span style={{ width: 32, height: 32, borderRadius: 7, background: "var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 100 100" width="18" height="18" fill="none" aria-hidden>
                <path d="M22 30 L38 74 L50 46 L62 74 L78 30" stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="78" cy="30" r="7" fill="var(--accent)" />
              </svg>
            </span>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>Weave</span>
            <Badge tone="neutral">Cognitive Runtime</Badge>
          </Link>
          {showNav && (
            <nav aria-label="Navigation principale" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginLeft: 8 }}>
              {NAV.map((n) => {
                const active = isActive(pathname, n);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    style={{
                      fontSize: 12.5,
                      fontWeight: active ? 600 : 500,
                      color: active ? "var(--accent-deep)" : "var(--ink-soft)",
                      background: active ? "var(--accent-soft)" : "transparent",
                      textDecoration: "none",
                      padding: "5px 10px",
                      borderRadius: 6,
                    }}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {subtitle && width >= 720 && (
              <span style={{ fontSize: 11, color: "var(--muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</span>
            )}
            {actions}
            {showStatus && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--surface)", boxSizing: "border-box" }}>
                <StatusIndicator connected={connected} labelConnected="en direct" labelOffline="hors ligne" />
                {llm && (
                  <>
                    <span style={{ width: 1, height: 14, background: "var(--line)" }} />
                    <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>{llm}</span>
                  </>
                )}
              </div>
            )}
            <Avatar name="Sophie Bernard" size="md" />
          </div>
        </header>
        {!showNav && (
          <nav
            aria-label="Navigation principale"
            className="wv-scroll"
            style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 16px 10px", maxWidth: 1360, margin: "0 auto" }}
          >
            {NAV.map((n) => {
              const active = isActive(pathname, n);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  style={{
                    flexShrink: 0,
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--accent-deep)" : "var(--ink-soft)",
                    background: active ? "var(--accent-soft)" : "var(--surface)",
                    border: `1px solid ${active ? "color-mix(in srgb, var(--accent) 30%, var(--line))" : "var(--line)"}`,
                    textDecoration: "none",
                    padding: "6px 12px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
      {children}
    </div>
  );
}
