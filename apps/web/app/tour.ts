"use client";

import { useCallback, useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";

const SEEN_KEY = "weave_tour_seen";
const SKILLS_STEP_INDEX = 3; // 0-based: welcome, simulate, feed, skills, ask, done

// Guided tour over the live demo. Restyled to the Notion look via the
// `weave-tour` popover class (see globals.css). Step 4 (skills) advances
// automatically when a REAL `skill_emerged` event arrives — the tour
// demonstrates genuine emergence, not a scripted mock.
export function useGuidedTour() {
  const driverRef = useRef<Driver | null>(null);

  const start = useCallback(() => {
    driverRef.current?.destroy();
    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: "#37352f",
      overlayOpacity: 0.45,
      popoverClass: "weave-tour",
      nextBtnText: "Suivant",
      prevBtnText: "Retour",
      doneBtnText: "Terminer",
      progressText: "{{current}}/{{total}}",
      steps: [
        {
          popover: {
            title: "Bienvenue dans Weave",
            description:
              "Regardez la mémoire d'une organisation se construire toute seule. 4 étapes, ~1 minute. Ensuite, explorez librement.",
          },
        },
        {
          element: '[data-tour="simulate"]',
          popover: {
            title: "1 · Lancez l'activité",
            description:
              "Cliquez sur « Simuler l'activité ». Chaque membre de chaque équipe se met à travailler avec l'IA.",
            side: "bottom",
            align: "end",
          },
        },
        {
          element: '[data-tour="feed"]',
          popover: {
            title: "2 · Les faits sont extraits en direct",
            description:
              "Le flux montre chaque interaction. Un schéma se répète et approche de son seuil d'émergence.",
            side: "right",
            align: "start",
          },
        },
        {
          element: '[data-tour="skills"]',
          popover: {
            title: "3 · Une compétence émerge",
            description:
              "En attente d'émergence… dès qu'un schéma franchit le seuil, une compétence réutilisable naît ici — automatiquement. (Cette étape avance dès qu'une vraie compétence émerge.)",
            side: "left",
            align: "start",
          },
        },
        {
          element: '[data-tour="ask"]',
          popover: {
            title: "4 · Interrogez la mémoire",
            description:
              "Posez une question à l'organisation. La réponse cite ses couches de mémoire : perso → équipe → projet → organisation.",
            side: "top",
            align: "start",
          },
        },
        {
          popover: {
            title: "À vous de jouer",
            description:
              "Explorez librement : injectez des messages, approuvez un agent, changez d'organisation. « Réinitialiser » repart de zéro. Relancez cette visite depuis le bouton « Visite guidée ».",
          },
        },
      ],
    });
    driverRef.current = d;
    d.drive();
  }, []);

  // Auto-start on first visit only. `?tour=off` disables auto-start
  // (handy for screenshots and scripted demos).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("tour") === "off") return;
    if (localStorage.getItem(SEEN_KEY)) return;
    localStorage.setItem(SEEN_KEY, "1");
    const t = setTimeout(start, 600);
    return () => clearTimeout(t);
  }, [start]);

  useEffect(() => () => driverRef.current?.destroy(), []);

  // Called by the page's SSE handler when a real `skill_emerged` arrives.
  // If the tour is sitting on the skills step, advance it.
  const notifySkillEmerged = useCallback(() => {
    const d = driverRef.current;
    if (!d || !d.isActive()) return;
    if (d.getActiveIndex() === SKILLS_STEP_INDEX) {
      setTimeout(() => d.moveNext(), 900); // let the emerge animation play first
    }
  }, []);

  return { start, notifySkillEmerged };
}
