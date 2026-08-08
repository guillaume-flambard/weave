import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT } from "../theme";
import { Backdrop, Kicker, Reveal } from "../components";

// The wall cracks; one shared, glowing skill reaches every isolated agent.
export const Scene3Wish: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const cx = width / 2;
  const cy = height / 2 + 20;

  const glow = spring({ frame: frame - 40, fps, config: { damping: 12 } });
  const pulse = 1 + Math.sin(frame / 12) * 0.04;

  // 8 satellite agents around the shared skill
  const nodes = new Array(8).fill(0).map((_, i) => {
    const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = 330;
    return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, i };
  });

  const lineProg = (i: number) =>
    interpolate(frame, [55 + i * 4, 80 + i * 4], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <AbsoluteFill>
      <Backdrop />

      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0 }}
      >
        {nodes.map((n) => {
          const p = lineProg(n.i);
          const x = cx + (n.x - cx) * p;
          const y = cy + (n.y - cy) * p;
          return (
            <line
              key={n.i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={C.accent}
              strokeWidth={3}
              strokeOpacity={0.5}
            />
          );
        })}
      </svg>

      {nodes.map((n) => {
        const p = lineProg(n.i);
        return (
          <div
            key={n.i}
            style={{
              position: "absolute",
              left: n.x - 26,
              top: n.y - 26,
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: C.surface,
              border: `2px solid ${C.line}`,
              boxShadow: `0 0 0 ${8 * p}px ${C.accentSoft}`,
              opacity: 0.5 + p * 0.5,
            }}
          />
        );
      })}

      {/* shared skill core */}
      <div
        style={{
          position: "absolute",
          left: cx - 90,
          top: cy - 90,
          width: 180,
          height: 180,
          borderRadius: 40,
          background: `linear-gradient(135deg, ${C.accent}, ${C.accentDeep})`,
          boxShadow: `0 0 ${60 * glow}px ${C.accent}66`,
          transform: `scale(${glow * pulse})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontFamily: FONT,
          fontSize: 28,
          fontWeight: 700,
          textAlign: "center",
          letterSpacing: "-0.01em",
        }}
      >
        skill
        <br />
        partagé
      </div>

      {/* headline */}
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 0,
          right: 0,
          textAlign: "center",
        }}
      >
        <Reveal at={6}>
          <Kicker color={C.accent}>L'idéal</Kicker>
        </Reveal>
        <Reveal at={14}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 52,
              fontWeight: 700,
              color: C.ink,
              letterSpacing: "-0.02em",
              marginTop: 10,
            }}
          >
            Une compétence par défaut, pour tout le monde.
          </div>
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};
