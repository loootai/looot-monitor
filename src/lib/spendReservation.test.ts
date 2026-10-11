import { describe, expect, it, vi } from "vitest";
import news from "@/demo/fixtures/news.json";
import { reconcileReservations } from "./reservations";
import { runMonitor, type Runner } from "./runner";
import { MemoryStore } from "./store/demo";
import type { NewMonitor } from "./store/types";

const PRICES = { "serper-news": 1000 };
const T0 = new Date("2026-10-08T09:10:00Z");
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

async function setup(over: Partial<NewMonitor> = {}) {
  const store = new MemoryStore();
  const monitor = await store.createMonitor({
    name: "Alpha",
    kind: "mention",
    ownerTag: "mine",
    competitorName: null,
    config: { query: "Alpha", sources: ["news"] },
    schedule: "hourly",
    runHour: 0,
    status: "active",
    maxCostPerRunMicros: 1000,
    monthlyCapMicros: 1_000_000,
    confirmedAt: "2026-10-01T00:00:00.000Z",
    nextRunAt: null,
    ...over,
  });
  return { store, monitor };
}

type Reply = Awaited<ReturnType<Runner["runAndWait"]>>;
const pending: Reply = { runId: "run_p", status: "pending_provider", result: undefined, actualCost: null };
const done = (cost: number): Reply => ({ runId: "run_p", status: "completed", result: news, actualCost: cost });
const looot = (impl: Runner["runAndWait"]) => ({ runAndWait: vi.fn(impl) });
const day = (s: MemoryStore, at: Date) => s.budgetStatus(at).then((b) => b.daily);

