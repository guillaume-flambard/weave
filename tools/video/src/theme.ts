// Weave brand tokens (from docs/claude-design/design-tokens.md)
export const C = {
  bg: "#ffffff",
  surface: "#ffffff",
  subtle: "#f7f7f5",
  ink: "#37352f",
  inkSoft: "#787066",
  muted: "#9b9a97",
  line: "#e9e9e7",
  lineSoft: "#f1f0ee",
  accent: "#2383e2",
  accentDeep: "#0b6bcb",
  accentSoft: "#e7f1fb",
  // level colors (provenance)
  personal: "#5b8fb9",
  team: "#6a8f6a",
  project: "#8a6db0",
  organization: "#b08a3a",
  // problem tone (muted warm-red, used sparingly)
  warn: "#c1554d",
  warnSoft: "#f6e9e7",
} as const;

export const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
