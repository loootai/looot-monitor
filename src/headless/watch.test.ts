import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoootClient } from "@/lib/looot";
import { FALLBACK_PRICES } from "@/lib/prices";
import { renderPlan, renderWatchDigest } from "./markdown";
import { planWatch, runWatch, type WatchState } from "./watch";
import { parseWatchlist, WatchlistError } from "./watchlist";

const YAML = `
name: Test market
maxSpendPerRunUsd: 0.01
monthlyCapUsd: 1
groups:
  - name: Aggregators
    pages:
      - name: Acme pricing
        url: https://acme.example/pricing
      - name: Acme changelog
        url: https://acme.example/changelog
        watchFor: ["MCP"]
  - name: Search
    pages:
      - name: Bolt pricing
        url: https://bolt.example/pricing
`;

const PRICING_V1 = "# Pricing\n\nStarter $149 / month\n\nGrowth $349 / month\n\n2,000 credits";
const PRICING_V2 = "# Pricing\n\nStarter $185 / month\n\nGrowth $349 / month\n\n2,000 credits";
const CHANGELOG_V1 = "# Changelog\n\n## September 30\n\nFaster exports";
const CHANGELOG_V2 = "# Changelog\n\n## October 9\n\nNew MCP server for agents\n\n## September 30\n\nFaster exports";

interface Call {
  method: string;
  url: string;
  auth: string | null;
  body: { endpointId: string; input: { url: string; includeMarkdown?: boolean }; idempotencyKey: string } | null;
}

/** A fake looot API. `pages` maps a page URL to the markdown the reader returns, or to an error. */
function fakeLooot(pages: Record<string, string | { fail: string }>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init?.method ?? "GET", url, auth: headers.get("authorization"), body });
    const page = pages[body?.input?.url as string];
    if (page === undefined) return new Response(JSON.stringify({ error: { code: "not_found", message: "no such page" } }), { status: 404 });
    if (typeof page !== "string") return new Response(JSON.stringify({ runId: `run_${calls.length}`, status: "failed", actualCost: 0, error: { code: page.fail, message: "The provider failed" } }), { status: 200 });
    return new Response(JSON.stringify({ runId: `run_${calls.length}`, status: "completed", actualCost: 0.002, result: { text: page, markdown: page, metadata: { title: "A page" } } }), { status: 200 });
  });
  const looot = new LoootClient({ token: "test-token", baseUrl: "https://api.test", fetch: fetchMock as unknown as typeof fetch, sleep: async () => {} });
  return { looot, calls, posts: () => calls.filter((c) => c.method === "POST") };
}

const DAY1 = new Date("2026-10-08T06:10:00Z");
const DAY2 = new Date("2026-10-09T06:10:00Z");
const V1 = { "https://acme.example/pricing": PRICING_V1, "https://acme.example/changelog": CHANGELOG_V1, "https://bolt.example/pricing": PRICING_V1 };
const list = () => parseWatchlist(YAML);
const roundTrip = (s: WatchState): WatchState => JSON.parse(JSON.stringify(s));

describe("parseWatchlist", () => {
  it("reads groups, pages and caps, and defaults to the serper-webpage reader", () => {
    const l = list();
    expect(l.name).toBe("Test market");
    expect(l.maxSpendPerRunMicros).toBe(10_000);
    expect(l.monthlyCapMicros).toBe(1_000_000);
    expect(l.pages.map((p) => [p.group, p.name, p.reader])).toEqual([
      ["Aggregators", "Acme pricing", "serper-webpage"],
      ["Aggregators", "Acme changelog", "serper-webpage"],
      ["Search", "Bolt pricing", "serper-webpage"],
    ]);
    expect(new Set(l.pages.map((p) => p.id)).size).toBe(3);
  });

  it("gives a page the same id on every parse, so state survives a reorder", () => {
    expect(list().pages[0].id).toBe(list().pages[0].id);
  });

  it("refuses a list with no run cap", () => {
    expect(() => parseWatchlist(YAML.replace("maxSpendPerRunUsd: 0.01\n", ""))).toThrow(WatchlistError);
  });

  it("refuses a URL that is not http or https, and a URL listed twice", () => {
    expect(() => parseWatchlist(YAML.replace("https://bolt.example/pricing", "ftp://bolt.example/pricing"))).toThrow(/http/);
    expect(() => parseWatchlist(YAML.replace("https://bolt.example/pricing", "https://acme.example/pricing"))).toThrow(/twice/);
  });
});

