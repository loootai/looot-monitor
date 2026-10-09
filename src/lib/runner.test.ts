import { describe, expect, it, vi } from "vitest";
import google from "@/demo/fixtures/google.json";
import news from "@/demo/fixtures/news.json";
import appstore from "@/demo/fixtures/appstore_reviews.json";
import { FALLBACK_PRICES } from "./prices";
import { runMonitor, type Runner } from "./runner";
import { MemoryStore } from "./store/demo";
import type { NewMonitor } from "./store/types";
import type { MonitorConfig, MonitorKind } from "./types";

const NOW = new Date("2026-10-08T09:10:00Z");

async function setup(kind: MonitorKind, config: MonitorConfig, over: Partial<NewMonitor> = {}) {
  const store = new MemoryStore();
  const monitor = await store.createMonitor({
    name: "Test monitor",
    kind,
    ownerTag: "mine",
    competitorName: null,
    config,
    schedule: "hourly",
    runHour: 0,
    status: "active",
    maxCostPerRunMicros: 10_000,
    monthlyCapMicros: 100_000,
    confirmedAt: "2026-10-01T00:00:00.000Z",
    nextRunAt: null,
    ...over,
  });
  return { store, monitor };
}

const ok = (result: unknown, cost = 0.001) => ({ runId: "run_x", status: "completed", result, actualCost: cost });
const looot = (impl: Runner["runAndWait"]) => ({ runAndWait: vi.fn(impl) });

describe("runMonitor guards", () => {
  it("refuses with blocked_price when the live price is above the confirmed max, and calls nothing", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] }, { maxCostPerRunMicros: 1000 });
    const client = looot(async () => ok(news));
    const out = await runMonitor({ store, looot: client, prices: { ...FALLBACK_PRICES, "serper-news": 1500 }, now: NOW }, monitor, { trigger: "schedule" });
    expect(out.status).toBe("blocked_price");
    expect(client.runAndWait).toHaveBeenCalledTimes(0);
    const runs = await store.listRuns({ monitorId: monitor.id });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "blocked_price", actualCostMicros: 0 });
    const alerts = await store.listAlerts({ monitorId: monitor.id });
    expect(alerts[0]).toMatchObject({ kind: "system", severity: "medium" });
  });

  it("refuses with blocked_price when the live price of a needed endpoint could not be read, and calls nothing", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] }, { maxCostPerRunMicros: 1000 });
    const client = looot(async () => ok(news));
    const out = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, unpriced: ["serper-news"], now: NOW }, monitor, { trigger: "schedule" });
    expect(out.status).toBe("blocked_price");
    expect(client.runAndWait).toHaveBeenCalledTimes(0);
    expect((await store.listAlerts({ monitorId: monitor.id }))[0].title).toContain("the live price could not be read");
  });

  it("an unread price for an endpoint the monitor does not use does not block it", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] }, { maxCostPerRunMicros: 1000 });
    const client = looot(async () => ok(news));
    const out = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, unpriced: ["serper-reviews"], now: NOW }, monitor, { trigger: "schedule" });
    expect(out.status).toBe("ran");
    expect(client.runAndWait).toHaveBeenCalledTimes(1);
  });

  it("refuses with blocked_budget when month spend plus the max is above the cap, calls nothing and pauses the monitor", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] }, { maxCostPerRunMicros: 1000, monthlyCapMicros: 5000 });
    await store.insertRun({ monitorId: monitor.id, source: "news", trigger: "schedule", slot: "2026-10-03T00:00:00.000Z", idempotencyKey: "earlier", endpointId: "serper-news", loootRunId: "r", status: "completed", quotedMicros: 1000, actualCostMicros: 4500, newItems: 0, errorCode: null, errorMessage: null, startedAt: "2026-10-03T00:00:00.000Z", finishedAt: null });
    const client = looot(async () => ok(news));
    const out = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: NOW }, monitor, { trigger: "schedule" });
    expect(out.status).toBe("blocked_budget");
    expect(client.runAndWait).toHaveBeenCalledTimes(0);
    expect((await store.getMonitor(monitor.id))?.status).toBe("paused_budget");
    expect((await store.listRuns({ monitorId: monitor.id }))[0].status).toBe("blocked_budget");
    expect((await store.listAlerts({ monitorId: monitor.id }))[0].title).toContain("reached its $0.0050 cap. Paused until Nov 1.");
  });

  it("spend from last month does not count against this month's cap", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] }, { maxCostPerRunMicros: 1000, monthlyCapMicros: 5000 });
    await store.insertRun({ monitorId: monitor.id, source: "news", trigger: "schedule", slot: "2026-09-30T23:00:00.000Z", idempotencyKey: "sept", endpointId: "serper-news", loootRunId: "r", status: "completed", quotedMicros: 1000, actualCostMicros: 4500, newItems: 0, errorCode: null, errorMessage: null, startedAt: "2026-09-30T23:00:00.000Z", finishedAt: null });
    const client = looot(async () => ok(news));
    expect((await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: NOW }, monitor, { trigger: "schedule" })).status).toBe("ran");
  });

  it("the workspace cap applies across monitors", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] }, { maxCostPerRunMicros: 1000 });
    await store.saveSettings({ workspaceCapMicros: 500 });
    const client = looot(async () => ok(news));
    const out = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: NOW }, monitor, { trigger: "schedule" });
    expect(out.status).toBe("blocked_budget");
    expect(client.runAndWait).toHaveBeenCalledTimes(0);
    expect((await store.getMonitor(monitor.id))?.status).toBe("active");
  });
});

