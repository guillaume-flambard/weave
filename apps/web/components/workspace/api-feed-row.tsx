"use client";

import { Bot, Building2, Sparkles } from "lucide-react";
import type { Feed } from "../../lib/types";
import { Badge } from "../ui/primitives";
import { Card, ProgressBar } from "../ui/workspace-ui";

export function ApiFeedRow({ ev }: { ev: Feed }) {
  if (ev.type === "event_ingested") {
    return (
      <Card tone="neutral" radius="md" padding="7px 10px">
        <span style={{ fontSize: 12 }}>
          <span style={{ color: "var(--muted)" }}>{ev.actor}</span>{" "}
          <span style={{ color: "var(--ink)" }}>{ev.text}</span>
        </span>
      </Card>
    );
  }
  if (ev.type === "fact_extracted") {
    return (
      <div style={{ padding: "3px 10px", fontSize: 11, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}>
        <Badge tone="white" shape="tag" uppercase>
          {ev.ftype}
        </Badge>
        fait · {ev.topic}
      </div>
    );
  }
  if (ev.type === "pattern_observed") {
    return (
      <Card tone="organization" radius="md" padding="8px 10px">
        <div style={{ fontSize: 11, color: "var(--lvl-org)" }}>
          schéma « {ev.signature} »
        </div>
        <div style={{ marginTop: 6 }}>
          <ProgressBar occurrences={ev.occurrences ?? 0} threshold={ev.threshold ?? 5} />
        </div>
      </Card>
    );
  }
  if (ev.type === "skill_emerged") {
    const isOrg = (ev.name || "").startsWith("org/");
    return (
      <Card tone={isOrg ? "organization" : "accent"} radius="md" padding="8px 10px">
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: isOrg ? "var(--lvl-org)" : "var(--accent-deep)" }}>
          {isOrg ? <Building2 size={13} /> : <Sparkles size={13} />}
          <b style={{ fontWeight: 600 }}>{isOrg ? "compétence org promue" : "compétence née"}</b> : {ev.name}
        </span>
      </Card>
    );
  }
  if (ev.type === "agent_emerged") {
    return (
      <Card tone="organization" radius="md" padding="8px 10px">
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--lvl-org)" }}>
          <Bot size={13} />
          <b style={{ fontWeight: 600 }}>agent émergé</b> : {ev.name}
        </span>
      </Card>
    );
  }
  return null;
}
