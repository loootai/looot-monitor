import { describe, expect, it } from "vitest";
import { usd, usdPrecise, toMicros, ceilTo } from "./money";
import { FALLBACK_PRICES } from "./prices";
import { buildQuote, defaultCapMicros, pauseWeek } from "./quote";

const AS_OF = "2026-10-08T09:00:00.000Z";

describe("money", () => {
  it("prints four decimals under one cent and two from one cent up", () => {
    expect(usd(1000)).toBe("$0.0010");
    expect(usd(5630)).toBe("$0.0056");
    expect(usd(210_000)).toBe("$0.21");
    expect(usd(1_370_000)).toBe("$1.37");
    expect(usd(0)).toBe("$0.00");
  });
  it("prints unit prices with the decimals they need", () => {
    expect(usdPrecise(750)).toBe("$0.00075");
    expect(usdPrecise(200)).toBe("$0.0002");
    expect(usdPrecise(675_600)).toBe("$0.6756");
  });
  it("turns looot's actualCost into micros, number or string", () => {
    expect(toMicros(0.001)).toBe(1000);
    expect(toMicros("0.00075")).toBe(750);
    expect(toMicros(null)).toBe(0);
    expect(ceilTo(51_000, 50_000)).toBe(100_000);
  });
});

describe("buildQuote", () => {
  it("all four mention sources cost $0.0056 a run", () => {
    const q = buildQuote("mention", { query: '"Tallyroom"', sources: ["news", "x", "reddit", "linkedin"] }, "every_6h", FALLBACK_PRICES, AS_OF);
    expect(q.lines.map((l) => l.endpointId)).toEqual(["serper-news", "anyapi-run-twitter-search", "scrapecreators-reddit-search", "anyapi-run-linkedin-search-posts"]);
    expect(q.perRunMicros).toBe(5630);
    expect(usd(q.perRunMicros)).toBe("$0.0056");
    expect(q.runsPerMonth).toBe(120);
    expect(q.perMonthMicros).toBe(675_600);
  });
  it("daily to hourly moves runs per month from 30 to 720 and the projection with it", () => {
    const daily = buildQuote("serp", { query: "x" }, "daily", FALLBACK_PRICES, AS_OF);
    const hourly = buildQuote("serp", { query: "x" }, "hourly", FALLBACK_PRICES, AS_OF);
    expect([daily.runsPerMonth, hourly.runsPerMonth]).toEqual([30, 720]);
    expect([daily.perMonthMicros, hourly.perMonthMicros]).toEqual([30_000, 720_000]);
  });
  it("a screenshot on change is in the max, not in the normal run", () => {
    const q = buildQuote("page", { url: "https://a.example", screenshotOnChange: true }, "hourly", FALLBACK_PRICES, AS_OF);
    expect(q.perRunMicros).toBe(200);
    expect(q.maxPerRunMicros).toBe(2700);
    expect(q.lines[1]).toMatchObject({ source: "screenshot", conditional: true });
  });
  it("the page reader changes the endpoint and the price", () => {
    const q = buildQuote("page", { url: "https://a.example", reader: "serper-webpage" }, "daily", FALLBACK_PRICES, AS_OF);
    expect(q.lines[0].endpointId).toBe("serper-webpage");
    expect(q.perRunMicros).toBe(2000);
  });
  it("reviews pick the endpoint of the platform", () => {
    expect(buildQuote("reviews", { platform: "maps", placeId: "p" }, "weekly", FALLBACK_PRICES, AS_OF).lines[0].endpointId).toBe("serper-reviews");
    expect(buildQuote("reviews", { platform: "appstore", productId: "1" }, "weekly", FALLBACK_PRICES, AS_OF).perRunMicros).toBe(4000);
  });
  it("default cap is 1.5 times the projection, rounded up to the next $0.05", () => {
    expect(defaultCapMicros(675_600)).toBe(1_050_000);
    expect(defaultCapMicros(6000)).toBe(50_000);
  });
  it("says in which week a monitor would hit its cap", () => {
    expect(pauseWeek({ perRunMicros: 750, runsPerMonth: 720 }, 100_000)).toBe(1);
    expect(pauseWeek({ perRunMicros: 750, runsPerMonth: 720 }, 400_000)).toBe(4);
    expect(pauseWeek({ perRunMicros: 750, runsPerMonth: 720 }, 600_000)).toBeNull();
  });
});
