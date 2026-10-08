import { ceilTo } from "./money";
import { RUNS_PER_MONTH } from "./schedule";
import { SOURCES, endpointFor, sourcesFor } from "./sources";
import type { MonitorConfig, MonitorKind, Schedule, SourceId } from "./types";

export interface QuoteLine {
  source: SourceId;
  endpointId: string;
  jobId: string;
  calls: number;
  priceMicros: number;
  /** true when the call only happens on some runs (the screenshot on a page change). */
  conditional: boolean;
}

export interface Quote {
  lines: QuoteLine[];
  /** Cost of a normal run. */
  perRunMicros: number;
  /** Cost of the most expensive run, with every conditional call. This is the default max. */
  maxPerRunMicros: number;
  runsPerMonth: number;
  perMonthMicros: number;
  pricesAsOf: string;
  priceSource: "catalog" | "fallback";
}

/** Price per call in micros for each endpoint id. */
export type PriceMap = Record<string, number>;

/** Works out what a monitor costs per run and per month from the endpoint prices. */
export function buildQuote(kind: MonitorKind, config: MonitorConfig, schedule: Schedule, prices: PriceMap, pricesAsOf: string, priceSource: Quote["priceSource"] = "catalog"): Quote {
  const lines: QuoteLine[] = sourcesFor(kind, config).map((source) => {
    const endpointId = endpointFor(source, config);
    return { source, endpointId, jobId: SOURCES[source].jobId, calls: 1, priceMicros: prices[endpointId] ?? 0, conditional: false };
  });
  if (kind === "page" && config.screenshotOnChange) {
    const s = SOURCES.screenshot;
    lines.push({ source: "screenshot", endpointId: s.endpointId, jobId: s.jobId, calls: 1, priceMicros: prices[s.endpointId] ?? 0, conditional: true });
  }
  const perRunMicros = lines.filter((l) => !l.conditional).reduce((n, l) => n + l.calls * l.priceMicros, 0);
  const maxPerRunMicros = lines.reduce((n, l) => n + l.calls * l.priceMicros, 0);
  const runsPerMonth = RUNS_PER_MONTH[schedule];
  return { lines, perRunMicros, maxPerRunMicros, runsPerMonth, perMonthMicros: perRunMicros * runsPerMonth, pricesAsOf, priceSource };
}

/** Default monthly cap: 1.5 times the projection, rounded up to the next $0.05. */
export function defaultCapMicros(perMonthMicros: number): number {
  return Math.max(50_000, ceilTo(Math.ceil(perMonthMicros * 1.5), 50_000));
}

/** The week of the month (1 to 5) in which a monitor would hit its cap, or null when it never does. */
export function pauseWeek(quote: Pick<Quote, "perRunMicros" | "runsPerMonth">, capMicros: number): number | null {
  if (quote.perRunMicros <= 0 || quote.perRunMicros * quote.runsPerMonth <= capMicros) return null;
  const runsUntilCap = Math.floor(capMicros / quote.perRunMicros);
  const day = (runsUntilCap / quote.runsPerMonth) * 30;
  return Math.min(5, Math.floor(day / 7) + 1);
}