describe("reservations", () => {
  it("a pending run keeps its reservation and is not recorded as failed", async () => {
    const { store, monitor } = await setup();
    await store.saveSettings({ dailyBudgetMicros: 1500 });
    const client = looot(async () => pending);
    const out = await runMonitor({ store, looot: client, prices: PRICES, now: T0 }, monitor, { trigger: "schedule" });
    expect(out.status).toBe("ran");
    expect(await store.listRuns({ monitorId: monitor.id })).toHaveLength(0);
    expect(await day(store, T0)).toMatchObject({ reservedMicros: 1000, spentMicros: 0, remainingMicros: 500 });
    // The held money blocks the next run, so budget is not handed back early.
    const next = await runMonitor({ store, looot: client, prices: PRICES, now: plus(T0, 60) }, (await store.getMonitor(monitor.id))!, { trigger: "schedule" });
    expect(next.status).toBe("blocked_budget");
    expect(client.runAndWait).toHaveBeenCalledTimes(1);
    expect((await store.getMonitor(monitor.id))?.consecutiveFailures).toBe(0);
  });

  it("a pending run asked again with the same key makes no second call", async () => {
    const { store, monitor } = await setup();
    const client = looot(async () => pending);
    const deps = { store, looot: client, prices: PRICES, now: T0 };
    await runMonitor(deps, monitor, { trigger: "manual", confirmId: "same-id" });
    const again = await runMonitor(deps, monitor, { trigger: "manual", confirmId: "same-id" });
    expect(again.status).toBe("duplicate");
    expect(client.runAndWait).toHaveBeenCalledTimes(1);
  });

  it("a failed run releases its reservation", async () => {
    const { store, monitor } = await setup();
    const client = looot(async () => ({ runId: "run_f", status: "failed", actualCost: 0, error: { code: "provider_error", message: "upstream 500" } }));
    await runMonitor({ store, looot: client, prices: PRICES, now: T0 }, monitor, { trigger: "schedule" });
    expect(await day(store, T0)).toMatchObject({ reservedMicros: 0, spentMicros: 0 });
  });

  it("a thrown request releases its reservation", async () => {
    const { store, monitor } = await setup();
    const client = looot(async () => {
      throw new Error("socket hang up");
    });
    await runMonitor({ store, looot: client, prices: PRICES, now: T0 }, monitor, { trigger: "schedule" });
    expect(await day(store, T0)).toMatchObject({ reservedMicros: 0 });
  });

  it("a completed run settles to the real cost", async () => {
    const { store, monitor } = await setup();
    await runMonitor({ store, looot: looot(async () => done(0.0007)), prices: PRICES, now: T0 }, monitor, { trigger: "schedule" });
    expect(await day(store, T0)).toMatchObject({ reservedMicros: 0, spentMicros: 700 });
  });

  it("a late completion settles to the real cost when the reservation is reconciled", async () => {
    const { store, monitor } = await setup();
    await runMonitor({ store, looot: looot(async () => pending), prices: PRICES, now: T0 }, monitor, { trigger: "schedule" });
    const getRun = vi.fn(async () => done(0.0006));
    // Before the soft expiry nothing is asked of looot.
    await reconcileReservations({ store, looot: { getRun }, now: plus(T0, 5) });
    expect(getRun).not.toHaveBeenCalled();
    expect(await day(store, plus(T0, 5))).toMatchObject({ reservedMicros: 1000 });
    await reconcileReservations({ store, looot: { getRun }, now: plus(T0, 20) });
    expect(getRun).toHaveBeenCalledWith("run_p");
    expect(await day(store, plus(T0, 20))).toMatchObject({ reservedMicros: 0, spentMicros: 600 });
    const runs = await store.listRuns({ monitorId: monitor.id });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "completed", actualCostMicros: 600, loootRunId: "run_p" });
  });

  it("an expired reservation whose run failed is released", async () => {
    const { store, monitor } = await setup();
    await runMonitor({ store, looot: looot(async () => pending), prices: PRICES, now: T0 }, monitor, { trigger: "schedule" });
    const getRun = vi.fn(async () => ({ runId: "run_p", status: "failed", error: { code: "provider_error", message: "gave up" } }));
    await reconcileReservations({ store, looot: { getRun }, now: plus(T0, 20) });
    expect(await day(store, plus(T0, 20))).toMatchObject({ reservedMicros: 0, spentMicros: 0 });
  });

  it("an expired reservation whose run is still pending stays reserved until the hard expiry", async () => {
    const { store, monitor } = await setup();
    await runMonitor({ store, looot: looot(async () => pending), prices: PRICES, now: T0 }, monitor, { trigger: "schedule" });
    const getRun = vi.fn(async () => pending);
    await reconcileReservations({ store, looot: { getRun }, now: plus(T0, 120) });
    expect((await day(store, plus(T0, 120))).reservedMicros).toBe(1000);
    await reconcileReservations({ store, looot: { getRun }, now: plus(T0, 25 * 60) });
    expect((await day(store, plus(T0, 25 * 60))).reservedMicros).toBe(0);
  });

  it("an expired reservation that cannot be fetched stays reserved until the hard expiry", async () => {
    const { store, monitor } = await setup();
    await runMonitor({ store, looot: looot(async () => pending), prices: PRICES, now: T0 }, monitor, { trigger: "schedule" });
    const getRun = vi.fn(async () => {
      throw new Error("HTTP 503");
    });
    await reconcileReservations({ store, looot: { getRun }, now: plus(T0, 120) });
    expect((await day(store, plus(T0, 120))).reservedMicros).toBe(1000);
    await reconcileReservations({ store, looot: { getRun }, now: plus(T0, 25 * 60) });
    expect((await day(store, plus(T0, 25 * 60))).reservedMicros).toBe(0);
  });

  it("a crash after the reserve, before any call, is held until the hard expiry", async () => {
    const { store, monitor } = await setup();
    const reply = await store.reserveBudget({ monitorId: monitor.id, trigger: "schedule", slot: T0.toISOString(), now: T0, items: [{ key: "mon:crash", source: "news", endpointId: "serper-news", amountMicros: 1000 }] });
    expect(reply.ok).toBe(true);
    const getRun = vi.fn();
    await reconcileReservations({ store, looot: { getRun }, now: plus(T0, 120) });
    expect(getRun).not.toHaveBeenCalled();
    expect((await day(store, plus(T0, 120))).reservedMicros).toBe(1000);
    await reconcileReservations({ store, looot: { getRun }, now: plus(T0, 25 * 60) });
    expect((await day(store, plus(T0, 25 * 60))).reservedMicros).toBe(0);
  });
});
