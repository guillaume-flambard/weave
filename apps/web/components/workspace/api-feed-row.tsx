"use client";

import { Bot, Building2, Sparkles } from "lucide-react";
import { useT } from "../../lib/i18n/context";
import type { Feed } from "../../lib/types";
import { Badge } from "../ui/primitives";
import { Card, ProgressBar } from "../ui/workspace-ui";

const PIPELINE_STEP_KEY: Record<string, string> = {
  event_ingested: "workspace.ingestion.stepRead",
  fact_extracted: "workspace.ingestion.stepExtract",
  pattern_observed: "workspace.ingestion.stepPattern",
  skill_emerged: "workspace.ingestion.stepSkill",
  agent_emerged: "workspace.ingestion.stepAgent",
};

function PipelineStepBadge({ type }: { type: string }) {
  const t = useT();
  const key = PIPELINE_STEP_KEY[type];
  if (!key) return null;
  return (
    <Badge tone="white" shape="tag" uppercase>
      {t(key)}
    </Badge>
  );
}

export function ApiFeedRow({ ev, showPipelineStep }: { ev: Feed; showPipelineStep?: boolean }) {
  const t = useT();
  const step = showPipelineStep ? <PipelineStepBadge type={ev.type} /> : null;

  if (ev.type === "event_ingested") {
    return (
      <Card tone="neutral" radius="md" padding="7px 10px">
        <div className="flex items-start gap-2">
          {step}
          <span style={{ fontSize: 12 }}>
            <span style={{ color: "var(--muted)" }}>{ev.actor}</span>{" "}
            <span style={{ color: "var(--ink)" }}>{ev.text}</span>
          </span>
        </div>
      </Card>
    );
  }
  if (ev.type === "fact_extracted") {
    return (
      <div style={{ padding: "3px 10px", fontSize: 11, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {step}
        <Badge tone="white" shape="tag" uppercase>
          {ev.ftype}
        </Badge>
        {t("feed.fact")} · {ev.topic}
        {ev.content && <span style={{ color: "var(--ink-soft)" }}>— {ev.content}</span>}
      </div>
    );
  }
  if (ev.type === "pattern_observed") {
    return (
      <Card tone="organization" radius="md" padding="8px 10px">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {step}
          <div style={{ fontSize: 11, color: "var(--lvl-org)" }}>
            {t("feed.pattern", { signature: ev.signature || "" })}
          </div>
        </div>
        <ProgressBar occurrences={ev.occurrences ?? 0} threshold={ev.threshold ?? 5} />
      </Card>
    );
  }
  if (ev.type === "skill_emerged") {
    const isOrg = (ev.name || "").startsWith("org/");
    return (
      <Card tone={isOrg ? "organization" : "accent"} radius="md" padding="8px 10px">
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: isOrg ? "var(--lvl-org)" : "var(--accent-deep)", flexWrap: "wrap" }}>
          {step}
          {isOrg ? <Building2 size={13} /> : <Sparkles size={13} />}
          <b style={{ fontWeight: 600 }}>{isOrg ? t("feed.orgSkillPromoted") : t("feed.skillBorn")}</b> : {ev.name}
        </span>
      </Card>
    );
  }
  if (ev.type === "agent_emerged") {
    return (
      <Card tone="organization" radius="md" padding="8px 10px">
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--lvl-org)", flexWrap: "wrap" }}>
          {step}
          <Bot size={13} />
          <b style={{ fontWeight: 600 }}>{t("feed.agentEmerged")}</b> : {ev.name}
        </span>
      </Card>
    );
  }
  return null;
}
