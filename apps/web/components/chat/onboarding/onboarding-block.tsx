"use client";

import { LoaderCircle } from "lucide-react";
import { Button } from "../../ui/primitives";
import { useT } from "../../../lib/i18n/context";
import type { OnboardingStepDef } from "./onboarding-steps";

export function OnboardingBlock({
  step,
  stepIndex,
  stepCount,
  busy,
  waiting,
  onAction,
  onSkip,
}: {
  step: OnboardingStepDef;
  stepIndex: number;
  stepCount: number;
  busy?: boolean;
  /** Simulation (or other long action) running — hide CTA, show status */
  waiting?: boolean;
  onAction: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const pct = Math.round(((stepIndex + 1) / stepCount) * 100);

  return (
    <div className="wv-chat-block wv-onboarding-block" data-testid={`onboarding-step-${step.id}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
          {t("onboarding.progress", { current: stepIndex + 1, total: stepCount })}
        </span>
        {!waiting && (
          <button
            type="button"
            onClick={onSkip}
            className="border-none bg-transparent p-0 text-[11px] font-medium text-muted hover:text-ink-soft cursor-pointer font-sans"
          >
            {t("onboarding.skip")}
          </button>
        )}
      </div>
      <div className="h-1 rounded-full bg-subtle overflow-hidden mb-4">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <h2 className="m-0 text-[17px] font-semibold tracking-tight text-ink">{t(step.titleKey)}</h2>
      <p className="mt-2 mb-0 text-[14px] text-ink-soft leading-[1.55]">{t(step.bodyKey)}</p>
      {waiting ? (
        <p className="mt-4 mb-0 flex items-center gap-2 text-[13px] text-ink-soft">
          <LoaderCircle size={15} className="wv-spin shrink-0 text-accent" />
          {t("onboarding.analysing")}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="md"
            disabled={busy}
            onClick={onAction}
            icon={busy ? <LoaderCircle size={15} className="wv-spin" /> : undefined}
          >
            {busy ? t("onboarding.working") : t(step.ctaKey)}
          </Button>
        </div>
      )}
    </div>
  );
}
