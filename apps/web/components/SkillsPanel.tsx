import { Empty, Icons, PanelTitle, SkillCard } from "./dashboard-ui";
import type { Skill } from "../lib/types";

export function SkillsPanel({ orgSkills, projSkills, newest }: { orgSkills: Skill[]; projSkills: Skill[]; newest: string | null; }) {
  return (
    <section data-tour="skills" data-testid="skills-panel" className="col-span-4 rounded-lg border border-line bg-surface p-4">
      <PanelTitle icon={<Icons.Sparkles size={15} strokeWidth={2} />} count={orgSkills.length + projSkills.length}>Compétences vivantes</PanelTitle>
      <p className="mt-0.5 text-xs text-muted">Nées des projets · promues au niveau org quand partagées entre équipes.</p>
      <div className="mt-3 max-h-[520px] space-y-2.5 overflow-y-auto pr-1">
        {orgSkills.length === 0 && projSkills.length === 0 && <Empty>Aucune encore. Simulez l&apos;activité et regardez-les apparaître.</Empty>}
        {orgSkills.map((s) => <SkillCard key={s.id} s={s} newest={newest} org />)}
        {projSkills.map((s) => <SkillCard key={s.id} s={s} newest={newest} />)}
      </div>
    </section>
  );
}
