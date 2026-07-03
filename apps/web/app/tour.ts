"use client";

import { useCallback, useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import { useLocale } from "../lib/i18n/context";

export function useGuidedTour() {
  const driverRef = useRef<Driver | null>(null);
  const { t } = useLocale();

  const start = useCallback(() => {
    driverRef.current?.destroy();
    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: "#37352f",
      overlayOpacity: 0.45,
      popoverClass: "weave-tour",
      nextBtnText: t("tour.next"),
      prevBtnText: t("tour.prev"),
      doneBtnText: t("tour.done"),
      progressText: t("tour.progress"),
      steps: [
        {
          popover: {
            title: t("tour.welcome.title"),
            description: t("tour.welcome.description"),
          },
        },
        {
          element: '[data-testid="chat-composer"]',
          popover: {
            title: t("tour.ask.title"),
            description: t("chat.slashHint"),
            side: "top",
            align: "center",
          },
        },
        {
          element: '[data-tour="simulate"]',
          popover: {
            title: t("tour.ingest.title"),
            description: t("tour.ingest.description"),
            side: "top",
            align: "start",
          },
        },
        {
          element: '[data-testid="chat-thread"]',
          popover: {
            title: t("tour.feed.title"),
            description: t("tour.feed.description"),
            side: "top",
            align: "center",
          },
        },
        {
          popover: {
            title: t("tour.finish.title"),
            description: t("tour.finish.description"),
          },
        },
      ],
    });
    driverRef.current = d;
    d.drive();
  }, [t]);

  useEffect(() => () => driverRef.current?.destroy(), []);

  const notifySkillEmerged = useCallback(() => {
    /* skills emerge in chat feed blocks */
  }, []);

  return { start, notifySkillEmerged };
}
