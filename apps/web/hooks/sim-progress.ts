/** Pure, dependency-free logic for the `/simulate` progress block, so it can be
 *  unit-tested without pulling in React or the browser API client. */

export type SimProgress = {
  /** Total events in store when simulation started */
  startEvents: number;
  /** Number of new messages being processed in this batch */
  batchSize: number;
  events: number;
  /** Events ingested this batch (from live SSE), used when stats lag */
  ingested: number;
  facts: number;
  skills: number;
};

/** How many consecutive idle poll ticks (no change in events/facts/skills)
 *  before we assume the batch is done. At a 2s poll interval this is ~10s. */
export const SIM_MAX_STALL_TICKS = 5;

export function simProgressMetrics(p: SimProgress) {
  const fromStats = Math.max(0, p.events - p.startEvents);
  const processed = Math.min(p.batchSize, Math.max(fromStats, p.ingested));
  const pct = p.batchSize > 0 ? Math.min(100, Math.round((processed / p.batchSize) * 100)) : 100;
  return { processed, pct, target: p.batchSize };
}

/** Decide whether a `/simulate` batch has finished.
 *
 *  Completion normally arrives as a `simulation_complete` SSE event, but that
 *  single broadcast can be missed (reconnect, throttle, backgrounded tab) and —
 *  critically — a re-run over an already-ingested store inserts 0 new events, so
 *  neither `events` nor `ingested` ever advance and the event-based conditions
 *  never trip. The `stallTicks` fallback catches both cases: once stats stop
 *  changing for `maxStallTicks` polls, the backend has finished (or had nothing
 *  to do) and we stop waiting instead of hanging at `0/batch` forever.
 */
export function simulationDone(
  p: Pick<SimProgress, "startEvents" | "batchSize" | "ingested">,
  events: number,
  stallTicks: number,
  maxStallTicks: number = SIM_MAX_STALL_TICKS,
): boolean {
  if (events >= p.startEvents + p.batchSize) return true;
  if (p.ingested >= p.batchSize) return true;
  return stallTicks >= maxStallTicks;
}
