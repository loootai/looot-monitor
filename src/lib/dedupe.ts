import type { Item } from "./types";

const WEEK = 7 * 24 * 3_600_000;

/**
 * Keeps only items the monitor has not seen. On the first run it also drops items older than
 * seven days, so a new monitor does not open with forty old alerts. Items with no date are kept.
 */
export function dedupe(items: Item[], seen: ReadonlySet<string>, opts: { firstRun: boolean; now: Date }): Item[] {
  const out: Item[] = [];
  const inBatch = new Set<string>();
  for (const it of items) {
    if (seen.has(it.fingerprint) || inBatch.has(it.fingerprint)) continue;
    if (opts.firstRun && it.publishedAt && opts.now.getTime() - new Date(it.publishedAt).getTime() > WEEK) continue;
    inBatch.add(it.fingerprint);
    out.push(it);
  }
  return out;
}
