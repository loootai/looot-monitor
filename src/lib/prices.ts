import { PRICES_AS_OF, SERPER_WEBPAGE, SOURCES } from "./sources";
import type { PriceMap } from "./quote";

/** Every endpoint id this app can call. */
export const ENDPOINT_IDS: string[] = [...Object.values(SOURCES).map((s) => s.endpointId), SERPER_WEBPAGE.endpointId];

/** Prices dated 2026-10-08, used when the catalog cannot be read. Micro-dollars per call. */
export const FALLBACK_PRICES: PriceMap = {
  ...Object.fromEntries(Object.values(SOURCES).map((s) => [s.endpointId, s.fallbackMicros])),
  [SERPER_WEBPAGE.endpointId]: SERPER_WEBPAGE.fallbackMicros,
};

export interface PriceResult {
  prices: PriceMap;
  pricesAsOf: string;
  source: "catalog" | "fallback";
}

interface CatalogItem {
  price?: { state?: string; amountMicros?: number; unit?: string } | null;
}

/** Reads the per-call price in micros from one public catalog item. null when it has no known call price. */
export function priceOfItem(item: CatalogItem | null | undefined): number | null {
  const p = item?.price;
  if (!p || p.state !== "known" || typeof p.amountMicros !== "number" || p.amountMicros < 0) return null;
  if (p.unit && p.unit !== "call") return null;
  return Math.round(p.amountMicros);
}

/**
 * Free, no token needed. Reads current prices for the given endpoints from the public catalog,
 * cached for an hour. Any endpoint that cannot be read keeps its fallback price, and the result
 * says "fallback" so the UI can show the date.
 */
export async function fetchPrices(endpointIds: string[] = ENDPOINT_IDS, opts: { baseUrl?: string; fetch?: typeof fetch; now?: Date; demo?: boolean } = {}): Promise<PriceResult> {
  if (opts.demo) return { prices: { ...FALLBACK_PRICES }, pricesAsOf: `${PRICES_AS_OF}T09:00:00.000Z`, source: "catalog" };
  const base = (opts.baseUrl ?? process.env.LOOOT_API_URL ?? "https://api.looot.ai").replace(/\/+$/, "");
  const f = opts.fetch ?? fetch;
  const prices: PriceMap = { ...FALLBACK_PRICES };
  let missed = 0;
  await Promise.all(
    endpointIds.map(async (id) => {
      try {
        const res = await f(`${base}/v1/public-catalog/${encodeURIComponent(id)}`, { next: { revalidate: 3600 } } as RequestInit);
        const price = res.ok ? priceOfItem((await res.json()) as CatalogItem) : null;
        if (price === null) missed++;
        else prices[id] = price;
      } catch {
        missed++;
      }
    }),
  );
  if (missed > 0) return { prices, pricesAsOf: `${PRICES_AS_OF}T00:00:00.000Z`, source: "fallback" };
  return { prices, pricesAsOf: (opts.now ?? new Date()).toISOString(), source: "catalog" };
}
