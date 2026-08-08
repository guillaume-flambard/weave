import React from "react";
import { Composition } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { WeaveExplainer } from "./WeaveExplainer";
import { TOTAL_FRAMES } from "./lib";
import { FPS, WIDTH, HEIGHT } from "./theme";

loadFont("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="WeaveExplainer"
      component={WeaveExplainer}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
