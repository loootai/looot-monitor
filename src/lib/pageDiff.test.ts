import { describe, expect, it } from "vitest";
import { LEDGERLY_PRICING } from "@/demo/pages";
import page from "@/demo/fixtures/page.json";
import { collapse, contentHash, diffPages, normalize, pageTitle, pricesIn, summarize, watchHits } from "./pageDiff";
import { parsePage } from "./parse";

describe("normalize", () => {
  it("trims, collapses spaces, drops empty lines and ignored lines", () => {
    const text = normalize(parsePage(page).content, ["cookie", "^last updated"]);
    expect(text.split("\n")).toEqual(["# Ledgerly pricing", "Invoicing and payments for creative teams.", "Studio: $35 /mo", "Up to 25 active clients on Studio", "Team: $89 /mo"]);
  });
  it("a bad pattern is used as plain text", () => {
    expect(normalize("keep\ndrop (this\n", ["(this"])).toBe("keep");
  });
  it("the same text gives the same hash", () => {
    expect(contentHash(normalize("a  b\n\nc"))).toBe(contentHash(normalize("a b\nc\n")));
  });
});

describe("diffPages", () => {
  const before = normalize(LEDGERLY_PRICING[4].content);
  const after = normalize(LEDGERLY_PRICING[5].content);
  const d = diffPages(before, after);

  it("the Ledgerly price change is +6 / -4", () => {
    expect([d.added, d.removed]).toEqual([6, 4]);
    expect(summarize(d)).toBe("+6 lines, -4 lines, 2 prices changed");
  });
  it("finds both price changes with a label and a percent", () => {
    expect(d.priceChanges).toEqual([
      { label: "Studio", before: "$29", after: "$35", pct: 20.7 },
      { label: "Team", before: "$79", after: "$89", pct: 12.7 },
    ]);
  });
  it("marks the changed words inside a paired line", () => {
    const add = d.lines.find((l) => l.type === "add" && l.text.startsWith("Studio:"));
    expect(add && "parts" in add && add.parts?.filter((p) => p.mark).map((p) => p.text)).toEqual(["35"]);
  });
  it("numbers lines on both sides", () => {
    const same = d.lines.filter((l) => l.type === "same");
    expect(same[0]).toMatchObject({ a: 1, b: 1 });
    expect(d.lines.filter((l) => l.type === "add").every((l) => l.type === "add" && l.b > 0)).toBe(true);
  });
  it("reports watch phrases that were added or removed", () => {
    expect(watchHits(d, ["Unlimited clients", "free trial"])).toEqual(["Unlimited clients"]);
  });
  it("builds the alert title from the prices", () => {
    expect(pageTitle("Ledgerly pricing page", d)).toBe("Ledgerly pricing page: Studio $29 → $35, Team $79 → $89");
  });
  it("equal texts give an empty diff", () => {
    const same = diffPages(before, before);
    expect([same.added, same.removed, same.changedRatio]).toEqual([0, 0, 0]);
  });
  it("collapses long unchanged runs", () => {
    const blocks = collapse(d.lines);
    expect(blocks.some((b) => b.kind === "collapsed" && b.lines.length > 0)).toBe(true);
    expect(blocks.flatMap((b) => b.lines)).toHaveLength(d.lines.length);
  });
});

describe("pricesIn", () => {
  it("reads symbols and ISO codes", () => {
    expect(pricesIn("Studio $29 /mo or €27, 300 USD a year, GBP 25")).toEqual(["$29", "€27", "300 USD", "GBP 25"]);
    expect(pricesIn("Trusted by 4,600 studios")).toEqual([]);
  });
});
