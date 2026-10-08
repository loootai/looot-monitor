import type { SerpRow } from "./types";

export interface SerpEvent {
  kind: "serp_new" | "serp_move" | "serp_gone";
  row: SerpRow;
  previousPosition: number | null;
}

/**
 * Compares the current results with the last ones, by domain (best position per domain).
 * Returns the rows with their change, a "new" event for each domain that entered, a "move" event
 * for a tracked domain that moved three or more places, and a "gone" event for a tracked domain
 * that left the list.
 */
export function diffSerp(previous: SerpRow[], current: SerpRow[], tracked: string[] = []): { rows: SerpRow[]; events: SerpEvent[] } {
  const best = (rows: SerpRow[]) => {
    const m = new Map<string, SerpRow>();
    for (const r of rows) if (!m.has(r.domain) || m.get(r.domain)!.position > r.position) m.set(r.domain, r);
    return m;
  };
  const before = best(previous);
  const now = best(current);
  const isTracked = (d: string) => tracked.some((t) => d === t || d.endsWith(`.${t}`));
  const events: SerpEvent[] = [];
  const firstRun = previous.length === 0;
  const rows = current.map((r) => {
    const old = before.get(r.domain);
    return { ...r, change: firstRun ? 0 : old ? old.position - r.position : null };
  });
  if (firstRun) return { rows, events };
  for (const [domain, r] of now) {
    const old = before.get(domain);
    if (!old) events.push({ kind: "serp_new", row: r, previousPosition: null });
    else if (isTracked(domain) && Math.abs(old.position - r.position) >= 3) events.push({ kind: "serp_move", row: r, previousPosition: old.position });
  }
  for (const [domain, old] of before) {
    if (!now.has(domain) && isTracked(domain)) events.push({ kind: "serp_gone", row: old, previousPosition: old.position });
  }
  return { rows, events };
}

/** Words for a position change: new, up 2, down 1, or a dash for no change. */
export function changeLabel(change: number | null | undefined): string {
  if (change === null) return "new";
  if (!change) return "-";
  return change > 0 ? `up ${change}` : `down ${-change}`;
}