describe("runMonitor idempotency", () => {
  it("two cron ticks in one slot send the same key, and the second writes no second row", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] });
    const client = looot(async () => ok(news));
    const deps = { store, looot: client, prices: FALLBACK_PRICES };
    // Both ticks start from the same monitor row, as two overlapping cron calls would.
    const [a, b] = await Promise.all([
      runMonitor({ ...deps, now: new Date("2026-10-08T09:01:00Z") }, monitor, { trigger: "schedule" }),
      runMonitor({ ...deps, now: new Date("2026-10-08T09:40:00Z") }, monitor, { trigger: "schedule" }),
    ]);
    const keys = client.runAndWait.mock.calls.map((c) => c[2]);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(`mon:${monitor.id}:news:2026-10-08T09:00:00.000Z`);
    expect(await store.listRuns({ monitorId: monitor.id })).toHaveLength(1);
    expect(a.newAlerts + b.newAlerts).toBe(2);
  });

  it("a later tick for a slot that already ran makes no call at all", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] });
    const client = looot(async () => ok(news));
    await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: NOW }, monitor, { trigger: "schedule" });
    const again = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: new Date("2026-10-08T09:55:00Z") }, monitor, { trigger: "schedule" });
    expect(again.status).toBe("duplicate");
    expect(client.runAndWait).toHaveBeenCalledTimes(1);
  });

  it("the store refuses a second row with the same idempotency key", async () => {
    const store = new MemoryStore();
    const row = { monitorId: "m", source: "news" as const, trigger: "schedule" as const, slot: "s", idempotencyKey: "same", endpointId: "serper-news", loootRunId: null, status: "completed" as const, quotedMicros: 0, actualCostMicros: 0, newItems: 0, errorCode: null, errorMessage: null, startedAt: "2026-10-08T09:00:00.000Z", finishedAt: null };
    expect(await store.insertRun(row)).not.toBeNull();
    expect(await store.insertRun(row)).toBeNull();
  });
});

