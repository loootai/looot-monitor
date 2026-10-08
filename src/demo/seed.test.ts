import { describe, expect, it } from "vitest";
import { DEMO_NOW } from "@/lib/clock";
import { renderDigest } from "@/lib/digest";
import { FALLBACK_PRICES } from "@/lib/prices";
import { buildQuote } from "@/lib/quote";
import { ledgerCsv, summarizeSpend } from "@/lib/spend";
import { MemoryStore } from "@/lib/store/demo";
import { runMonitor } from "@/lib/runner";
import { fixtureRunner } from "./fixtureRunner";
import { buildSeed } from "./seed";

const seed = buildSeed();
const count = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

describe("demo seed", () => {
  it("is the same on every call", () => {
    expect(JSON.stringify(buildSeed())).toBe(JSON.stringify(seed));
  });
  it("has ten monitors with the statuses the spec lists", () => {
    expect(seed.monitors).toHaveLength(10);
    expect(seed.monitors.find((m) => m.id === "mon-09")).toMatchObject({ status: "paused_budget", nextRunAt: "2026-11-01T00:00:00.000Z" });
    expect(seed.monitors.find((m) => m.id === "mon-10")).toMatchObject({ status: "failing", consecutiveFailures: 3, lastErrorCode: "provider_error" });
    expect(count(seed.monitors, (m) => m.status === "active")).toBe(8);
  });
  it("has 64 alerts: 7 high, 19 medium, 38 low", () => {
    expect(seed.alerts).toHaveLength(64);
    expect([count(seed.alerts, (a) => a.severity === "high"), count(seed.alerts, (a) => a.severity === "medium"), count(seed.alerts, (a) => a.severity === "low")]).toEqual([7, 19, 38]);
  });
  it("has 41 open, 5 snoozed, 18 done and 23 unread", () => {
    expect([count(seed.alerts, (a) => a.state === "open"), count(seed.alerts, (a) => a.state === "snoozed"), count(seed.alerts, (a) => a.state === "done")]).toEqual([41, 5, 18]);
    expect(count(seed.alerts, (a) => !a.readAt)).toBe(23);
  });
  it("fingerprints are unique per monitor", () => {
    expect(new Set(seed.alerts.map((a) => `${a.monitorId}|${a.fingerprint}`)).size).toBe(64);
  });
  it("the Oct 7 Ledgerly alert carries both prices and +6 / -4", () => {
    const a = seed.alerts.find((x) => x.monitorId === "mon-02" && x.createdAt === "2026-10-07T14:00:00.000Z")!;
    expect(a).toMatchObject({ severity: "high", severityReason: "Price changed: $29 → $35", state: "open", payload: { added: 6, removed: 4 } });
    expect(a.payload.priceChanges?.map((p) => `${p.before} → ${p.after}`)).toEqual(["$29 → $35", "$79 → $89"]);
    expect(a.runId).not.toBeNull();
  });
  it("the other alerts the screenshots show are there with the right reason", () => {
    const by = (title: string) => seed.alerts.find((a) => a.title.includes(title))!;
    expect(by("Tallyroom outage")).toMatchObject({ severity: "high", severityReason: "Matched escalation word: outage" });
    expect(by("paperkite.example/compare/tallyroom enters position 3")).toMatchObject({ severity: "high", severityReason: "Competitor domain entered the top 3", createdAt: "2026-10-05T08:00:00.000Z" });
    expect(by("Recurring invoices stopped sending")).toMatchObject({ severity: "high", payload: { rating: 1 } });
    expect(by("Moved our studio from Ledgerly")).toMatchObject({ severity: "medium", payload: { engagement: 214 } });
    expect(by("Stripe Tax support")).toMatchObject({ severity: "medium", payload: { added: 9, removed: 0 } });
    expect(by("Ledgerly on X reached its $0.10 cap. Paused until Nov 1.")).toMatchObject({ severity: "medium", createdAt: "2026-10-06T13:00:00.000Z" });
  });
  it("has the snapshots the spec lists", () => {
    expect(["mon-02", "mon-03", "mon-04"].map((id) => count(seed.snapshots, (s) => s.monitorId === id))).toEqual([6, 3, 11]);
  });
  it("keeps 30 days of Google results per monitor", () => {
    expect(count(seed.serp, (s) => s.monitorId === "mon-05")).toBe(30);
    expect(seed.serp.find((s) => s.monitorId === "mon-05")!.rows).toHaveLength(20);
    expect(seed.serp.find((s) => s.monitorId === "mon-06")!.rows).toHaveLength(10);
  });
  it("run keys are unique and a monitor never passes its cap in a month", () => {
    expect(new Set(seed.runs.map((r) => r.idempotencyKey)).size).toBe(seed.runs.length);
    for (const m of seed.monitors) {
      for (const month of ["2026-09", "2026-10"]) {
        const spent = seed.runs.filter((r) => r.monitorId === m.id && r.startedAt.startsWith(month)).reduce((n, r) => n + r.actualCostMicros, 0);
        expect(spent).toBeLessThanOrEqual(m.monthlyCapMicros);
      }
    }
  });
  it("per-run costs match the quote for every monitor", () => {
    const perRun = Object.fromEntries(seed.monitors.map((m) => [m.id, buildQuote(m.kind, m.config, m.schedule, FALLBACK_PRICES, DEMO_NOW).perRunMicros]));
    expect(perRun).toMatchObject({ "mon-01": 5630, "mon-02": 200, "mon-05": 1000, "mon-07": 2880, "mon-08": 4000, "mon-09": 750, "mon-10": 1000 });
  });
});

