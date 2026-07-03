"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, Search, Sparkles, CircleDot, ArrowRight } from "lucide-react";
import { Button, Badge } from "../ui/primitives";
import { EmptyState } from "../ui/workspace-ui";
import { useShellHeader } from "../layout/use-shell-header";
import { useWeaveProject } from "../../hooks/use-weave-project";
import { useT } from "../../lib/i18n/context";
import type { Agent, OrgCfg } from "../../lib/types";

const DOTS = ["#e07b53", "#4c8bf5", "#42a05f", "#a855c7", "#d9a441", "#e0518a", "#5aa9a3"];
function dotColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return DOTS[h % DOTS.length];
}

export function AgentsLibrary() {
  const t = useT();
  const weave = useWeaveProject();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      weave.agents.filter((a) => {
        if (!q) return true;
        return [a.name, a.role, a.team, a.domain, a.derived_from].some((v) => (v ?? "").toLowerCase().includes(q));
      }),
    [weave.agents, q],
  );
  const pending = filtered.filter((a) => a.status === "pending");
  const active = filtered.filter((a) => a.status !== "pending");

  const orgSwitcher = useMemo(() => (
    weave.presets.length > 0 ? (
      <select
        value={weave.orgId}
        onChange={(e) => weave.switchOrg(e.target.value)}
        aria-label={t("nav.org")}
        className="h-9 border border-line rounded-md bg-surface px-2.5 text-sm text-ink font-sans cursor-pointer"
      >
        {weave.presets.map((p: OrgCfg) => (
          <option key={p.org} value={p.org}>{p.name}</option>
        ))}
      </select>
    ) : null
  ), [weave.orgId, weave.presets, weave.switchOrg, t]);

  useShellHeader({ subtitle: t("library.subtitle"), actions: orgSwitcher });

  return (
      <div className="mx-auto max-w-[1080px] px-6 pb-16">
        <header className="pt-8 pb-2">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink flex items-center gap-2.5">
            <Bot size={24} className="text-accent" strokeWidth={2} />
            {t("library.title")}
          </h1>
          <p className="mt-2 max-w-[620px] text-sm text-ink-soft leading-relaxed">{t("library.intro")}</p>
        </header>

        <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-bg">
          <div className="relative max-w-[360px]">
            <Search size={15} color="var(--muted)" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("library.searchPlaceholder")}
              aria-label={t("library.searchPlaceholder")}
              className="w-full h-9 box-border border border-line focus:border-accent bg-subtle focus:bg-surface rounded-md pl-[34px] pr-3 text-sm text-ink outline-none focus:ring-3 focus:ring-accent-soft transition-all duration-120"
            />
          </div>
        </div>

        {weave.loading ? (
          <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
            {[0, 1, 2, 3].map((i) => <div key={i} className="wv-shimmer h-[112px] rounded-xl" />)}
          </div>
        ) : weave.agents.length === 0 ? (
          <div className="mt-4 max-w-[520px] border border-line rounded-xl bg-surface p-8 text-center">
            <Bot size={26} className="mx-auto text-muted" />
            <div className="mt-3 text-[15px] font-semibold text-ink">{t("library.emptyTitle")}</div>
            <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">{t("library.emptyBody")}</p>
            <div className="mt-4">
              <Link href="/espace-de-travail" className="no-underline">
                <Button variant="secondary" icon={<ArrowRight size={15} />}>{t("library.goIngest")}</Button>
              </Link>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4"><EmptyState>{t("library.noResults")}</EmptyState></div>
        ) : (
          <div className="mt-2 flex flex-col gap-7">
            {pending.length > 0 && (
              <Section title={t("library.pending")} count={pending.length} tone="pending">
                {pending.map((a) => (
                  <AgentCard key={a.id} agent={a} onApprove={() => weave.approveAgent(a.name)} />
                ))}
              </Section>
            )}
            {active.length > 0 && (
              <Section title={t("library.active")} count={active.length} tone="active">
                {active.map((a) => (
                  <AgentCard key={a.id} agent={a} />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
  );
}

function Section({ title, count, tone, children }: { title: string; count: number; tone: "active" | "pending"; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
        <span className="text-[11px] text-muted bg-subtle rounded-full px-2 py-px tabular-nums">{count}</span>
        {tone === "pending" && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--lvl-org)" }} />}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(258px,1fr))" }}>
        {children}
      </div>
    </section>
  );
}

function AgentCard({ agent, onApprove }: { agent: Agent; onApprove?: () => void }) {
  const t = useT();
  const pending = agent.status === "pending";
  const color = dotColor(agent.team || agent.name);
  const skillCount = agent.skills.length;
  const skillLabel = skillCount === 1 ? t("library.skillCount", { count: skillCount }) : t("library.skillsCount", { count: skillCount });

  return (
    <Link
      href={`/agent?name=${encodeURIComponent(agent.name)}`}
      className="group no-underline border border-line rounded-xl bg-surface p-[14px] flex flex-col gap-2.5 transition-shadow duration-120 hover:shadow-[0_2px_10px_rgba(15,15,15,0.06)] hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--line))]"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
          <Bot size={15} style={{ color }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[13px] font-medium text-ink truncate">{agent.name}</div>
          <div className="mt-0.5 text-xs text-muted line-clamp-2 leading-snug">{agent.role || agent.derived_from}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {agent.team ? <Badge tone="neutral">{agent.team}</Badge> : null}
        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
          <Sparkles size={12} className="text-accent" />{skillLabel}
        </span>
        <span className="ml-auto">
          {pending ? (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onApprove?.(); }}
              className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium rounded-md bg-ink hover:bg-ink-soft text-white cursor-pointer transition-colors duration-120"
            >
              <CircleDot size={12} />{t("agentDetail.approve")}
            </button>
          ) : (
            <Badge tone="active">{t("common.active")}</Badge>
          )}
        </span>
      </div>
    </Link>
  );
}
