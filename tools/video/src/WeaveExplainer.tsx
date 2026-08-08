import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C } from "./theme";
import { buildLayout, TOTAL_FRAMES } from "./lib";
import { CAPTIONS } from "./captions";
import { captionAt } from "./lib";
import { Subtitle } from "./components";
import { Scene1Hook } from "./scenes/Scene1Hook";
import { Scene2Wall } from "./scenes/Scene2Wall";
import { Scene3Wish } from "./scenes/Scene3Wish";
import { Scene4Weave } from "./scenes/Scene4Weave";
import { Scene5Cta } from "./scenes/Scene5Cta";

const SCENE_COMP: Record<string, React.FC> = {
  s1: Scene1Hook,
  s2: Scene2Wall,
  s3: Scene3Wish,
  s4: Scene4Weave,
  s5: Scene5Cta,
};

// Per-scene captions with local frame timing.
const SceneCaption: React.FC<{
  audioDelayF: number;
  voDur: number;
  chunks: string[];
}> = ({ audioDelayF, voDur, chunks }) => {
  const frame = useCurrentFrame();
  const text = captionAt(frame, audioDelayF, voDur, chunks);
  return <Subtitle text={text} />;
};

export const WeaveExplainer: React.FC = () => {
  const layout = buildLayout();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* ambient music bed — ducked under VO, swells into the CTA */}
      <Audio
        src={staticFile("music.mp3")}
        volume={(f) =>
          interpolate(
            f,
            [0, 40, TOTAL_FRAMES - 110, TOTAL_FRAMES - 25],
            [0, 0.85, 0.85, 1.0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          )
        }
      />
      {layout.map((sc) => {
        const Comp = SCENE_COMP[sc.id];
        return (
          <Sequence key={sc.id} from={sc.from} durationInFrames={sc.durationF}>
            <Comp />
            <Sequence from={sc.audioDelayF}>
              <Audio src={staticFile(`vo/${sc.id}.wav`)} />
            </Sequence>
            <SceneCaption
              audioDelayF={sc.audioDelayF}
              voDur={sc.voDur}
              chunks={CAPTIONS[sc.id]}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
