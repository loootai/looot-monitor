import { describe, expect, it } from "vitest";
import { dedupe } from "./dedupe";
import { markTerms, parseQuery, passesExclusions } from "./query";
import { changeLabel, diffSerp } from "./serpDiff";
import { mentionSeverity, pageSeverity, reviewSeverity, serpSeverity, systemSeverity } from "./severity";
import type { Item, SerpRow } from "./types";

const item = (fingerprint: string, publishedAt: string | null = null): Item => ({ fingerprint, title: fingerprint, url: null, domain: null, author: null, snippet: null, publishedAt, extra: {} });
const now = new Date("2026-10-08T09:00:00Z");

describe("dedupe", () => {
  it("drops what the monitor has seen and repeats inside one batch", () => {
    expect(dedupe([item("a"), item("b"), item("b"), item("c")], new Set(["a"]), { firstRun: false, now }).map((i) => i.fingerprint)).toEqual(["b", "c"]);
  });
  it("a first run keeps only the last seven days", () => {
    const out = dedupe([item("old", "2026-09-20T00:00:00Z"), item("new", "2026-10-05T00:00:00Z"), item("undated")], new Set(), { firstRun: true, now });
    expect(out.map((i) => i.fingerprint)).toEqual(["new", "undated"]);
  });
  it("later runs keep old items that are new to the monitor", () => {
    expect(dedupe([item("old", "2026-09-20T00:00:00Z")], new Set(), { firstRun: false, now })).toHaveLength(1);
  });
});

describe("query", () => {
  it("reads quoted phrases, OR and -exclude", () => {
    expect(parseQuery('"Ledgerly" -ledger')).toEqual({ terms: ["Ledgerly"], excluded: ["ledger"] });
    expect(parseQuery("Ledgerly OR @ledgerly")).toEqual({ terms: ["Ledgerly", "@ledgerly"], excluded: [] });
    expect(parseQuery('"design studio" invoicing -"free template"')).toEqual({ terms: ["design studio", "invoicing"], excluded: ["free template"] });
  });
  it("applies exclusions", () => {
    const q = parseQuery('"Ledgerly" -hardware');
    expect(passesExclusions("Ledgerly raises prices", q)).toBe(true);
    expect(passesExclusions("Ledgerly hardware wallet", q)).toBe(false);
  });
  it("marks matched terms", () => {
    expect(markTerms("Moved to Tallyroom today", ["Tallyroom"])).toEqual([{ text: "Moved to ", hit: false }, { text: "Tallyroom", hit: true }, { text: " today", hit: false }]);
  });
});

const row = (position: number, domain: string): SerpRow => ({ position, domain, url: `https://${domain}/`, title: domain });

describe("diffSerp", () => {
  const prev = [row(1, "a.example"), row(2, "b.example"), row(3, "mine.example"), row(4, "c.example"), row(5, "d.example"), row(6, "e.example"), row(7, "rival.example")];
  it("a first run sets the baseline and raises nothing", () => {
    expect(diffSerp([], prev, ["mine.example"]).events).toEqual([]);
  });
  it("a domain entering is serp_new", () => {
    const cur = [row(1, "a.example"), row(2, "b.example"), row(3, "new.example"), row(4, "mine.example"), row(5, "c.example"), row(6, "d.example"), row(7, "e.example")];
    const { events, rows } = diffSerp(prev, cur, ["mine.example", "rival.example"]);
    expect(events.map((e) => [e.kind, e.row.domain])).toEqual([["serp_new", "new.example"], ["serp_gone", "rival.example"]]);
    expect(rows.map((r) => r.change)).toEqual([0, 0, null, -1, -1, -1, -1]);
  });
  it("a tracked domain moving three places is serp_move, an untracked one is not", () => {
    const cur = [row(1, "a.example"), row(2, "b.example"), row(3, "c.example"), row(4, "d.example"), row(5, "e.example"), row(6, "mine.example"), row(7, "rival.example")];
    const { events } = diffSerp(prev, cur, ["mine.example"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "serp_move", previousPosition: 3, row: { position: 6 } });
  });
  it("labels changes in words", () => {
    expect([changeLabel(null), changeLabel(2), changeLabel(-1), changeLabel(0)]).toEqual(["new", "up 2", "down 1", "-"]);
  });
});

