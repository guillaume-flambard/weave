"use client";

import { CSSProperties, ReactNode, useState } from "react";

// Weave Design System primitives — ported from the Claude Design project
// (WeaveDesignSystem_08e506.*). Token-driven via CSS vars in globals.css.

type BtnVariant = "primary" | "secondary" | "ghost";
type BtnSize = "sm" | "md";

export function Button({
  variant = "secondary", size = "md", icon, onClick, children, disabled, title, type = "button",
}: {
  variant?: BtnVariant; size?: BtnSize; icon?: ReactNode; onClick?: () => void;
  children?: ReactNode; disabled?: boolean; title?: string; type?: "button" | "submit";
}) {
  const [hover, setHover] = useState(false);
  const sizes: Record<BtnSize, CSSProperties> = {
    sm: { height: 30, padding: "0 11px", fontSize: 12.5 },
    md: { height: 40, padding: "0 16px", fontSize: 13.5 },
  };
  const palette: Record<BtnVariant, CSSProperties> = {
    primary: { background: hover ? "var(--accent-deep)" : "var(--accent)", color: "#fff", border: "1px solid transparent" },
    secondary: { background: hover ? "var(--subtle)" : "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--line)" },
    ghost: { background: hover ? "var(--subtle)" : "transparent", color: "var(--ink-soft)", border: "1px solid transparent" },
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        borderRadius: 6, fontFamily: "var(--font-sans)", fontWeight: 500, cursor: disabled ? "default" : "pointer",
        whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1, transition: "background 120ms ease",
        ...sizes[size], ...palette[variant],
      }}
    >
      {icon}{children}
    </button>
  );
}

type Tone = "personal" | "team" | "project" | "organization" | "pending" | "active";
const TONES: Record<Tone, { fg: string; bg: string }> = {
  personal: { fg: "var(--lvl-personal)", bg: "var(--lvl-personal-bg)" },
  team: { fg: "var(--lvl-team)", bg: "var(--lvl-team-bg)" },
  project: { fg: "var(--lvl-project)", bg: "var(--lvl-project-bg)" },
  organization: { fg: "var(--lvl-org)", bg: "var(--lvl-org-bg)" },
  pending: { fg: "var(--lvl-org)", bg: "var(--lvl-org-bg)" },
  active: { fg: "var(--accent-deep)", bg: "var(--accent-soft)" },
};

export function Badge({ tone = "team", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONES[tone] ?? TONES.team;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", height: 18, padding: "0 7px",
      borderRadius: 999, fontSize: 10.5, fontWeight: 500, lineHeight: 1,
      color: t.fg, background: t.bg,
      border: `1px solid color-mix(in srgb, ${t.fg} 26%, transparent)`,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const px = size === "sm" ? 24 : 30;
  return (
    <span style={{
      width: px, height: px, borderRadius: "50%", background: "var(--ink)", color: "#fff",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size === "sm" ? 10 : 12, fontWeight: 600, flexShrink: 0, letterSpacing: "-0.02em",
    }}>
      {initials}
    </span>
  );
}

export function StatusIndicator({ connected = true, labelConnected = "en direct", labelOffline = "hors ligne" }:
  { connected?: boolean; labelConnected?: string; labelOffline?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: connected ? "var(--accent-deep)" : "var(--muted)" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "var(--accent)" : "var(--muted)" }} />
      {connected ? labelConnected : labelOffline}
    </span>
  );
}
