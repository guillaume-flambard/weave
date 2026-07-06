"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Building2, Zap, FileText, Brain, Route, Users, Copy, Check,
} from "lucide-react";
import { Button, Badge, Avatar } from "../../../components/ui/primitives";
import { Panel } from "../../../components/ui/workspace-ui";
import { useT } from "../../../lib/i18n/context";
import { useWeaveProject } from "../../../hooks/use-weave-project";
import { useViewport } from "../../../hooks/use-viewport";
import type { Fact, Skill } from "../../../lib/types";

type Level = "personal" | "team" | "project" | "organization";

function useViewportWidth() {
  const { width } = useViewport();
  return width;
}

function CompetencePageInner() {
  const w = useViewportWidth();
  const t = useT();
  const weave = useWeaveProject();
  const params = useSearchParams();
  const skillName = params.get("name");
  const skill = useMemo(
    () => (skillName ? weave.skills.find((s) => s.name === skillName) ?? null : null),
    [weave.skills, skillName],
  );
  const sourceFacts = useMemo(() => {
    if (!skill) return [] as Fact[];
    const ids = new Set(skill.sources);
    return weave.facts.filter((f) => ids.has(f.id));
  }, [skill, weave.facts]);

  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const on = () => setCollapsed((window.scrollY || 0) > 130);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => () => clearTimeout(copyT.current), []);

  const isNarrow = w < 768;
  const collapseBody = isNarrow && !expanded;

  const onCopy = (text: string) => {
    try { navigator.clipboard?.writeText(text); } catch { /* noop */ }
    setCopied(true);
    clearTimeout(copyT.current);
    copyT.current = setTimeout(() => setCopied(false), 1600);
  };

  if (weave.loading) {
    return (
      <Shell>
        <div className="max-w-[1360px] mx-auto px-6 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start mt-6">
            <div className="flex flex-col gap-4">
              {[40, 180, 128].map((h, i) => (
                <div key={i} className="border border-line rounded-lg p-4 bg-surface">
                  <div className="wv-shimmer h-3.5 w-[34%]" />
                  <div className="wv-shimmer" style={{ height: h, marginTop: 14 }} />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-4">
              {[120, 60].map((h, i) => (
                <div key={i} className="border border-line rounded-lg p-4 bg-surface">
                  <div className="wv-shimmer" style={{ height: h }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (!skillName) {
    return (
      <Shell>
        <div className="max-w-[860px] mx-auto px-6 pb-16">
          <h1 className="pt-6 text-[22px] font-semibold text-ink">{t("skillDetail.listTitle")}</h1>
          {weave.skills.length === 0 ? (
            <p className="mt-4 text-ink-soft">
              {t("skill.emptyBody")}
              <Link href="/" className="text-accent">{t("skill.emptyLink")}</Link>.
            </p>
          ) : (
            <ul className="mt-5 flex flex-col gap-2">
              {weave.skills.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/competence?name=${encodeURIComponent(s.name)}`}
                    className="flex items-center gap-2.5 no-underline border border-line rounded-lg bg-surface p-[11px_14px] hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--line))]"
                  >
                    <Sparkles size={15} className="text-accent shrink-0" />
                    <span className="font-mono text-sm text-ink truncate">{s.name}</span>
                    <Badge tone={s.memory_level as Level}>{t(`levels.${s.memory_level as Level}`)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Shell>
    );
  }

  if (!skill) {
    return (
      <Shell>
        <div className="max-w-[1360px] mx-auto p-6 flex justify-center">
          <div className="max-w-[440px] w-full text-center border border-line rounded-lg bg-surface p-[32px_28px] mt-8 box-border">
            <Sparkles size={26} className="mx-auto text-muted" />
            <div className="mt-4 text-[16px] font-semibold">{t("skill.notFoundTitle")}</div>
            <div className="mt-1.5 text-sm text-ink-soft leading-relaxed">{t("skill.notFoundBody")}</div>
            <div className="mt-[18px] flex justify-center gap-2">
              <Link href="/competence" className="no-underline">
                <Button variant="secondary">{t("skillDetail.backToSkills")}</Button>
              </Link>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <SkillDetail
      skill={skill}
      sourceFacts={sourceFacts}
      collapsed={collapsed}
      expanded={expanded}
      setExpanded={setExpanded}
      collapseBody={collapseBody}
      isNarrow={isNarrow}
      copied={copied}
      onCopy={onCopy}
      t={t}
    />
  );
}

export default function CompetencePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <CompetencePageInner />
    </Suspense>
  );
}

function SkillDetail({
  skill,
  sourceFacts,
  collapsed,
  expanded,
  setExpanded,
  collapseBody,
  isNarrow,
  copied,
  onCopy,
  t,
}: {
  skill: Skill;
  sourceFacts: Fact[];
  collapsed: boolean;
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  collapseBody: boolean;
  isNarrow: boolean;
  copied: boolean;
  onCopy: (text: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const level = skill.memory_level as Level;
  const isOrg = level === "organization";

  return (
    <Shell>
      <div className="max-w-[1360px] mx-auto px-6 pb-16">
        <nav aria-label="Breadcrumb" className="pt-4 flex items-center gap-[7px] text-[12.5px] text-muted">
          <Link href="/competence" className="text-muted no-underline">{t("skillDetail.breadcrumb")}</Link>
          <span>/</span>
          <span className="font-mono text-ink-soft">{skill.name}</span>
        </nav>

        <div
          className="sticky top-0 z-20 bg-bg mb-4"
          style={{
            padding: collapsed ? "12px 0" : "18px 0 20px",
            borderBottom: collapsed ? "1px solid var(--line)" : "1px solid transparent",
            transition: "padding 150ms ease",
          }}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                {isOrg ? (
                  <Building2 size={17} className="shrink-0 text-lvl-org" />
                ) : (
                  <Sparkles size={17} className="shrink-0 text-accent" />
                )}
                <span className="font-mono text-lg font-semibold text-ink break-words">{skill.name}</span>
                <Badge tone={level}>{t(`levels.${level}`)}</Badge>
              </div>
              {!collapsed && (
                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted">
                  {skill.team && <span>{t("skillDetail.metaTeam", { team: skill.team })}</span>}
                  {skill.team && skill.workstream && <span>·</span>}
                  {skill.workstream && (
                    <span>{t("skillDetail.metaWorkstream", { workstream: skill.workstream })}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <Link href={`/?cmd=ask&q=${encodeURIComponent(skill.trigger)}`} className="no-underline">
                <Button variant="primary" size="md" icon={<Sparkles size={15} />}>
                  {t("skillDetail.useInResponse")}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
          <div className="flex flex-col gap-4 min-w-0">
            <Panel
              title={t("skillDetail.triggersTitle")}
              icon={<Zap size={15} strokeWidth={2} />}
              subtitle={t("skillDetail.triggersSubtitle")}
            >
              <span className="inline-flex items-center gap-1.5 border border-line bg-subtle rounded-full p-[5px_12px] text-[12.5px] text-ink-soft">
                <span className="w-[5px] h-[5px] rounded-full bg-accent" />
                « {skill.trigger} »
              </span>
            </Panel>

            <Panel
              title={t("skillDetail.bodyTitle")}
              icon={<FileText size={15} strokeWidth={2} />}
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  icon={copied ? <Check size={14} /> : <Copy size={14} />}
                  onClick={() => onCopy(skill.body)}
                >
                  {copied ? t("skillDetail.copied") : t("skillDetail.copy")}
                </Button>
              }
            >
              <pre
                className="wv-scroll m-0 whitespace-pre-wrap break-words rounded-md border border-line bg-subtle p-3.5 text-[12.5px] leading-relaxed text-ink-soft font-mono"
                style={{ maxHeight: collapseBody ? 220 : "none", overflowY: collapseBody ? "hidden" : "visible" }}
              >
                {skill.body}
              </pre>
              {isNarrow && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="border-0 bg-transparent p-0 cursor-pointer text-accent font-sans text-[12.5px] font-medium"
                  >
                    {expanded ? t("skillDetail.showLess") : t("skillDetail.showMore")}
                  </button>
                </div>
              )}
            </Panel>

            <Panel
              title={t("skillDetail.sourcesTitle")}
              icon={<Brain size={15} strokeWidth={2} />}
              count={sourceFacts.length}
              subtitle={t("skillDetail.sourcesSubtitle")}
            >
              {sourceFacts.length === 0 ? (
                <p className="text-sm text-ink-soft m-0">{t("skillDetail.sourcesEmpty")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sourceFacts.map((f) => (
                    <div key={f.id} className="border border-line rounded-lg p-[11px_12px] bg-surface">
                      <div className="flex items-center gap-[7px] flex-wrap">
                        <Badge tone={f.memory_level as Level}>{t(`levels.${f.memory_level as Level}`)}</Badge>
                        <span className="text-[11px] text-muted">
                          {f.workstream} · {f.author} · {f.topic}
                        </span>
                      </div>
                      <div className="mt-[5px] text-sm text-ink-soft leading-relaxed">« {f.content} »</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="flex flex-col gap-4 min-w-0">
            <Panel title={t("skillDetail.provenanceTitle")} icon={<Route size={15} strokeWidth={2} />}>
              <div className="flex flex-col gap-2 text-sm text-ink-soft">
                <div>
                  <span className="text-xs text-muted uppercase tracking-wider">{t(`levels.${level}`)}</span>
                  <p className="mt-1 m-0">{skill.workstream || skill.team || "—"}</p>
                </div>
                {sourceFacts.length > 0 && (
                  <p className="m-0 text-xs text-muted">
                    {t("skillDetail.sourcesCount", { count: sourceFacts.length })}
                  </p>
                )}
              </div>
            </Panel>

            <Panel
              title={t("skillDetail.referentsTitle")}
              icon={<Users size={15} strokeWidth={2} />}
              subtitle={t("skillDetail.referentsSubtitle")}
            >
              {skill.referents.length === 0 ? (
                <p className="text-sm text-ink-soft m-0">{t("skillDetail.referentsEmpty")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {skill.referents.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center gap-[7px] border border-line rounded-full p-[3px_10px_3px_3px] bg-surface"
                    >
                      <Avatar name={r} size="sm" />
                      <span className="text-[12.5px] text-ink-soft">{r}</span>
                    </span>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>

      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-60 flex items-center gap-2 rounded-lg bg-ink text-white text-sm"
          style={{ padding: "9px 14px", boxShadow: "0 4px 14px rgba(15,15,15,0.16)" }}
        >
          <Check size={15} />
          {t("skillDetail.copiedToast")}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
