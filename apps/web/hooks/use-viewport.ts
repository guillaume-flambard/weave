"use client";

import { useEffect, useSyncExternalStore } from "react";

export type ViewportLayout = "3col" | "2col" | "tabs";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function getWidth() {
  return window.innerWidth;
}

function getServerWidth() {
  return 900;
}

export function useViewport() {
  const width = useSyncExternalStore(subscribe, getWidth, getServerWidth);

  const layout: ViewportLayout = width >= 1120 ? "3col" : width >= 768 ? "2col" : "tabs";
  const isTabs = layout === "tabs";
  const isMobile = width < 560;
  const showSubtitle = width >= 700;
  const showSearch = width >= 1180;
  const showTour = width >= 900;
  const showStatus = width >= 620;

  return { width, layout, isTabs, isMobile, showSubtitle, showSearch, showTour, showStatus };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