describe("spend over the seed", () => {
  const perRunMicros = Object.fromEntries(seed.monitors.map((m) => [m.id, buildQuote(m.kind, m.config, m.schedule, FALLBACK_PRICES, DEMO_NOW).perRunMicros]));
  const s = summarizeSpend({ runs: seed.runs, monitors: seed.monitors, alerts: seed.alerts, now: new Date(DEMO_NOW), days: 30, prices: FALLBACK_PRICES, perRunMicros });
  const sum = seed.runs.reduce((n, r) => n + r.actualCostMicros, 0);

  it("the total is the sum of actual cost over every run", () => {
    expect(s.totalMicros).toBe(sum);
    expect(sum).toBeGreaterThan(0);
  });
  it("the by-monitor, by-endpoint and daily tables each add up to the same total", () => {
    expect(s.byMonitor.reduce((n, m) => n + m.spendMicros, 0)).toBe(sum);
    expect(s.byEndpoint.reduce((n, e) => n + e.spendMicros, 0)).toBe(sum);
    expect(s.daily.reduce((n, d) => n + d.total, 0)).toBe(sum);
  });
  it("month spend is October only and the projection is at least that", () => {
    expect(s.monthMicros).toBe(seed.runs.filter((r) => r.startedAt >= "2026-10-01").reduce((n, r) => n + r.actualCostMicros, 0));
    expect(s.projectedMicros).toBeGreaterThanOrEqual(s.monthMicros);
  });
  it("failed calls are counted and cost nothing", () => {
    expect(s.byEndpoint.find((e) => e.endpointId === "serper-reviews")).toMatchObject({ calls: 4, failed: 3, spendMicros: 1000 });
  });
  it("the ledger exports as CSV", () => {
    const csv = ledgerCsv(seed.runs.slice(0, 2), { "mon-02": "Ledgerly pricing page" }).split("\n");
    expect(csv[0]).toBe("time,monitor,source,endpoint,looot_run_id,status,cost_usd,error_code");
    expect(csv).toHaveLength(3);
  });
});

