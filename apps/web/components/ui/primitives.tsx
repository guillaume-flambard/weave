"use client";

import { CSSProperties, ReactNode, useState } from "react";

// Weave Design System primitives — ported from the Claude Design project
// (WeaveDesignSystem_08e506.*). Token-driven via CSS vars in globals.css.

type BtnVariant = "primary" | "secondary" | "ghost" | "dark";
type BtnSize = "sm" | "md" | "lg";

export function Button({
  variant = "secondary", size = "md", icon, onClick, children, disabled, title, type = "button", style,
}: {
  variant?: BtnVariant; size?: BtnSize; icon?: ReactNode; onClick?: () => void;
  children?: ReactNode; disabled?: boolean; title?: string; type?: "button" | "submit"; style?: CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const h = !disabled && hover;
  const sizes: Record<BtnSize, CSSProperties> = {
    sm: { height: 30, padding: "0 11px", fontSize: 12.5 },
    md: { height: 40, padding: "0 16px", fontSize: 13.5 },
    lg: { height: 44, padding: "0 18px", fontSize: 14 },
  };
  const palette: Record<BtnVariant, CSSProperties> = {
    primary: { background: h ? "var(--accent-deep)" : "var(--accent)", color: "#fff", border: "1px solid transparent" },
    secondary: { background: h ? "var(--subtle)" : "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--line)" },
    ghost: { background: h ? "var(--subtle)" : "transparent", color: "var(--ink-soft)", border: "1px solid transparent" },
    dark: { background: h ? "var(--ink-soft)" : "var(--ink)", color: "#fff", border: "1px solid transparent" },
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        borderRadius: 6, fontFamily: "var(--font-sans)", fontWeight: 500, cursor: disabled ? "default" : "pointer",
        whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1, transition: "background 120ms ease",
        ...sizes[size], ...palette[variant], ...style,
      }}
    >
      {icon}{children}
    </button>
  );
}

type Tone = "personal" | "team" | "project" | "organization" | "pending" | "active" | "neutral" | "white";
const TONES: Record<Tone, { fg: string; bg: string; border: string }> = {
  personal: { fg: "var(--lvl-personal)", bg: "var(--lvl-personal-bg)", border: "color-mix(in srgb, var(--lvl-personal) 26%, transparent)" },
  team: { fg: "var(--lvl-team)", bg: "var(--lvl-team-bg)", border: "color-mix(in srgb, var(--lvl-team) 26%, transparent)" },
  project: { fg: "var(--lvl-project)", bg: "var(--lvl-project-bg)", border: "color-mix(in srgb, var(--lvl-project) 26%, transparent)" },
  organization: { fg: "var(--lvl-org)", bg: "var(--lvl-org-bg)", border: "color-mix(in srgb, var(--lvl-org) 30%, transparent)" },
  pending: { fg: "var(--lvl-org)", bg: "var(--lvl-org-bg)", border: "color-mix(in srgb, var(--lvl-org) 30%, transparent)" },
  active: { fg: "var(--accent-deep)", bg: "var(--accent-soft)", border: "color-mix(in srgb, var(--accent) 26%, transparent)" },
  neutral: { fg: "var(--ink-soft)", bg: "var(--subtle)", border: "var(--line)" },
  white: { fg: "var(--ink-soft)", bg: "var(--surface)", border: "var(--line)" },
};

export function Badge({ tone = "team", shape = "capsule", uppercase = false, children }:
  { tone?: Tone; shape?: "capsule" | "tag"; uppercase?: boolean; children: ReactNode }) {
  const t = TONES[tone] ?? TONES.team;
  const tag = shape === "tag";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", height: tag ? 16 : 18, padding: tag ? "0 5px" : "0 7px",
      borderRadius: tag ? 4 : 999, fontSize: tag ? 10 : 10.5, fontWeight: 500, lineHeight: 1,
      letterSpacing: uppercase ? "0.04em" : undefined, textTransform: uppercase ? "uppercase" : undefined,
      color: t.fg, background: t.bg, border: `1px solid ${t.border}`, whiteSpace: "nowrap",
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
