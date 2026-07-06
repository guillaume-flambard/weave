"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Info, LayoutGrid, Loader2 } from "lucide-react";
import { Badge, Button } from "../../../components/ui/primitives";
import { useShellHeader } from "../../../components/layout/use-shell-header";
import { useT } from "../../../lib/i18n/context";
import { useWeaveProject } from "../../../hooks/use-weave-project";
import { useLiveConnections } from "../../../hooks/use-live-connections";
import { useViewport } from "../../../hooks/use-viewport";
import { authorizeUrl } from "../../../lib/api";
import { primaryConnectors } from "../../../lib/connectors";
import type { OrgCfg } from "../../../lib/types";
import { PageSkeleton } from "../../../components/ui/page-skeleton";

type Level = "personal" | "team" | "project" | "organization";
type Access = Record<string, Record<Level, boolean>>;
type Team = { name: string; members: string[]; dot: string };

const TEAM_DOTS = ["var(--lvl-team)", "var(--lvl-project)", "var(--lvl-personal)", "var(--lvl-org)"];
const LEVELS: { key: Level; labelKey: string; tone: Level }[] = [
  { key: "personal", labelKey: "levels.personal", tone: "personal" },
  { key: "team", labelKey: "levels.team", tone: "team" },
  { key: "project", labelKey: "levels.project", tone: "project" },
  { key: "organization", labelKey: "levels.organization", tone: "organization" },
];

const FALLBACK_TEAMS: Team[] = [
  { name: "Data", members: ["sophie", "nicolas", "arthur"], dot: "var(--lvl-team)" },
  { name: "Produit", members: ["marc", "léa"], dot: "var(--lvl-project)" },
  { name: "Growth", members: ["alex", "camille"], dot: "var(--lvl-personal)" },
  { name: "Support", members: ["sarah"], dot: "var(--lvl-org)" },
];

function defaultAccess(): Access {
  const a = {} as Access;
  (["Data", "Produit", "Growth", "Support"] as const).forEach((t) => {
    a[t] = { personal: false, team: true, project: true, organization: true };
  });
  a["Growth"].project = false;
  a["Support"].organization = false;
  return a;
}

function orgToTeams(org: OrgCfg | null): Team[] {
  if (!org?.teams?.length) return FALLBACK_TEAMS;
  return org.teams.map((t, i) => ({
    name: t.name,
    members: t.members,
    dot: TEAM_DOTS[i % TEAM_DOTS.length],
  }));
}