describe("severity", () => {
  const rules = { escalationWords: ["outage", "refund", "down"], priorityDomains: ["studiobrief.example"] };
  it("page: price, then watch phrase, then 20% of lines, else low", () => {
    expect(pageSeverity({ priceChanges: [{ label: "Studio", before: "$29", after: "$35", pct: 20.7 }], watchHits: ["x"], changedRatio: 0.9 })).toEqual({ severity: "high", reason: "Price changed: $29 → $35" });
    expect(pageSeverity({ priceChanges: [], watchHits: ["Unlimited clients"], changedRatio: 0.01 }).severity).toBe("high");
    expect(pageSeverity({ priceChanges: [], watchHits: [], changedRatio: 0.2 }).severity).toBe("medium");
    expect(pageSeverity({ priceChanges: [], watchHits: [], changedRatio: 0.19 }).severity).toBe("low");
  });
  it("mention: escalation word, then priority outlet, then engagement, else low", () => {
    expect(mentionSeverity({ title: "Tallyroom outage hits studios", snippet: null, domain: "studiobrief.example", engagement: 500 }, rules)).toEqual({ severity: "high", reason: "Matched escalation word: outage" });
    expect(mentionSeverity({ title: "Tallyroom adds deposits", snippet: null, domain: "studiobrief.example" }, rules).severity).toBe("medium");
    expect(mentionSeverity({ title: "Nice tool", snippet: null, domain: "x.example", engagement: 100 }, rules).severity).toBe("medium");
    expect(mentionSeverity({ title: "Nice tool", snippet: null, domain: "x.example", engagement: 99 }, rules).severity).toBe("low");
  });
  it("an escalation word must be a whole word", () => {
    expect(mentionSeverity({ title: "Download the Tallyroom template", snippet: null, domain: null }, rules).severity).toBe("low");
    expect(mentionSeverity({ title: "Tallyroom is down again", snippet: null, domain: null }, rules).severity).toBe("high");
  });
  it("serp: competitor into the top 3, my domain out of the top 10, new domain in the top 10", () => {
    const r = { competitorDomains: ["paperkite.example"], myDomain: "tallyroom.example" };
    expect(serpSeverity({ kind: "serp_new", domain: "paperkite.example", position: 3, previousPosition: null }, r)).toEqual({ severity: "high", reason: "Competitor domain entered the top 3" });
    expect(serpSeverity({ kind: "serp_gone", domain: "tallyroom.example", position: 9, previousPosition: 9 }, r).severity).toBe("high");
    expect(serpSeverity({ kind: "serp_move", domain: "tallyroom.example", position: 12, previousPosition: 8 }, r).severity).toBe("high");
    expect(serpSeverity({ kind: "serp_new", domain: "other.example", position: 8, previousPosition: null }, r).severity).toBe("medium");
    expect(serpSeverity({ kind: "serp_new", domain: "other.example", position: 15, previousPosition: null }, r).severity).toBe("low");
    expect(serpSeverity({ kind: "serp_move", domain: "tallyroom.example", position: 4, previousPosition: 7 }, r)).toEqual({ severity: "low", reason: "Moved from 7 to 4" });
  });
  it("review: 1 or 2 stars high, 3 medium, 4 or 5 low", () => {
    expect([1, 2, 3, 4, 5].map((n) => reviewSeverity(n).severity)).toEqual(["high", "high", "medium", "low", "low"]);
  });
  it("system alerts are medium", () => {
    expect(systemSeverity("Monthly cap reached")).toEqual({ severity: "medium", reason: "Monthly cap reached" });
  });
});
