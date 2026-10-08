import type { MonitorConfig, MonitorKind, SourceId } from "./types";

export interface SourceDef {
  id: SourceId;
  label: string;
  /** looot job id, kept as the catalog reference. */
  jobId: string;
  /** The pinned looot endpoint this app runs. */
  endpointId: string;
  /** Price per call in micro-dollars, read from the public catalog on PRICES_AS_OF. */
  fallbackMicros: number;
  priceDated: string;
  /** false until someone has checked a real response body against the parser. */
  shapeVerified: boolean;
}

export const PRICES_AS_OF = "2026-10-08";

/** Every source the app can run. Job ids and prices come from the free looot catalog. */
export const SOURCES: Record<SourceId, SourceDef> = {
  news: { id: "news", label: "News", jobId: "news.search", endpointId: "serper-news", fallbackMicros: 1000, priceDated: "2026-10-05", shapeVerified: false },
  google: { id: "google", label: "Google", jobId: "google.serp.organic", endpointId: "serper-search", fallbackMicros: 1000, priceDated: "2026-10-05", shapeVerified: true },
  page: { id: "page", label: "Page", jobId: "web.scrape.markdown", endpointId: "jina-reader", fallbackMicros: 200, priceDated: "2026-09-08", shapeVerified: false },
  screenshot: { id: "screenshot", label: "Screenshot", jobId: "web.screenshot", endpointId: "context-dev-web-screenshot", fallbackMicros: 2500, priceDated: "2026-09-06", shapeVerified: false },
  x: { id: "x", label: "X", jobId: "x.post.search", endpointId: "anyapi-run-twitter-search", fallbackMicros: 750, priceDated: "2026-09-30", shapeVerified: false },
  reddit: { id: "reddit", label: "Reddit", jobId: "reddit.post.search", endpointId: "scrapecreators-reddit-search", fallbackMicros: 1880, priceDated: "2026-09-06", shapeVerified: false },
  linkedin: { id: "linkedin", label: "LinkedIn", jobId: "linkedin.post.search", endpointId: "anyapi-run-linkedin-search-posts", fallbackMicros: 2000, priceDated: "2026-09-30", shapeVerified: false },
  maps_reviews: { id: "maps_reviews", label: "Google Maps reviews", jobId: "maps.place.reviews", endpointId: "serper-reviews", fallbackMicros: 1000, priceDated: "2026-10-05", shapeVerified: false },
  appstore_reviews: { id: "appstore_reviews", label: "App Store reviews", jobId: "reviews.appstore.reviews", endpointId: "searchapi-io-apple-product-reviews", fallbackMicros: 4000, priceDated: "2026-09-21", shapeVerified: false },
};

/** The second page reader. Same job, different endpoint and price, known response shape. */
export const SERPER_WEBPAGE = { endpointId: "serper-webpage", fallbackMicros: 2000, priceDated: "2026-10-05", shapeVerified: true };

export const MENTION_SOURCES: SourceId[] = ["news", "x", "reddit", "linkedin"];

/** Short label used in filter chips. Reviews from both platforms share one chip. */
export function chipOf(source: string): string {
  if (source === "maps_reviews" || source === "appstore_reviews") return "reviews";
  if (source === "screenshot") return "page";
  return source;
}

/** The sources a monitor calls on every run, in a fixed order. The screenshot is not one of them. */
export function sourcesFor(kind: MonitorKind, config: MonitorConfig): SourceId[] {
  if (kind === "mention") return MENTION_SOURCES.filter((s) => (config.sources ?? ["news"]).includes(s));
  if (kind === "serp") return ["google"];
  if (kind === "page") return ["page"];
  return [config.platform === "maps" ? "maps_reviews" : "appstore_reviews"];
}

/** Endpoint id for a source on a given monitor. Page monitors pick their reader. */
export function endpointFor(source: SourceId, config: MonitorConfig): string {
  if (source === "page" && config.reader === "serper-webpage") return SERPER_WEBPAGE.endpointId;
  return SOURCES[source].endpointId;
}

/** Fallback price for an endpoint id, used when the catalog cannot be read. */
export function fallbackMicrosFor(endpointId: string): number {
  if (endpointId === SERPER_WEBPAGE.endpointId) return SERPER_WEBPAGE.fallbackMicros;
  const s = Object.values(SOURCES).find((d) => d.endpointId === endpointId);
  return s?.fallbackMicros ?? 0;
}

/** Builds the looot input for one call. Field names differ per provider, so they live here. */
export function inputFor(source: SourceId, config: MonitorConfig): Record<string, unknown> {
  const q = config.query ?? "";
  switch (source) {
    case "news":
      return { q, num: 20, ...(config.country ? { gl: config.country } : {}), ...(config.language ? { hl: config.language } : {}), tbs: "qdr:w" };
    case "google":
      return { q, num: config.depth ?? 10, ...(config.country ? { gl: config.country } : {}), ...(config.language ? { hl: config.language } : {}) };
    case "page":
      return config.reader === "serper-webpage" ? { url: config.url, includeMarkdown: true } : { url: config.url };
    case "screenshot":
      return { directUrl: config.url, fullScreenshot: true };
    case "x":
      return { query: q, limit: 20, queryType: "Latest" };
    case "reddit":
      return { query: q, sort: "new", timeframe: "week" };
    case "linkedin":
      return { query: q, datePosted: "past-week" };
    case "maps_reviews":
      return { placeId: config.placeId, sortBy: "newest" };
    case "appstore_reviews":
      return { product_id: config.productId, country: config.country ?? "us", sort_by: "mostrecent" };
  }
}