describe("digest over the seed", () => {
  const names = Object.fromEntries(seed.monitors.map((m) => [m.id, m.name]));
  const weekly = renderDigest(seed.alerts, { period: "weekly", from: "2026-10-01T09:00:00.000Z", to: DEMO_NOW, severities: ["high", "medium", "low"], monitorNames: names, spendMicros: 310_000, changes: { [seed.alerts.find((a) => a.monitorId === "mon-02")!.id]: { removed: ["Studio: $29 /mo"], added: ["Studio: $35 /mo"] } } });

  it("the subject carries the counts and the period", () => {
    const inRange = seed.alerts.filter((a) => a.createdAt >= "2026-10-01T09:00:00.000Z" && a.createdAt < DEMO_NOW);
    const high = count(inRange, (a) => a.severity === "high");
    expect(weekly.counts.high).toBe(high);
    expect(weekly.total).toBe(inRange.length);
    expect(weekly.subject).toBe(`looot-monitor, ${high} high and ${inRange.length - high} other alerts, Oct 1 to Oct 8`);
  });
  it("the HTML is a full document with inline styles, tables and no script", () => {
    expect(weekly.html.startsWith("<!doctype html>")).toBe(true);
    expect(weekly.html).not.toMatch(/<script|<style|<link|class=/i);
    expect(weekly.html).toContain('role="presentation"');
    expect(weekly.html).toContain("This digest cost $0.31 in checks");
    expect(weekly.html).toContain("- Studio: $29 /mo");
    expect(weekly.html).toMatch(/and \d+ more/);
  });
  it("escapes what it prints", () => {
    const d = renderDigest([{ ...seed.alerts[0], title: '<img src=x onerror="1">', severity: "high", createdAt: "2026-10-05T00:00:00.000Z" }], { period: "daily", from: "2026-10-04T00:00:00.000Z", to: DEMO_NOW, severities: ["high"], monitorNames: names, spendMicros: 0 });
    expect(d.html).not.toContain("<img");
    expect(d.html).toContain("&lt;img");
  });
  it("has a plain text version", () => {
    expect(weekly.text).toContain("HIGH");
    expect(weekly.text).toContain("This digest cost $0.31 in checks");
  });
  it("says so when the period is empty", () => {
    const d = renderDigest(seed.alerts, { period: "weekly", from: "2026-08-01T00:00:00.000Z", to: "2026-08-08T00:00:00.000Z", severities: ["high", "medium", "low"], monitorNames: names, spendMicros: 0 });
    expect(d.total).toBe(0);
    expect(d.html).toContain("No alerts between Aug 1 and Aug 8. Nothing would be sent.");
  });
  it("filters by severity and by monitor", () => {
    const d = renderDigest(seed.alerts, { period: "weekly", from: "2026-10-01T09:00:00.000Z", to: DEMO_NOW, severities: ["high"], monitorIds: ["mon-02"], monitorNames: names, spendMicros: 0 });
    expect(d.total).toBe(1);
  });
});

describe("Run now in demo mode", () => {
  it("plays the fixture, makes new alerts once, costs nothing and never changes seeded spend", async () => {
    const store = new MemoryStore(buildSeed());
    const before = await store.spentSince("2026-09-01T00:00:00.000Z");
    const monitor = (await store.getMonitor("mon-01"))!;
    const deps = { store, looot: fixtureRunner(store, monitor.id), prices: FALLBACK_PRICES, now: new Date(DEMO_NOW), demo: true };
    const first = await runMonitor(deps, monitor, { trigger: "manual", confirmId: "a" });
    expect(first.newAlerts).toBeGreaterThan(0);
    expect(first.calls.every((c) => c.status === "demo")).toBe(true);
    const second = await runMonitor(deps, (await store.getMonitor("mon-01"))!, { trigger: "manual", confirmId: "b" });
    expect(second.newAlerts).toBe(0);
    expect(await store.spentSince("2026-09-01T00:00:00.000Z")).toBe(before);
  });
  it("a page monitor gets a one line diff", async () => {
    const store = new MemoryStore(buildSeed());
    const monitor = (await store.getMonitor("mon-03"))!;
    const out = await runMonitor({ store, looot: fixtureRunner(store, monitor.id), prices: FALLBACK_PRICES, now: new Date(DEMO_NOW), demo: true }, monitor, { trigger: "manual", confirmId: "a" });
    expect(out.newAlerts).toBe(1);
    expect((await store.listAlerts({ monitorId: "mon-03", limit: 1 }))[0].payload).toMatchObject({ added: 1, removed: 0 });
  });
});
