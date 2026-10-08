import { describe, expect, it } from "vitest";
import { checkGuards } from "./budget";
import { manualKey, monthStart, nextMonthStart, nextRunAfter, scheduledKey, slotFor } from "./schedule";

const base = { livePriceMicros: 1000, confirmedMaxMicros: 1000, monitorSpentMicros: 0, monitorCapMicros: 100_000, workspaceSpentMicros: 0, workspaceCapMicros: 1_000_000 };

describe("checkGuards", () => {
  it("lets a run through when price and budgets fit", () => {
    expect(checkGuards(base)).toEqual({ ok: true });
  });
  it("blocks when the live price is above the confirmed max", () => {
    expect(checkGuards({ ...base, livePriceMicros: 1001 })).toMatchObject({ ok: false, status: "blocked_price" });
  });
  it("blocks when month spend plus the max is above the monitor cap", () => {
    expect(checkGuards({ ...base, monitorSpentMicros: 99_001 })).toMatchObject({ ok: false, status: "blocked_budget", scope: "monitor" });
    expect(checkGuards({ ...base, monitorSpentMicros: 99_000 })).toEqual({ ok: true });
  });
  it("blocks when the workspace cap would be passed", () => {
    expect(checkGuards({ ...base, workspaceSpentMicros: 999_500 })).toMatchObject({ ok: false, status: "blocked_budget", scope: "workspace" });
  });
});

describe("slots and idempotency keys", () => {
  it("two ticks in the same hour share a slot and a key", () => {
    const a = slotFor("hourly", new Date("2026-10-08T09:02:11Z"));
    const b = slotFor("hourly", new Date("2026-10-08T09:47:55Z"));
    expect(a.toISOString()).toBe("2026-10-08T09:00:00.000Z");
    expect(scheduledKey("m1", "news", a)).toBe(scheduledKey("m1", "news", b));
    expect(scheduledKey("m1", "news", a)).toBe("mon:m1:news:2026-10-08T09:00:00.000Z");
  });
  it("the next hour gets a new key", () => {
    expect(scheduledKey("m1", "news", slotFor("hourly", new Date("2026-10-08T10:00:00Z")))).not.toBe(scheduledKey("m1", "news", slotFor("hourly", new Date("2026-10-08T09:59:59Z"))));
  });
  it("finds the boundary of every schedule", () => {
    const at = new Date("2026-10-08T09:30:00Z"); // a Thursday
    expect(slotFor("every_6h", at).toISOString()).toBe("2026-10-08T06:00:00.000Z");
    expect(slotFor("daily", at, 8).toISOString()).toBe("2026-10-08T08:00:00.000Z");
    expect(slotFor("daily", at, 14).toISOString()).toBe("2026-10-07T14:00:00.000Z");
    expect(slotFor("weekly", at, 9).toISOString()).toBe("2026-10-05T09:00:00.000Z");
    expect(nextRunAfter("weekly", at, 9).toISOString()).toBe("2026-10-12T09:00:00.000Z");
    expect(nextRunAfter("hourly", at).toISOString()).toBe("2026-10-08T10:00:00.000Z");
  });
  it("manual keys carry the id made with the quote", () => {
    expect(manualKey("m1", "page", "c0ffee")).toBe("man:m1:page:c0ffee");
  });
  it("month boundaries are in UTC", () => {
    expect(monthStart(new Date("2026-10-08T09:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(nextMonthStart(new Date("2026-12-31T23:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
