import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT } from "../theme";
import { Backdrop, Kicker, Reveal } from "../components";

const PLATFORMS = [
  { name: "Slack", color: "#4A154B", at: 150 },
  { name: "Discord", color: "#5865F2", at: 168 },
  { name: "Notion", color: C.ink, at: 186 },
];

// The answer: Weave lattice weaves shared skills, lives across platforms, over a memory layer.
export const Scene4Weave: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const cx = width / 2;
  const cy = height / 2 - 10;

  const logoIn = spring({ frame: frame - 6, fps, config: { damping: 14 } });

  // lattice nodes (woven grid)
  const cols = 5;
  const rows = 3;
  const gapX = 150;
  const gapY = 130;
  const nodes: { x: number; y: number; k: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      nodes.push({
        x: cx + (c - (cols - 1) / 2) * gapX,
        y: cy + (r - (rows - 1) / 2) * gapY,
        k: r * cols + c,
      });

  const weave = interpolate(frame, [40, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const edges: [number, number][] = [];
  nodes.forEach((n) => {
    const c = n.k % cols;
    if (c < cols - 1) edges.push([n.k, n.k + 1]);
    if (n.k + cols < nodes.length) edges.push([n.k, n.k + cols]);
  });

  return (
    <AbsoluteFill>
      <Backdrop />

      {/* header: mark + Cognitive Runtime */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            transform: `scale(${logoIn})`,
          }}
        >
          <Img
            src={staticFile("mark-1024.png")}
            style={{ width: 74, height: 74 }}
          />
          <div
            style={{
              fontFamily: FONT,
              fontSize: 66,
              fontWeight: 800,
              color: C.ink,
              letterSpacing: "-0.03em",
            }}
          >
            Weave
          </div>
        </div>
        <Reveal at={20}>
          <Kicker color={C.accent}>Cognitive Runtime</Kicker>
        </Reveal>
      </div>

      {/* lattice */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {edges.map(([a, b], i) => {
          const p = interpolate(weave, [0, 1], [0, 1]);
          const na = nodes[a];
          const nb = nodes[b];
          const x2 = na.x + (nb.x - na.x) * p;
          const y2 = na.y + (nb.y - na.y) * p;
          return (
            <line
              key={i}
              x1={na.x}
              y1={na.y}
              x2={x2}
              y2={y2}
              stroke={C.accent}
              strokeWidth={2.5}
              strokeOpacity={0.35 * weave}
            />
          );
        })}
      </svg>
      {nodes.map((n) => {
        const s = spring({
          frame: frame - (40 + n.k * 2),
          fps,
          config: { damping: 13 },
        });
        return (
          <div
            key={n.k}
            style={{
              position: "absolute",
              left: n.x - 12,
              top: n.y - 12,
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: C.accent,
              transform: `scale(${s})`,
              boxShadow: `0 0 0 6px ${C.accentSoft}`,
            }}
          />
        );
      })}

      {/* platform chips */}
      <div
        style={{
          position: "absolute",
          bottom: 250,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 26,
        }}
      >
        {PLATFORMS.map((p) => {
          const s = spring({
            frame: frame - p.at,
            fps,
            config: { damping: 14 },
          });
          return (
            <div
              key={p.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 26px",
                borderRadius: 999,
                background: C.surface,
                border: `1px solid ${C.line}`,
                boxShadow: "0 6px 22px rgba(55,53,47,0.07)",
                fontFamily: FONT,
                fontSize: 32,
                fontWeight: 600,
                color: C.ink,
                opacity: s,
                transform: `translateY(${(1 - s) * 16}px)`,
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: p.color,
                }}
              />
              {p.name}
            </div>
          );
        })}
      </div>

      {/* memory layer band */}
      <div
        style={{
          position: "absolute",
          bottom: 150,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Reveal at={205}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 600,
              color: C.inkSoft,
              letterSpacing: "0.02em",
            }}
          >
            <span style={{ display: "flex", gap: 5 }}>
              {[C.personal, C.team, C.project, C.organization].map((c, i) => (
                <span
                  key={i}
                  style={{
                    width: 40,
                    height: 10,
                    borderRadius: 4,
                    background: c,
                  }}
                />
              ))}
            </span>
            mémoire commune · contexte partagé
          </div>
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};
