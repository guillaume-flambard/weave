"use client";

import { useEffect, useState } from "react";

export type ViewportLayout = "3col" | "2col" | "tabs";

export function useViewport() {
  const [width, setWidth] = useState(1440);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
