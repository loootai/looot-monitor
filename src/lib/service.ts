import "server-only";
import { fixtureRunner } from "@/demo/fixtureRunner";
import { IS_DEMO, now } from "./clock";
import { hasLoootToken, loootFromEnv } from "./looot";
import { monitorInput, fieldErrors } from "./monitorSchema";
import { fetchPrices } from "./prices";
import { buildQuote, type Quote } from "./quote";
import { runMonitor, type RunOutcome } from "./runner";
import { nextRunAfter } from "./schedule";
import { mentionSeverity } from "./severity";
import type { NewMonitor, Store } from "./store/types";
import type { Alert, Monitor, MonitorConfig, MonitorKind, Schedule, Settings } from "./types";

/** Live quote for a monitor shape. Free: it only reads the public catalog. */
export async function quoteFor(kind: MonitorKind, config: MonitorConfig, schedule: Schedule): Promise<Quote> {
  const p = await fetchPrices(undefined, { demo: IS_DEMO });
  return buildQuote(kind, config, schedule, p.prices, p.pricesAsOf, p.source);
}

export type ServiceError = { ok: false; status: number; error: string; fields?: Record<string, string> };

/** Checks the form input and turns it into a monitor row. */
export function parseMonitor(body: unknown): { ok: true; value: NewMonitor } | ServiceError {
  const parsed = monitorInput.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "Some fields need a change.", fields: fieldErrors(parsed.error) };
  const m = parsed.data;
  const at = now();
  return {
    ok: true,
    value: {
      name: m.name,
      kind: m.kind,
      ownerTag: m.ownerTag,
      competitorName: m.ownerTag === "competitor" ? (m.competitorName ?? null) : null,
      config: m.config as MonitorConfig,
      schedule: m.schedule,
      runHour: m.runHour,
      status: "active",
      maxCostPerRunMicros: m.maxCostPerRunMicros,
      monthlyCapMicros: m.monthlyCapMicros,
      confirmedAt: at.toISOString(),
      nextRunAt: nextRunAfter(m.schedule, at, m.runHour).toISOString(),
    },
  };
}

/** true when a paid run can be made: demo mode (fixtures), or a token on the server. */
export function canRun(): boolean {
  return IS_DEMO || hasLoootToken();
}

/**
 * Runs a monitor once, now, for the signed-in user. The caller has shown the quote; maxCostMicros
 * is what the user confirmed and becomes the monitor's max when it differs.
 */
export async function runNow(store: Store, monitor: Monitor, confirmId: string, maxCostMicros?: number): Promise<RunOutcome | ServiceError> {
  if (!canRun()) return { ok: false, status: 409, error: "LOOOT_TOKEN is not set on the server. Add it, then run again." };
  const prices = await fetchPrices(undefined, { demo: IS_DEMO });
  let m = monitor;
  if (maxCostMicros && maxCostMicros !== monitor.maxCostPerRunMicros) m = (await store.updateMonitor(monitor.id, { maxCostPerRunMicros: maxCostMicros, confirmedAt: now().toISOString() })) ?? monitor;
  const looot = IS_DEMO ? fixtureRunner(store, m.id) : loootFromEnv();
  return runMonitor({ store, looot, prices: prices.prices, now: now(), demo: IS_DEMO }, m, { trigger: "manual", confirmId });
}

/** How many mention alerts would get a different severity under edited rules. */
export function previewSeverity(alerts: Alert[], rules: Pick<Settings, "escalationWords" | "priorityDomains">): { changed: number; checked: number; up: number; down: number } {
  const rank = { low: 0, medium: 1, high: 2 };
  let changed = 0;
  let up = 0;
  let down = 0;
  const mentions = alerts.filter((a) => a.kind === "mention");
  for (const a of mentions) {
    const v = mentionSeverity({ title: a.title, snippet: a.snippet, domain: a.domain, engagement: a.payload.engagement }, rules);
    if (v.severity !== a.severity) {
      changed++;
      if (rank[v.severity] > rank[a.severity]) up++;
      else down++;
    }
  }
  return { changed, checked: mentions.length, up, down };
}
