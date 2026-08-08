import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  random,
} from "remotion";
import { C, FONT } from "../theme";
import { Backdrop, Kicker, Reveal } from "../components";

// 400+ isolated agent dots scattering — "un par personne, un par tâche".
const DOTS = 60;

export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const count = Math.round(
    interpolate(frame, [12, 70], [0, 400], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  return (
    <AbsoluteFill>
      <Backdrop />
      {/* scattered isolated dots */}
      <AbsoluteFill>
        {new Array(DOTS).fill(0).map((_, i) => {
          const seed = i + 1;
          const gx = 0.1 + random(`x${seed}`) * 0.8;
          const gy = 0.14 + random(`y${seed}`) * 0.72;
          const appear = 14 + random(`a${seed}`) * 55;
          const s = spring({
            frame: frame - appear,
            fps,
            config: { damping: 14, stiffness: 90 },
          });
          const drift = interpolate(frame, [0, 200], [0, random(`d${seed}`) * 14 - 7]);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: gx * width + drift,
                top: gy * height + drift * 0.5,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: C.accent,
                opacity: 0.9 * s,
                transform: `scale(${s})`,
                boxShadow: `0 0 0 8px ${C.accentSoft}`,
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* center number */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <Reveal at={8}>
          <Kicker color={C.inkSoft}>Pennylane · Responsable IA</Kicker>
        </Reveal>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 210,
            fontWeight: 800,
            color: C.ink,
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          {count}
          <span style={{ color: C.accent }}>+</span>
        </div>
        <Reveal at={40}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 46,
              fontWeight: 500,
              color: C.inkSoft,
              letterSpacing: "-0.01em",
            }}
          >
            agents IA. Un par personne. Un par tâche.
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
