import type { Runner } from "@/lib/runner";
import { SERPER_WEBPAGE, SOURCES } from "@/lib/sources";
import type { Store } from "@/lib/store/types";
import { hash } from "@/lib/utils";
import appstore from "./fixtures/appstore_reviews.json";
import linkedin from "./fixtures/linkedin.json";
import maps from "./fixtures/maps_reviews.json";
import news from "./fixtures/news.json";
import reddit from "./fixtures/reddit.json";
import screenshot from "./fixtures/screenshot.json";
import x from "./fixtures/x.json";

const DEMO_LINE = "Education discount: 20% off for design schools.";

/**
 * Stands in for looot in demo mode. It plays the recorded fixture of each source and makes no
 * network call. Page and Google monitors replay what the store last saw, with one new line on a
 * page, so "Run now" shows a small, readable result.
 */
export function fixtureRunner(store: Store, monitorId: string): Runner {
  const byEndpoint: Record<string, unknown> = {
    [SOURCES.news.endpointId]: news,
    [SOURCES.x.endpointId]: x,
    [SOURCES.reddit.endpointId]: reddit,
    [SOURCES.linkedin.endpointId]: linkedin,
    [SOURCES.maps_reviews.endpointId]: maps,
    [SOURCES.appstore_reviews.endpointId]: appstore,
    [SOURCES.screenshot.endpointId]: screenshot,
  };
  return {
    async runAndWait(endpointId, _input, idempotencyKey) {
      let result = byEndpoint[endpointId];
      if (endpointId === SOURCES.page.endpointId || endpointId === SERPER_WEBPAGE.endpointId) {
        const last = (await store.listSnapshots(monitorId))[0];
        const content = last ? (last.content.includes(DEMO_LINE) ? last.content : `${last.content}\n${DEMO_LINE}`) : "# New page\nFirst read. This becomes the baseline.";
        result = { data: { content, title: last?.title ?? "New page" } };
      }
      if (endpointId === SOURCES.google.endpointId) {
        const last = (await store.listSerp(monitorId, 1))[0];
        result = { organic: (last?.rows ?? []).map((r) => ({ title: r.title, link: r.url, snippet: r.snippet, position: r.position })) };
      }
      return { runId: `demo_${hash(idempotencyKey).slice(0, 12)}`, status: "completed", result, actualCost: 0 };
    },
  };
}