function Toggle({ on, onClick, aria }: { on: boolean; onClick: () => void; aria: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={aria}
      onClick={onClick}
      className="w-9 h-5 rounded-full border-none cursor-pointer relative transition-colors"
      style={{ background: on ? "var(--accent)" : "var(--line)" }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-[left]"
        style={{ left: on ? 18 : 2, boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
      />
    </button>
  );
}

export default function ReglagesPage() {
  const tr = useT();
  const weave = useWeaveProject();
  const { providerState, loaded } = useLiveConnections(weave.orgId);
  const connectors = primaryConnectors(weave.orgId);
  const { width } = useViewport();
  const accessMatrix = width >= 720;
  const [access, setAccess] = useState<Access>(defaultAccess);
  const displayTeams = orgToTeams(weave.org);

  const orgSwitcher = useMemo(() => (
    weave.presets.length > 0 ? (
      <select
        value={weave.orgId}
        onChange={(e) => weave.switchOrg(e.target.value)}
        aria-label={tr("nav.org")}
        className="h-9 border border-line rounded-md bg-surface px-2.5 text-sm text-ink font-sans"
      >
        {weave.presets.map((p) => (
          <option key={p.org} value={p.org}>{p.name}</option>
        ))}
      </select>
    ) : null
  ), [weave.orgId, weave.presets, weave.switchOrg, tr]);

  useShellHeader({ subtitle: tr("governance.accessSubtitle"), actions: orgSwitcher });

  const toggleAccess = (team: string, level: Level) => {
    setAccess((prev) => ({
      ...prev,
      [team]: { ...prev[team], [level]: !prev[team]?.[level] },
    }));
  };

  if (weave.loading) {
    return <PageSkeleton variant="settings" />;
  }

  return (
    <div className="mx-auto max-w-[900px] px-6 pb-16">
      <div className="pt-6 pb-4 flex items-center gap-3 flex-wrap">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-deep no-underline hover:text-accent">
          <ArrowLeft size={16} />{tr("chat.backToChat")}
        </Link>
      </div>

      <h1 className="m-0 text-2xl font-semibold tracking-tight flex items-center gap-2">
        <LayoutGrid size={22} className="text-accent" />
        {tr("nav.settings")}
      </h1>

      <section className="mt-8">
        <h2 className="m-0 text-sm font-semibold text-ink">{tr("onboarding.restartLink")}</h2>
        <p className="mt-1 text-sm text-ink-soft">{tr("onboarding.done.body")}</p>
        <Link
          href="/?onboarding=restart"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-deep no-underline hover:text-accent"
        >
          {tr("onboarding.restartLink")} →
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="m-0 text-sm font-semibold text-ink">{tr("governance.org")}</h2>
        <div className="mt-3 border border-line rounded-lg bg-surface p-4">
          <div className="text-lg font-semibold text-ink">{weave.org?.name ?? tr("governance.org")}</div>
          <div className="mt-2 text-sm text-muted">{tr("governance.orgId")} · <span className="font-mono text-ink-soft">{weave.orgId}</span></div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="m-0 text-sm font-semibold text-ink">{tr("overview.connectedSources")}</h2>
        <p className="mt-1 text-sm text-ink-soft">{tr("governance.sourcesSubtitle")}</p>
        <div className="mt-3 border border-line rounded-lg bg-surface divide-y divide-line-soft">
          {connectors.map((c) => {
            const st = providerState(c.id);
            const checking = !loaded && st === "checking";
            const label = checking
              ? tr("sources.checking")
              : st === "connected"
                ? tr("sources.connectedBadge")
                : st === "reconnect"
                  ? tr("sources.reconnectBadge")
                  : tr("governance.sourcesDisconnected");
            const tone = st === "connected" ? "active" : st === "reconnect" ? "pending" : "neutral";
            const oauth = c.id === "slack" || c.id === "notion" || c.id === "discord";
            return (
              <div key={c.id} className="p-3.5 px-4 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink">{c.name}</span>
                    {checking ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                        <Loader2 size={12} className="animate-spin" /> {label}
                      </span>
                    ) : (
                      <Badge tone={tone}>{label}</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{c.role}</div>
                </div>
                {oauth && st !== "connected" && !checking && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      window.location.href = authorizeUrl(c.id as "slack" | "notion" | "discord");
                    }}
                  >
                    {st === "reconnect" ? tr("sources.reconnectBadge") : tr("chat.connect")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <Link href="/?cmd=sources" className="mt-3 inline-block text-sm font-medium text-accent-deep no-underline hover:text-accent">
          {tr("governance.sourcesManage")} →
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="m-0 text-sm font-semibold text-ink">{tr("governance.members")}</h2>
        <div className="mt-3 border border-line rounded-lg bg-surface divide-y divide-line-soft">
          {displayTeams.map((t) => (
            <div key={t.name} className="p-3.5 px-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.dot }} />
              <span className="text-sm font-medium text-ink">{t.name}</span>
              <span className="text-xs text-muted ml-auto">{t.members.join(", ")}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="m-0 text-sm font-semibold text-ink">{tr("governance.access")}</h2>
        <p className="mt-1 text-sm text-ink-soft">{tr("governance.accessSubtitle")}</p>
        <div className="mt-3">
          {accessMatrix ? (
            <div className="border border-line rounded-lg bg-surface overflow-hidden">
              <div className="grid items-center bg-subtle border-b border-line" style={{ gridTemplateColumns: "1.4fr repeat(4, 1fr)" }}>
                <div className="p-[11px_14px] text-[11px] uppercase tracking-wider text-muted font-medium">Équipe peut lire →</div>
                {LEVELS.map((l) => (
                  <div key={l.key} className="p-[11px_8px] flex justify-center"><Badge tone={l.tone}>{tr(l.labelKey)}</Badge></div>
                ))}
              </div>
              {displayTeams.map((t, ri) => (
                <div key={t.name} className="grid items-center" style={{ gridTemplateColumns: "1.4fr repeat(4, 1fr)", borderTop: ri === 0 ? "none" : "1px solid var(--line-soft)" }}>
                  <div className="p-3 px-[14px] flex items-center gap-2">
                    <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: t.dot }} />
                    <span className="text-[13px] text-ink font-medium">{t.name}</span>
                  </div>
                  {LEVELS.map((l) => (
                    <div key={l.key} className="p-[10px_8px] flex justify-center">
                      <Toggle on={!!access[t.name]?.[l.key]} aria={`${t.name} ${tr(l.labelKey)}`} onClick={() => toggleAccess(t.name, l.key)} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {displayTeams.map((t) => (
                <div key={t.name} className="border border-line rounded-lg bg-surface p-3.5">
                  <div className="flex items-center gap-2 mb-[10px]">
                    <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: t.dot }} />
                    <span className="text-sm text-ink font-semibold">{t.name}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {LEVELS.map((l) => (
                      <div key={l.key} className="flex items-center justify-between gap-2.5">
                        <Badge tone={l.tone}>{tr(l.labelKey)}</Badge>
                        <Toggle on={!!access[t.name]?.[l.key]} aria={`${t.name} ${tr(l.labelKey)}`} onClick={() => toggleAccess(t.name, l.key)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-[10px] text-[11.5px] text-muted flex items-center gap-1.5">
            <Info size={13} />La mémoire personnelle reste privée par défaut.
          </div>
        </div>
      </section>
    </div>
  );
}
