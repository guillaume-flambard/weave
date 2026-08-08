import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "./theme";

// Clean paper background with faint dot grid.
export const Backdrop: React.FC<{ tint?: string }> = ({ tint }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: tint ?? C.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${C.line} 1.2px, transparent 1.2px)`,
          backgroundSize: "44px 44px",
          opacity: 0.55,
        }}
      />
      {/* soft vignette to keep focus centered */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,255,255,0) 40%, rgba(255,255,255,0.85) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

// Burned-in subtitle bar at the bottom.
export const Subtitle: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  if (!text) return null;
  const op = interpolate(frame % 1000, [0, 4], [0.85, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 96,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontSize: 40,
          fontWeight: 500,
          color: C.ink,
          background: "rgba(255,255,255,0.82)",
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          padding: "14px 26px",
          maxWidth: 1300,
          textAlign: "center",
          letterSpacing: "-0.01em",
          boxShadow: "0 2px 18px rgba(55,53,47,0.06)",
          opacity: op,
        }}
      >
        {text}
      </div>
    </div>
  );
};

// Small caption/kicker label.
export const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color,
}) => (
  <div
    style={{
      fontFamily: FONT,
      fontSize: 26,
      fontWeight: 600,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: color ?? C.muted,
    }}
  >
    {children}
  </div>
);

// Fade+rise wrapper driven by a local frame window.
export const Reveal: React.FC<{
  at: number;
  children: React.ReactNode;
  y?: number;
  dur?: number;
}> = ({ at, children, y = 24, dur = 14 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)` }}>
      {children}
    </div>
  );
};
