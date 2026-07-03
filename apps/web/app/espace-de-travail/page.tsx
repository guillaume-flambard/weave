"use client";

import { useRef } from "react";
import { WorkspaceDashboard } from "../../components/workspace/workspace-dashboard";
import { useGuidedTour } from "../tour";

export default function EspaceDeTravailPage() {
  const { start: startTour, notifySkillEmerged } = useGuidedTour();
  const notifyRef = useRef(notifySkillEmerged);
  notifyRef.current = notifySkillEmerged;

  return <WorkspaceDashboard onStartTour={startTour} onSkillEmerged={() => notifyRef.current()} />;
}
