"use client";

import { useRef } from "react";
import { WorkspaceDashboard } from "../components/workspace/workspace-dashboard";
import { useGuidedTour } from "./tour";

export default function Page() {
  const { start: startTour, notifySkillEmerged } = useGuidedTour();
  const notifyRef = useRef(notifySkillEmerged);
  notifyRef.current = notifySkillEmerged;

  return (
    <WorkspaceDashboard
      onStartTour={startTour}
      onSkillEmerged={() => notifyRef.current()}
      subtitle="Bac à sable · votre équipe utilise l'IA sur plusieurs projets, regardez la mémoire se créer"
    />
  );
}
