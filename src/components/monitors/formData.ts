import "server-only";
import { IS_DEMO } from "@/lib/clock";
import { fetchPrices } from "@/lib/prices";
import { buildQuote } from "@/lib/quote";
import { canRun } from "@/lib/service";
import type { Store } from "@/lib/store/types";
import type { Monitor, MonitorKind } from "@/lib/types";

/** Everything the monitor form needs from the server: prices, a first quote, the token state and existing targets. */
export async function formData(store: Store, initial?: Monitor, kind?: MonitorKind) {
  const [p, monitors, settings] = await Promise.all([fetchPrices(undefined, { demo: IS_DEMO }), store.listMonitors(), store.getSettings()]);
  const k = initial?.kind ?? kind ?? "mention";
  const config = initial?.config ?? (k === "mention" ? { sources: ["news" as const] } : k === "reviews" ? { platform: "appstore" as const } : {});
  return {
    prices: p.prices,
    initialQuote: buildQuote(k, config, initial?.schedule ?? "daily", p.prices, p.pricesAsOf, p.source),
    canRun: canRun(),
    existing: monitors.map((m) => ({ id: m.id, name: m.name, kind: m.kind, target: m.kind === "page" ? (m.config.url ?? "") : m.kind === "reviews" ? (m.config.placeId ?? m.config.productId ?? "") : (m.config.query ?? "") })),
    defaultCapMicros: settings.defaultCapMicros,
  };
}
