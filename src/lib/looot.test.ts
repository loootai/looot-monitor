import { describe, expect, it, vi } from "vitest";
import { LoootClient, LoootError, balanceUsdOf, hasLoootToken, loootFromEnv } from "./looot";
import { FALLBACK_PRICES, fetchPrices, priceOfItem } from "./prices";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("LoootClient", () => {
  it("posts the endpoint, input and idempotency key with the bearer token", async () => {
    const f = vi.fn(async () => json({ runId: "run_1", status: "completed", result: { organic: [] }, actualCost: 0.001 }));
    const client = new LoootClient({ token: "tok_test", fetch: f as unknown as typeof fetch });
    const run = await client.run("serper-search", { q: "tallyroom" }, "mon:m1:google:2026-10-08T09:00:00.000Z");
    expect(run.status).toBe("completed");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.looot.ai/v1/runs?wait=30");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_test");
    expect(JSON.parse(init.body as string)).toEqual({ endpointId: "serper-search", input: { q: "tallyroom" }, idempotencyKey: "mon:m1:google:2026-10-08T09:00:00.000Z" });
  });
  it("polls a run that is not finished until it reaches a terminal state", async () => {
    const answers = [json({ runId: "run_2", status: "running" }), json({ runId: "run_2", status: "running" }), json({ runId: "run_2", status: "completed", actualCost: "0.0002" })];
    const f = vi.fn(async () => answers.shift()!);
    const client = new LoootClient({ token: "t", fetch: f as unknown as typeof fetch, sleep: async () => {} });
    const run = await client.runAndWait("jina-reader", { url: "https://a.example" }, "k");
    expect(run.status).toBe("completed");
    expect(f).toHaveBeenCalledTimes(3);
    expect((f.mock.calls[1] as unknown as [string])[0]).toBe("https://api.looot.ai/v1/runs/run_2");
  });
  it("stops polling at the timeout and hands back the unfinished run", async () => {
    const f = vi.fn(async () => json({ runId: "run_3", status: "queued" }));
    const client = new LoootClient({ token: "t", fetch: f as unknown as typeof fetch, sleep: async () => {}, pollTimeoutMs: 0 });
    expect((await client.runAndWait("jina-reader", {}, "k")).status).toBe("queued");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("turns an HTTP error into a LoootError with looot's code", async () => {
    const f = vi.fn(async () => json({ error: { code: "insufficient_funds", message: "Top up to run this." } }, 402));
    const client = new LoootClient({ token: "t", fetch: f as unknown as typeof fetch });
    await expect(client.run("serper-news", {}, "k")).rejects.toMatchObject({ name: "LoootError", status: 402, code: "insufficient_funds" });
  });
  it("needs LOOOT_TOKEN and never exposes it", () => {
    expect(() => loootFromEnv({})).toThrow(LoootError);
    expect(hasLoootToken({})).toBe(false);
    expect(hasLoootToken({ LOOOT_TOKEN: "x" })).toBe(true);
    expect(JSON.stringify(loootFromEnv({ LOOOT_TOKEN: "tok_secret" }))).not.toContain("tok_secret");
  });
  it("finds the balance whatever the field is called", () => {
    expect(balanceUsdOf({ balanceUsd: 12.5 })).toBe(12.5);
    expect(balanceUsdOf({ balance: { availableUsd: "4.20" } })).toBe(4.2);
    expect(balanceUsdOf({ topUpLink: "x" })).toBeNull();
  });
});

describe("prices", () => {
  it("reads a known per-call price", () => {
    expect(priceOfItem({ price: { state: "known", amountMicros: 1000, unit: "call" } })).toBe(1000);
    expect(priceOfItem({ price: { state: "unknown" } })).toBeNull();
    expect(priceOfItem({ price: { state: "known", amountMicros: 5, unit: "result" } })).toBeNull();
  });
  it("uses live catalog prices when every endpoint answers", async () => {
    const f = vi.fn(async (url: string) => json({ catalogItemId: url.split("/").pop(), price: { state: "known", amountMicros: 1234, unit: "call" } }));
    const r = await fetchPrices(["serper-news", "jina-reader"], { fetch: f as unknown as typeof fetch, now: new Date("2026-10-09T00:00:00Z") });
    expect(r).toMatchObject({ source: "catalog", pricesAsOf: "2026-10-09T00:00:00.000Z" });
    expect(r.prices["serper-news"]).toBe(1234);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://api.looot.ai/v1/public-catalog/serper-news");
  });
  it("falls back to the dated table when the catalog cannot be read", async () => {
    const f = vi.fn(async () => {
      throw new Error("offline");
    });
    const r = await fetchPrices(["serper-news"], { fetch: f as unknown as typeof fetch });
    expect(r.source).toBe("fallback");
    expect(r.pricesAsOf.startsWith("2026-10-08")).toBe(true);
    expect(r.prices).toEqual(FALLBACK_PRICES);
  });
  it("demo mode makes no request", async () => {
    const f = vi.fn();
    const r = await fetchPrices(undefined, { fetch: f as unknown as typeof fetch, demo: true });
    expect(f).not.toHaveBeenCalled();
    expect(r.prices["serper-news"]).toBe(1000);
  });
});
