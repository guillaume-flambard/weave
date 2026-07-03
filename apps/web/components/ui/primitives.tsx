"use client";

import { ReactNode } from "react";

type BtnVariant = "primary" | "secondary" | "ghost" | "dark";
type BtnSize = "sm" | "md" | "lg";

export function Button({
  variant = "secondary", size = "md", icon, onClick, children, disabled, title, type = "button", className,
  ...rest
}: {
  variant?: BtnVariant; size?: BtnSize; icon?: ReactNode; onClick?: () => void;
  children?: ReactNode; disabled?: boolean; title?: string; type?: "button" | "submit"; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes: Record<BtnSize, string> = {
    sm: "h-7.5 px-[11px] text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-[18px] text-sm",
  };
  const variants: Record<BtnVariant, string> = {
    primary: "bg-accent hover:bg-accent-deep text-white border border-transparent",
    secondary: "bg-surface hover:bg-subtle text-ink-soft border border-line",
    ghost: "bg-transparent hover:bg-subtle text-ink-soft border border-transparent",
    dark: "bg-ink hover:bg-ink-soft text-white border border-transparent",
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-sans font-medium whitespace-nowrap transition-colors duration-120 ${disabled ? "cursor-default opacity-50" : "cursor-pointer"} ${sizes[size]} ${variants[variant]} ${className ?? ""}`}
      {...rest}
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
    <span
      className={`inline-flex items-center whitespace-nowrap font-medium leading-none ${tag ? "h-4 px-[5px] text-[10px] rounded" : "h-[18px] px-[7px] text-[10.5px] rounded-full"} ${uppercase ? "tracking-wide uppercase" : ""}`}
      style={{ color: t.fg, background: t.bg, border: `1px solid ${t.border}` }}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-ink text-white font-semibold shrink-0 tracking-tighter ${size === "sm" ? "w-6 h-6 text-[10px]" : "w-7.5 h-7.5 text-xs"}`}
    >
      {initials}
    </span>
  );
}

export function StatusIndicator({ connected = true, labelConnected = "en direct", labelOffline = "hors ligne" }:
  { connected?: boolean; labelConnected?: string; labelOffline?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${connected ? "text-accent-deep" : "text-muted"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-accent" : "bg-muted"}`} />
      {connected ? labelConnected : labelOffline}
    </span>
  );
}