describe("planWatch", () => {
  it("quotes every page at the reader's price and sums the run", () => {
    const plan = planWatch(list(), FALLBACK_PRICES);
    expect(plan.lines.map((l) => [l.endpointId, l.priceMicros, l.included])).toEqual([
      ["serper-webpage", 2000, true],
      ["serper-webpage", 2000, true],
      ["serper-webpage", 2000, true],
    ]);
    expect(plan.totalMicros).toBe(6000);
    expect(plan.plannedMicros).toBe(6000);
  });

  it("leaves out the pages that do not fit under the run cap, in list order", () => {
    const l = { ...list(), maxSpendPerRunMicros: 4000 };
    const plan = planWatch(l, FALLBACK_PRICES);
    expect(plan.lines.map((x) => x.included)).toEqual([true, true, false]);
    expect(plan.plannedMicros).toBe(4000);
    expect(plan.totalMicros).toBe(6000);
  });

  it("prints the plan with the page count and the list-price total", () => {
    const text = renderPlan(list(), planWatch(list(), FALLBACK_PRICES), { priceNote: "list prices dated 2026-10-08" });
    expect(text).toContain("3 pages");
    expect(text).toContain("$0.0060");
    expect(text).toContain("Acme changelog");
    expect(text).toContain("$0.18");
  });
});

