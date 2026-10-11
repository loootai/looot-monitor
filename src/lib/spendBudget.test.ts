import { describe, expect, it, vi } from "vitest";
import news from "@/demo/fixtures/news.json";
import { runMonitor, type Runner } from "./runner";
import { MemoryStore } from "./store/demo";
import type { NewMonitor } from "./store/types";

const PRICES = { "serper-news": 1000 };
const T0 = new Date("2026-10-08T09:10:00Z");
const hour = (h: number) => new Date(`2026-10-08T${String(h).padStart(2, "0")}:10:00Z`);

async function addMonitor(store: MemoryStore, name: string, over: Partial<NewMonitor> = {}) {
  return store.createMonitor({
    name,
    kind: "mention",
    ownerTag: "mine",
    competitorName: null,
    config: { query: name, sources: ["news"] },
    schedule: "hourly",
    runHour: 0,
    status: "active",
    maxCostPerRunMicros: 1000,
    monthlyCapMicros: 1_000_000,
    confirmedAt: "2026-10-01T00:00:00.000Z",
    nextRunAt: null,
    ...over,
  });
}

const ok = (cost = 0.001) => ({ runId: "run_x", status: "completed", result: news, actualCost: cost });
const looot = (impl: Runner["runAndWait"]) => ({ runAndWait: vi.fn(impl) });

describe("period budget", () => {
  it("two simultaneous runs whose sum is over the daily budget: exactly one proceeds", async () => {
    const store = new MemoryStore();
    await store.saveSettings({ dailyBudgetMicros: 1500 });
    const a = await addMonitor(store, "Alpha");
    const b = await addMonitor(store, "Beta");
    const client = looot(async () => ok());
    const [ra, rb] = await Promise.all([runMonitor({ store, looot: client, prices: PRICES, now: T0 }, a, { trigger: "schedule" }), runMonitor({ store, looot: client, prices: PRICES, now: T0 }, b, { trigger: "schedule" })]);
    expect([ra.status, rb.status].sort()).toEqual(["blocked_budget", "ran"]);
    expect(client.runAndWait).toHaveBeenCalledTimes(1);
    expect(await store.spentSince("2026-10-01T00:00:00.000Z")).toBe(1000);
  });

  it("many small runs stop at the budget", async () => {
    const store = new MemoryStore();
    await store.saveSettings({ dailyBudgetMicros: 5000 });
    const m = await addMonitor(store, "Alpha");
    const client = looot(async () => ok());
    const outcomes = [];
    for (let h = 0; h < 10; h++) outcomes.push((await runMonitor({ store, looot: client, prices: PRICES, now: hour(h) }, (await store.getMonitor(m.id))!, { trigger: "schedule" })).status);
    expect(outcomes.filter((s) => s === "ran")).toHaveLength(5);
    expect(outcomes.filter((s) => s === "blocked_budget")).toHaveLength(5);
    expect(client.runAndWait).toHaveBeenCalledTimes(5);
    expect(await store.spentSince("2026-10-01T00:00:00.000Z")).toBe(5000);
  });

  it("ten simultaneous runs against a budget for three: exactly three proceed", async () => {
    const store = new MemoryStore();
    await store.saveSettings({ dailyBudgetMicros: 3000 });
    const monitors = await Promise.all(Array.from({ length: 10 }, (_, i) => addMonitor(store, `M${i}`)));
    const client = looot(async () => ok());
    const outs = await Promise.all(monitors.map((m) => runMonitor({ store, looot: client, prices: PRICES, now: T0 }, m, { trigger: "schedule" })));
    expect(outs.filter((o) => o.status === "ran")).toHaveLength(3);
    expect(client.runAndWait).toHaveBeenCalledTimes(3);
  });

  it("a repeated identical request is not charged twice", async () => {
    const store = new MemoryStore();
    const m = await addMonitor(store, "Alpha");
    const client = looot(async () => ok());
    const deps = { store, looot: client, prices: PRICES, now: T0 };
    const first = await runMonitor(deps, m, { trigger: "manual", confirmId: "confirm-1" });
    const again = await runMonitor(deps, m, { trigger: "manual", confirmId: "confirm-1" });
    expect(first.status).toBe("ran");
    expect(again.status).toBe("duplicate");
    expect(client.runAndWait).toHaveBeenCalledTimes(1);
    expect(await store.spentSince("2026-10-01T00:00:00.000Z")).toBe(1000);
  });
});
