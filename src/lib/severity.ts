import type { PriceChange, Severity } from "./types";

export interface Verdict {
  severity: Severity;
  reason: string;
}

const wordIn = (text: string, word: string) => new RegExp(`(^|[^a-z0-9])${word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text);
const inDomains = (domain: string | null | undefined, list: string[]) => Boolean(domain) && list.some((d) => domain === d || domain!.endsWith(`.${d}`));

/** Page change. First match wins: price change, watch phrase, 20% of lines, else low. */
export function pageSeverity(d: { priceChanges: PriceChange[]; watchHits: string[]; changedRatio: number }): Verdict {
  if (d.priceChanges.length > 0) {
    const p = d.priceChanges[0];
    return { severity: "high", reason: `Price changed: ${p.before} → ${p.after}` };
  }
  if (d.watchHits.length > 0) return { severity: "high", reason: `Watch phrase added or removed: ${d.watchHits[0]}` };
  if (d.changedRatio >= 0.2) return { severity: "medium", reason: `${Math.round(d.changedRatio * 100)}% of lines changed` };
  return { severity: "low", reason: "Small text change" };
}

/** Mention. First match wins: escalation word, priority outlet, engagement of 100 or more, else low. */
export function mentionSeverity(m: { title: string; snippet: string | null; domain: string | null; engagement?: number }, rules: { escalationWords: string[]; priorityDomains: string[] }): Verdict {
  const text = `${m.title} ${m.snippet ?? ""}`;
  const word = rules.escalationWords.find((w) => w.trim() !== "" && wordIn(text, w));
  if (word) return { severity: "high", reason: `Matched escalation word: ${word}` };
  if (inDomains(m.domain, rules.priorityDomains)) return { severity: "medium", reason: `Priority outlet: ${m.domain}` };
  if (m.engagement !== undefined && m.engagement >= 100) return { severity: "medium", reason: `Engagement of ${m.engagement}` };
  return { severity: "low", reason: "New mention" };
}

/** Google result. Competitor in the top 3 or my domain leaving the top 10 is high, a new domain in the top 10 is medium. */
export function serpSeverity(e: { kind: "serp_new" | "serp_move" | "serp_gone"; domain: string; position: number; previousPosition: number | null }, rules: { competitorDomains: string[]; myDomain?: string }): Verdict {
  const mine = Boolean(rules.myDomain) && inDomains(e.domain, [rules.myDomain!]);
  if (mine && (e.kind === "serp_gone" || (e.position > 10 && (e.previousPosition ?? 99) <= 10))) return { severity: "high", reason: "Your domain dropped out of the top 10" };
  if (e.kind !== "serp_gone" && inDomains(e.domain, rules.competitorDomains) && e.position <= 3 && (e.previousPosition === null || e.previousPosition > 3)) {
    return { severity: "high", reason: "Competitor domain entered the top 3" };
  }
  if (e.kind === "serp_new" && e.position <= 10) return { severity: "medium", reason: "New domain in the top 10" };
  if (e.kind === "serp_move") return { severity: "low", reason: `Moved from ${e.previousPosition} to ${e.position}` };
  return { severity: "low", reason: e.kind === "serp_gone" ? "Left the results" : "New result below the top 10" };
}

/** Review. 1 or 2 stars is high, 3 is medium, 4 or 5 is low. */
export function reviewSeverity(rating: number | undefined): Verdict {
  if (rating === undefined) return { severity: "low", reason: "New review with no rating" };
  if (rating <= 2) return { severity: "high", reason: `${rating} star review` };
  if (rating <= 3) return { severity: "medium", reason: "3 star review" };
  return { severity: "low", reason: `${rating} star review` };
}

/** Budget reached, price above the confirmed max, three failures in a row. */
export function systemSeverity(reason: string): Verdict {
  return { severity: "medium", reason };
}