describe("runWatch", () => {
  beforeEach(() => vi.resetModules());

  it("first run stores a baseline per page, makes one paid call per page and reports no change", async () => {
    const api = fakeLooot(V1);
    const { state, report } = await runWatch({ list: list(), state: null, looot: api.looot, prices: FALLBACK_PRICES, now: DAY1 });
    expect(api.posts()).toHaveLength(3);
    const first = api.posts()[0];
    expect(first.url).toBe("https://api.test/v1/runs?wait=30");
    expect(first.auth).toBe("Bearer test-token");
    expect(first.body).toMatchObject({ endpointId: "serper-webpage", input: { url: "https://acme.example/pricing", includeMarkdown: true } });
    expect(new Set(api.posts().map((c) => c.body?.idempotencyKey)).size).toBe(3);
    expect(report.pages.map((p) => p.status)).toEqual(["baseline", "baseline", "baseline"]);
    expect(report.spentMicros).toBe(6000);
    expect(state.snapshots).toHaveLength(3);
    expect(state.alerts).toHaveLength(0);
  });

  it("second run reports the old and the new price, and the new changelog entry", async () => {
    const day1 = await runWatch({ list: list(), state: null, looot: fakeLooot(V1).looot, prices: FALLBACK_PRICES, now: DAY1 });
    const api = fakeLooot({ ...V1, "https://acme.example/pricing": PRICING_V2, "https://acme.example/changelog": CHANGELOG_V2 });
    const { state, report } = await runWatch({ list: list(), state: roundTrip(day1.state), looot: api.looot, prices: FALLBACK_PRICES, now: DAY2 });
    expect(report.pages.map((p) => p.status)).toEqual(["changed", "changed", "unchanged"]);
    const pricing = report.pages[0];
    expect(pricing.severity).toBe("high");
    expect(pricing.priceChanges).toEqual([{ label: "Starter", before: "$149", after: "$185", pct: 24.2 }]);
    expect(pricing.edits).toEqual([{ before: "Starter $149 / month", after: "Starter $185 / month" }]);
    const changelog = report.pages[1];
    expect(changelog.severity).toBe("high");
    expect(changelog.added).toEqual(["## October 9", "New MCP server for agents"]);
    // One snapshot per page is kept, the newest.
    expect(state.snapshots).toHaveLength(3);
    expect(state.snapshots.find((s) => s.monitorId === pricing.page.id)?.content).toContain("$185");

    const md = renderWatchDigest(report);
    expect(md).toContain("# Test market, 2026-10-09");
    expect(md).toContain("3 pages checked, 2 changed");
    expect(md).toContain("| Starter | $149 | $185 | +24.2% |");
    expect(md).toContain("- Starter $149 / month\n+ Starter $185 / month");
    expect(md).toContain("+ New MCP server for agents");
    expect(md).toContain("https://acme.example/changelog");
    expect(md).toContain("Bolt pricing");
  });

  it("a second run in the same day makes no call and charges nothing", async () => {
    const day1 = await runWatch({ list: list(), state: null, looot: fakeLooot(V1).looot, prices: FALLBACK_PRICES, now: DAY1 });
    const api = fakeLooot(V1);
    const again = await runWatch({ list: list(), state: roundTrip(day1.state), looot: api.looot, prices: FALLBACK_PRICES, now: new Date("2026-10-08T18:00:00Z") });
    expect(api.calls).toHaveLength(0);
    expect(again.report.pages.map((p) => p.status)).toEqual(["already_ran", "already_ran", "already_ran"]);
    expect(again.report.spentMicros).toBe(0);
  });

  it("stops at the run cap: pages past it are not called and are named in the digest", async () => {
    const api = fakeLooot(V1);
    const { report } = await runWatch({ list: { ...list(), maxSpendPerRunMicros: 2000 }, state: null, looot: api.looot, prices: FALLBACK_PRICES, now: DAY1 });
    expect(api.posts()).toHaveLength(1);
    expect(report.pages.map((p) => p.status)).toEqual(["baseline", "skipped_run_cap", "skipped_run_cap"]);
    expect(renderWatchDigest(report)).toContain("Not run");
  });

  it("stops at the monthly cap: no call once the month's spend plus one page would pass it", async () => {
    const day1 = await runWatch({ list: list(), state: null, looot: fakeLooot(V1).looot, prices: FALLBACK_PRICES, now: DAY1 });
    const api = fakeLooot(V1);
    const { report } = await runWatch({ list: { ...list(), monthlyCapMicros: 7000 }, state: roundTrip(day1.state), looot: api.looot, prices: FALLBACK_PRICES, now: DAY2 });
    expect(api.calls).toHaveLength(0);
    expect(report.pages.map((p) => p.status)).toEqual(["skipped_month_cap", "skipped_month_cap", "skipped_month_cap"]);
    expect(report.monthSpentMicros).toBe(6000);
  });

  it("makes no call for a page whose live price could not be read or is above the max per page", async () => {
    const unread = fakeLooot(V1);
    const a = await runWatch({ list: list(), state: null, looot: unread.looot, prices: FALLBACK_PRICES, unpriced: ["serper-webpage"], now: DAY1 });
    expect(unread.calls).toHaveLength(0);
    expect(a.report.pages.every((p) => p.status === "blocked_price")).toBe(true);

    const dearer = fakeLooot(V1);
    const b = await runWatch({ list: { ...list(), maxSpendPerRunMicros: 100_000 }, state: null, looot: dearer.looot, prices: { ...FALLBACK_PRICES, "serper-webpage": 5000 }, now: DAY1 });
    expect(dearer.calls).toHaveLength(0);
    expect(b.report.pages.every((p) => p.status === "blocked_price")).toBe(true);
  });

  it("a failed looot run costs nothing, is reported with its error code, and the other pages still run", async () => {
    const api = fakeLooot({ ...V1, "https://acme.example/changelog": { fail: "provider_timeout" } });
    const { report } = await runWatch({ list: list(), state: null, looot: api.looot, prices: FALLBACK_PRICES, now: DAY1 });
    expect(report.pages.map((p) => p.status)).toEqual(["baseline", "failed", "baseline"]);
    expect(report.pages[1].error).toBe("provider_timeout");
    expect(report.spentMicros).toBe(4000);
    expect(renderWatchDigest(report)).toContain("provider_timeout");
  });

  it("--force runs again inside the same day with a new idempotency key", async () => {
    const first = fakeLooot(V1);
    const day1 = await runWatch({ list: list(), state: null, looot: first.looot, prices: FALLBACK_PRICES, now: DAY1 });
    const api = fakeLooot({ ...V1, "https://bolt.example/pricing": PRICING_V2 });
    const again = await runWatch({ list: list(), state: roundTrip(day1.state), looot: api.looot, prices: FALLBACK_PRICES, now: new Date("2026-10-08T18:00:00Z"), force: true });
    expect(api.posts()).toHaveLength(3);
    expect(api.posts()[0].body?.idempotencyKey).not.toBe(first.posts()[0].body?.idempotencyKey);
    expect(again.report.pages.map((p) => p.status)).toEqual(["unchanged", "unchanged", "changed"]);
  });

  it("ids stay unique when the state is loaded by a new process", async () => {
    const day1 = await runWatch({ list: list(), state: null, looot: fakeLooot(V1).looot, prices: FALLBACK_PRICES, now: DAY1 });
    vi.resetModules();
    const fresh = await import("./watch");
    const day2 = await fresh.runWatch({ list: list(), state: roundTrip(day1.state), looot: fakeLooot({ ...V1, "https://acme.example/pricing": PRICING_V2 }).looot, prices: FALLBACK_PRICES, now: DAY2 });
    const ids = [...day2.state.runs.map((r) => r.id), ...day2.state.snapshots.map((s) => s.id), ...day2.state.alerts.map((a) => a.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(day2.state.runs).toHaveLength(6);
  });

  it("drops the state of a page that left the list", async () => {
    const day1 = await runWatch({ list: list(), state: null, looot: fakeLooot(V1).looot, prices: FALLBACK_PRICES, now: DAY1 });
    const shorter = parseWatchlist(YAML.replace(/ {2}- name: Search[\s\S]*$/, ""));
    const day2 = await runWatch({ list: shorter, state: roundTrip(day1.state), looot: fakeLooot(V1).looot, prices: FALLBACK_PRICES, now: DAY2 });
    expect(day2.state.monitors).toHaveLength(2);
    expect(day2.state.snapshots).toHaveLength(2);
    // Its spend this month still counts against the monthly cap.
    expect(day2.report.monthSpentMicros).toBe(10_000);
  });

  it("flags a baseline that came back nearly empty, which is what a blocked reader looks like", async () => {
    const api = fakeLooot({ ...V1, "https://bolt.example/pricing": "Just a moment..." });
    const { report } = await runWatch({ list: list(), state: null, looot: api.looot, prices: FALLBACK_PRICES, now: DAY1 });
    expect(report.pages[2].note).toMatch(/16 characters/);
  });

  it("keeps only the first maxChars of a long page, so a long changelog does not bloat the state", async () => {
    const long = `${CHANGELOG_V1}\n${"older entry\n".repeat(1000)}`;
    const api = fakeLooot({ ...V1, "https://acme.example/changelog": long });
    const { state, report } = await runWatch({ list: { ...list(), maxChars: 500 }, state: null, looot: api.looot, prices: FALLBACK_PRICES, now: DAY1 });
    const snap = state.snapshots.find((s) => s.monitorId === report.pages[1].page.id);
    expect(snap?.content.length).toBeLessThanOrEqual(500);
    expect(snap?.content).toContain("Faster exports");
  });
});
