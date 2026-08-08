import { FPS } from "./theme";
import durations from "../public/vo/durations.json";

const dur = (id: string) => durations.find((d) => d.id === id)?.dur ?? 3;

// Padding (seconds) around each scene's voice-over.
const PADS: Record<string, { lead: number; tail: number }> = {
  s1: { lead: 0.6, tail: 1.3 },
  s2: { lead: 0.6, tail: 1.3 },
  s3: { lead: 0.6, tail: 1.5 },
  s4: { lead: 0.7, tail: 1.9 },
  s5: { lead: 0.5, tail: 5.4 }, // long tail: product montage + CTA hold
};

const sec = (s: number) => Math.round(s * FPS);

export type SceneLayout = {
  id: string;
  from: number; // start frame in master timeline
  durationF: number; // frames
  audioDelayF: number; // frames before VO starts inside the scene
  voDur: number; // seconds of VO
};

export function buildLayout(): SceneLayout[] {
  const ids = ["s1", "s2", "s3", "s4", "s5"];
  let cursor = 0;
  const out: SceneLayout[] = [];
  for (const id of ids) {
    const p = PADS[id];
    const voDur = dur(id);
    const durationF = sec(p.lead + voDur + p.tail);
    out.push({ id, from: cursor, durationF, audioDelayF: sec(p.lead), voDur });
    cursor += durationF;
  }
  return out;
}

export const TOTAL_FRAMES = buildLayout().reduce((a, s) => a + s.durationF, 0);

// Distribute caption chunks across the VO window of a scene.
export function captionAt(
  frame: number,
  audioDelayF: number,
  voDur: number,
  chunks: string[]
): string {
  const startF = audioDelayF;
  const endF = audioDelayF + Math.round(voDur * FPS);
  if (frame < startF || frame > endF + FPS * 0.6) return "";
  const totalChars = chunks.reduce((a, c) => a + c.length, 0);
  let acc = startF;
  for (const c of chunks) {
    const span = ((endF - startF) * c.length) / totalChars;
    if (frame >= acc && frame < acc + span + FPS * 0.4) return c;
    acc += span;
  }
  return chunks[chunks.length - 1];
}
