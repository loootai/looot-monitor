/**
 * The budget through the real route handlers: only the owner's settings call can change it, and a
 * run request that carries budget fields changes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import news from "@/demo/fixtures/news.json";

const current = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
const shared = vi.hoisted(() => ({ store: null as unknown }));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: current.user } }) } }),
}));
vi.mock("@/lib/store/supabase", async () => {
  const { MemoryStore } = await import("@/lib/store/demo");
  return {
    SupabaseStore: class extends MemoryStore {
      constructor() {
        super();
        return (shared.store ??= new MemoryStore()) as never;
      }
    },
  };
});
vi.mock("@/lib/prices", async (orig) => ({ ...(await orig<typeof import("@/lib/prices")>()), fetchPrices: async () => ({ prices: { "serper-news": 1000 }, pricesAsOf: "2026-10-08T00:00:00.000Z", source: "fallback", unread: [] }) }));
vi.mock("@/lib/looot", async (orig) => ({
  ...(await orig<typeof import("@/lib/looot")>()),
  loootFromEnv: () => ({ runAndWait: async () => ({ runId: "run_x", status: "completed", result: news, actualCost: 0.001 }) }),
}));

import { MemoryStore } from "@/lib/store/demo";
import { PATCH } from "@/app/api/settings/route";
import { POST as RUN } from "@/app/api/monitors/[id]/run/route";

const TOKEN = "T".repeat(43);
const own = (): Record<string, string> => ({ host: "localhost:3000", origin: "http://localhost:3000", cookie: `monitor_csrf=${TOKEN}`, "x-monitor-csrf": TOKEN, "content-type": "application/json" });
const OWNER = { id: "u-owner", email: "owner@example.com" };

const send = (path: string, method: string, body: unknown) => new Request(`http://localhost:3000${path}`, { method, headers: own(), body: JSON.stringify(body) });

beforeEach(() => {
  for (const k of ["LOOOT_MONITOR_ALLOWED_EMAILS", "LOOOT_MONITOR_ALLOWED_DOMAINS", "NEXT_PUBLIC_DEMO"]) delete process.env[k];
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", LOOOT_MONITOR_ALLOWED_EMAILS: "owner@example.com", LOOOT_TOKEN: "x" });
  current.user = OWNER;
  shared.store = new MemoryStore();
});

async function monitor() {
  const store = shared.store as MemoryStore;
  await store.saveSettings({ dailyBudgetMicros: 1500 });
  return store.createMonitor({ name: "Alpha", kind: "mention", ownerTag: "mine", competitorName: null, config: { query: "Alpha", sources: ["news"] }, schedule: "hourly", runHour: 0, status: "active", maxCostPerRunMicros: 1000, monthlyCapMicros: 1_000_000, confirmedAt: "2026-10-01T00:00:00.000Z", nextRunAt: null });
}

describe("budget settings", () => {
  it("the owner can set the daily and monthly budget", async () => {
    const res = await PATCH(send("/api/settings", "PATCH", { dailyBudgetMicros: 2_000_000, workspaceCapMicros: 8_000_000 }));
    expect(res.status).toBe(200);
    expect(await (shared.store as MemoryStore).getSettings()).toMatchObject({ dailyBudgetMicros: 2_000_000, workspaceCapMicros: 8_000_000 });
  });

  it("a stranger cannot change it", async () => {
    current.user = { id: "u-x", email: "stranger@example.org" };
    const res = await PATCH(send("/api/settings", "PATCH", { dailyBudgetMicros: 9_000_000 }));
    expect(res.status).toBe(403);
    expect((await (shared.store as MemoryStore).getSettings()).dailyBudgetMicros).toBe(1_000_000);
  });

  it("rejects a negative or fractional budget", async () => {
    expect((await PATCH(send("/api/settings", "PATCH", { dailyBudgetMicros: -1 }))).status).toBe(400);
    expect((await PATCH(send("/api/settings", "PATCH", { dailyBudgetMicros: 1.5 }))).status).toBe(400);
  });
});

describe("a run request cannot raise the budget", () => {
  it("budget fields in the body are ignored: the second run is refused at the saved budget", async () => {
    const m = await monitor();
    const store = shared.store as MemoryStore;
    const ask = (confirmId: string) => RUN(send(`/api/monitors/${m.id}/run`, "POST", { confirmId, maxCostMicros: 1000, dailyBudgetMicros: 9_000_000, workspaceCapMicros: 9_000_000, budget: 9_000_000 }), { params: Promise.resolve({ id: m.id }) });
    const first = await (await ask("confirm-1")).json();
    const second = await (await ask("confirm-2")).json();
    expect(first.outcome.status).toBe("ran");
    expect(second.outcome.status).toBe("blocked_budget");
    expect((await store.getSettings()).dailyBudgetMicros).toBe(1500);
    expect(await store.spentSince("2026-01-01T00:00:00.000Z")).toBe(1000);
  });
});
