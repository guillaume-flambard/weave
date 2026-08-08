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
import { Backdrop } from "../components";

// Real product captures (retina) driving the actual emergence flow.
const SHOTS = [
  { src: "demo/live-01-emerge.png", pill: "les compétences émergent — en direct" },
  { src: "demo/live-02-provenance.png", pill: "réponse ancrée dans la mémoire de l'équipe" },
  { src: "demo/live-03-layers.png", pill: "provenance · couches mémoire (perso → projet)" },
];

const MONTAGE_END = 264;

export const Scene5Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const per = MONTAGE_END / SHOTS.length;

  const ctaIn = spring({
    frame: frame - MONTAGE_END,
    fps,
    config: { damping: 16 },
  });
  const montageOut = interpolate(
    frame,
    [MONTAGE_END - 12, MONTAGE_END + 6],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill>
      <Backdrop />

      {/* real product montage */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: montageOut,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.muted,
            position: "absolute",
            top: 60,
          }}
        >
          Weave en action · produit réel
        </div>

        {SHOTS.map((shot, i) => {
          const start = i * per;
          const local = frame - start;
          const op = interpolate(
            local,
            [0, 10, per - 10, per],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          if (op <= 0) return null;
          const zoom = interpolate(local, [0, per], [1.02, 1.09]);
          const pillIn = interpolate(local, [8, 22], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <React.Fragment key={i}>
              {/* callout pill — top, clear of the subtitle band */}
              <div
                style={{
                  position: "absolute",
                  top: 104,
                  opacity: op * pillIn,
                  transform: `translateY(${(1 - pillIn) * -10}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 26px",
                  borderRadius: 999,
                  background: C.accent,
                  color: "#fff",
                  fontFamily: FONT,
                  fontSize: 28,
                  fontWeight: 600,
                  boxShadow: `0 10px 30px ${C.accent}44`,
                }}
              >
                <span
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: "#fff",
                  }}
                />
                {shot.pill}
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 176,
                  height: 828,
                  maxWidth: 1680,
                  borderRadius: 18,
                  overflow: "hidden",
                  border: `1px solid ${C.line}`,
                  boxShadow: "0 30px 80px rgba(55,53,47,0.18)",
                  opacity: op,
                  transform: `scale(${zoom})`,
                }}
              >
                <Img
                  src={staticFile(shot.src)}
                  style={{ height: "100%", display: "block" }}
                />
              </div>
            </React.Fragment>
          );
        })}
      </AbsoluteFill>

      {/* CTA card */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 30,
          opacity: ctaIn,
          transform: `translateY(${(1 - ctaIn) * 24}px)`,
        }}
      >
        <Img src={staticFile("mark-1024.png")} style={{ width: 120, height: 120 }} />
        <div
          style={{
            fontFamily: FONT,
            fontSize: 92,
            fontWeight: 800,
            color: C.ink,
            letterSpacing: "-0.03em",
            textAlign: "center",
            lineHeight: 1.05,
          }}
        >
          Le niveau 3.<br />
          <span style={{ color: C.accent }}>Par défaut.</span>
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 40,
            fontWeight: 500,
            color: C.inkSoft,
          }}
        >
          Weave · Cognitive Runtime pour vos équipes
        </div>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontFamily: FONT,
            fontSize: 34,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              padding: "14px 30px",
              borderRadius: 999,
              background: C.accent,
              color: "#fff",
            }}
          >
            Parlons-en
          </span>
          <span style={{ color: C.muted }}>strayeye.com</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
