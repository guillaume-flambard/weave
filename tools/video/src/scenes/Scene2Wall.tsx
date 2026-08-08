import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT } from "../theme";
import { Backdrop, Reveal } from "../components";

// Isolated silos + a hard wall between Niveau 2 and Niveau 3 + garbage-in/out.
export const Scene2Wall: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wall = spring({ frame: frame - 30, fps, config: { damping: 16 } });
  const crack = 0; // wall stays solid in this scene

  const silos = [C.personal, C.team, C.project];

  return (
    <AbsoluteFill>
      <Backdrop />

      {/* three isolated silos on the left */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 300,
          display: "flex",
          gap: 40,
        }}
      >
        {silos.map((col, i) => {
          const s = spring({
            frame: frame - (10 + i * 8),
            fps,
            config: { damping: 15 },
          });
          return (
            <div
              key={i}
              style={{
                width: 150,
                height: 210,
                borderRadius: 18,
                background: C.surface,
                border: `2px solid ${C.line}`,
                boxShadow: "0 8px 30px rgba(55,53,47,0.06)",
                opacity: s,
                transform: `translateY(${(1 - s) * 20}px)`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "50%",
                  background: col,
                }}
              />
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 22,
                  color: C.muted,
                  fontWeight: 600,
                }}
              >
                agent
              </div>
              {/* lock = single-player */}
              <div style={{ fontSize: 30 }}>🔒</div>
            </div>
          );
        })}
      </div>

      {/* the wall */}
      <div
        style={{
          position: "absolute",
          left: 950,
          top: 210,
          width: 26,
          height: 560,
          background: `repeating-linear-gradient(0deg, ${C.ink} 0 34px, ${C.inkSoft} 34px 40px)`,
          borderRadius: 6,
          transform: `scaleY(${wall})`,
          transformOrigin: "top",
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 700,
          top: 150,
          fontFamily: FONT,
          fontSize: 30,
          fontWeight: 700,
          color: C.muted,
          opacity: wall,
        }}
      >
        Niveau 2
      </div>
      <div
        style={{
          position: "absolute",
          left: 1030,
          top: 150,
          fontFamily: FONT,
          fontSize: 30,
          fontWeight: 700,
          color: C.warn,
          opacity: wall,
        }}
      >
        Niveau 3
      </div>

      {/* garbage in / garbage out on the right */}
      <div style={{ position: "absolute", left: 1120, top: 340 }}>
        <Reveal at={70}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontFamily: FONT,
              fontSize: 30,
              color: C.inkSoft,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                background: C.warnSoft,
                color: C.warn,
              }}
            >
              données sales
            </span>
            <span style={{ color: C.muted }}>→</span>
            <span
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                background: C.warnSoft,
                color: C.warn,
              }}
            >
              réponses fausses
            </span>
          </div>
        </Reveal>
      </div>

      {/* headline */}
      <div style={{ position: "absolute", left: 150, top: 170 }}>
        <Reveal at={4}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 54,
              fontWeight: 700,
              color: C.ink,
              letterSpacing: "-0.02em",
              maxWidth: 720,
            }}
          >
            Chaque agent vit seul.
          </div>
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};
