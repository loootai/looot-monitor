import { describe, expect, it } from "vitest";
import { sameOrigin } from "./csrf";

const h = (o: Record<string, string>) => new Headers(o);

describe("sameOrigin", () => {
  it("accepts the app's own origin", () => {
    expect(sameOrigin(h({ host: "app.test", origin: "https://app.test" }))).toBe(true);
  });
  it("refuses another origin", () => {
    expect(sameOrigin(h({ host: "app.test", origin: "https://evil.test", "sec-fetch-site": "same-origin" }))).toBe(false);
  });
  it("accepts Origin: null when Sec-Fetch-Site says same-origin", () => {
    expect(sameOrigin(h({ host: "app.test", origin: "null", "sec-fetch-site": "same-origin" }))).toBe(true);
  });
  it("refuses Origin: null from a cross-site request", () => {
    expect(sameOrigin(h({ host: "app.test", origin: "null", "sec-fetch-site": "cross-site" }))).toBe(false);
  });
  it("refuses Origin: null with no Sec-Fetch-Site", () => {
    expect(sameOrigin(h({ host: "app.test", origin: "null" }))).toBe(false);
  });
});
