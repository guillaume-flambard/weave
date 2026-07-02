import { Empty, FeedRow, Icons, PanelTitle } from "./dashboard-ui";
import type { Feed } from "../lib/types";

export function FeedPanel({ feed }: { feed: Feed[] }) {
  return (
    <section data-tour="feed" data-testid="feed-panel" className="col-span-4 rounded-lg border border-line bg-surface p-4">
      <PanelTitle icon={<Icons.Activity size={15} strokeWidth={2} />} count={feed.length}>Flux d&apos;activité IA</PanelTitle>
      <div className="mt-3 max-h-[540px] space-y-1.5 overflow-y-auto pr-1">
        {feed.length === 0 && <Empty>Cliquez « Simuler l&apos;activité » : chaque personne de chaque équipe se met à travailler avec l&apos;IA.</Empty>}
        {feed.map((ev, i) => <FeedRow key={i} ev={ev} />)}
      </div>
    </section>
  );
}