describe("runMonitor flows", () => {
  it("mention: records the actual cost, writes one alert per new item, and nothing the second time", async () => {
    const { store, monitor } = await setup("mention", { query: '"Tallyroom"', sources: ["news"] });
    const client = looot(async () => ok(news, 0.001));
    const first = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: NOW }, monitor, { trigger: "schedule" });
    expect(first).toMatchObject({ status: "ran", costMicros: 1000, newAlerts: 2 });
    expect(await store.spentSince("2026-10-01T00:00:00.000Z", monitor.id)).toBe(1000);
    const next = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: new Date("2026-10-08T10:05:00Z") }, (await store.getMonitor(monitor.id))!, { trigger: "schedule" });
    expect(next.newAlerts).toBe(0);
    expect((await store.getMonitor(monitor.id))?.nextRunAt).toBe("2026-10-08T11:00:00.000Z");
  });

  it("mention: -exclude drops matching items", async () => {
    const { store, monitor } = await setup("mention", { query: '"Tallyroom" -iPad', sources: ["news"] });
    const out = await runMonitor({ store, looot: looot(async () => ok(news)), prices: FALLBACK_PRICES, now: NOW }, monitor, { trigger: "schedule" });
    expect(out.newAlerts).toBe(1);
  });

  it("a failed looot run costs nothing and keeps its error code", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] });
    const client = looot(async () => ({ runId: "run_f", status: "failed", actualCost: 0.001, error: { code: "provider_error", message: "upstream 500" } }));
    const out = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: NOW }, monitor, { trigger: "schedule" });
    expect(out.costMicros).toBe(0);
    expect((await store.listRuns({ monitorId: monitor.id }))[0]).toMatchObject({ status: "failed", actualCostMicros: 0, errorCode: "provider_error", errorMessage: "upstream 500" });
    expect((await store.getMonitor(monitor.id))?.consecutiveFailures).toBe(1);
  });

  it("three failed runs in a row mark the monitor failing and raise one system alert", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] });
    const client = looot(async () => {
      throw Object.assign(new Error("timeout"), { code: "provider_timeout" });
    });
    for (const hour of ["09", "10", "11"]) await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: new Date(`2026-10-08T${hour}:05:00Z`) }, (await store.getMonitor(monitor.id))!, { trigger: "schedule" });
    expect(await store.getMonitor(monitor.id)).toMatchObject({ status: "failing", consecutiveFailures: 3, lastErrorCode: "provider_timeout" });
    expect((await store.listAlerts({ monitorId: monitor.id })).filter((a) => a.kind === "system")).toHaveLength(1);
  });

  it("page: the first run stores a baseline with no alert, a change gives a diff alert, the same page gives nothing", async () => {
    const { store, monitor } = await setup("page", { url: "https://ledgerly.example/pricing", reader: "jina-reader", watchFor: [], ignore: [] });
    let body = "# Pricing\nStudio: $29 /mo\nUnlimited clients";
    const client = looot(async () => ok({ data: { content: body, title: "Pricing" } }, 0.0002));
    const at = (h: string) => new Date(`2026-10-08T${h}:05:00Z`);
    const get = async () => (await store.getMonitor(monitor.id))!;
    expect((await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: at("09") }, await get(), { trigger: "schedule" })).newAlerts).toBe(0);
    expect(await store.listSnapshots(monitor.id)).toHaveLength(1);
    expect((await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: at("10") }, await get(), { trigger: "schedule" })).newAlerts).toBe(0);
    expect(await store.listSnapshots(monitor.id)).toHaveLength(1);
    body = "# Pricing\nStudio: $35 /mo\nUnlimited clients";
    const changed = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: at("11") }, await get(), { trigger: "schedule" });
    expect(changed.newAlerts).toBe(1);
    const alert = (await store.listAlerts({ monitorId: monitor.id }))[0];
    expect(alert).toMatchObject({ kind: "page_change", severity: "high", severityReason: "Price changed: $29 → $35", payload: { added: 1, removed: 1 } });
    expect(await store.listSnapshots(monitor.id)).toHaveLength(2);
    expect(client.runAndWait.mock.calls[0][1]).toEqual({ url: "https://ledgerly.example/pricing" });
  });

  it("page: the screenshot is taken only when a change is found", async () => {
    const { store, monitor } = await setup("page", { url: "https://ledgerly.example/pricing", reader: "jina-reader", screenshotOnChange: true });
    let body = "one";
    const client = looot(async (endpointId) => (endpointId === "context-dev-web-screenshot" ? ok({ screenshotUrl: "https://img.example/s.png" }, 0.0025) : ok({ data: { content: body } }, 0.0002)));
    const get = async () => (await store.getMonitor(monitor.id))!;
    await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: new Date("2026-10-08T09:05:00Z") }, await get(), { trigger: "schedule" });
    expect(client.runAndWait).toHaveBeenCalledTimes(1);
    body = "one\ntwo";
    const out = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: new Date("2026-10-08T10:05:00Z") }, await get(), { trigger: "schedule" });
    expect(client.runAndWait).toHaveBeenCalledTimes(3);
    expect(out.costMicros).toBe(2700);
    expect((await store.listSnapshots(monitor.id))[0].screenshotUrl).toBe("https://img.example/s.png");
  });

  it("serp: the first run is a baseline, then a competitor entering the top 3 is high", async () => {
    const { store, monitor } = await setup("serp", { query: "Tallyroom alternatives", depth: 10, myDomain: "tallyroom.example", competitorDomains: ["paperkite.example"] });
    const baseline = { organic: google.organic.filter((r) => !String(r.link ?? "").includes("paperkite")) };
    const get = async () => (await store.getMonitor(monitor.id))!;
    const first = await runMonitor({ store, looot: looot(async () => ok(baseline)), prices: FALLBACK_PRICES, now: new Date("2026-10-07T08:05:00Z") }, await get(), { trigger: "schedule" });
    expect(first.newAlerts).toBe(0);
    const second = await runMonitor({ store, looot: looot(async () => ok(google)), prices: FALLBACK_PRICES, now: new Date("2026-10-08T08:05:00Z") }, await get(), { trigger: "schedule" });
    expect(second.newAlerts).toBe(1);
    const alert = (await store.listAlerts({ monitorId: monitor.id }))[0];
    expect(alert).toMatchObject({ kind: "serp_new", severity: "high", severityReason: "Competitor domain entered the top 3", payload: { position: 3 } });
    expect(await store.listSerp(monitor.id)).toHaveLength(2);
  });

  it("reviews: one alert per review, with severity from the stars", async () => {
    const { store, monitor } = await setup("reviews", { platform: "appstore", productId: "1594820371" });
    const client = looot(async () => ok(appstore, 0.004));
    const out = await runMonitor({ store, looot: client, prices: FALLBACK_PRICES, now: NOW }, monitor, { trigger: "manual", confirmId: "c0ffee" });
    expect(out).toMatchObject({ costMicros: 4000, newAlerts: 2 });
    expect(client.runAndWait.mock.calls[0][2]).toBe(`man:${monitor.id}:appstore_reviews:c0ffee`);
    expect((await store.listAlerts({ monitorId: monitor.id })).map((a) => a.severity).sort()).toEqual(["low", "medium"]);
  });

  it("demo runs are marked demo and cost nothing", async () => {
    const { store, monitor } = await setup("mention", { query: "Tallyroom", sources: ["news"] });
    const out = await runMonitor({ store, looot: looot(async () => ok(news, 0.001)), prices: FALLBACK_PRICES, now: NOW, demo: true }, monitor, { trigger: "manual", confirmId: "d1" });
    expect(out.costMicros).toBe(0);
    expect((await store.listRuns({ monitorId: monitor.id }))[0].status).toBe("demo");
  });
});
