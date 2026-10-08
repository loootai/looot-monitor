import { dayKey } from "./clock";
import { monthStart, nextMonthStart } from "./schedule";
import { SERPER_WEBPAGE, SOURCES } from "./sources";
import type { Alert, Monitor, MonitorKind, Run, Schedule } from "./types";

const DAY = 86_400_000;
const INTERVAL_MS: Record<Schedule, number> = { hourly: 3_600_000, every_6h: 6 * 3_600_000, daily: DAY, weekly: 7 * DAY };
export const KINDS: MonitorKind[] = ["mention", "page", "serp", "reviews"];
export const KIND_LABEL: Record<MonitorKind, string> = { mention: "Mentions", page: "Page change", serp: "Google results", reviews: "Reviews" };

export interface DaySpend {
  day: string;
  total: number;
  byKind: Record<MonitorKind, number>;
  calls: number;
  failed: number;
}

export interface MonitorSpend {
  monitorId: string;
  name: string;
  runs: number;
  calls: number;
  spendMicros: number;
  monthMicros: number;
  capMicros: number;
  alerts: number;
  costPerAlertMicros: number | null;
}

export interface EndpointSpend {
  endpointId: string;
  jobId: string;
  calls: number;
  failed: number;
  priceMicros: number;
  spendMicros: number;
}

export interface SpendSummary {
  /** Sum of every paid call in the range. The three tables each add up to this. */
  totalMicros: number;
  monthMicros: number;
  projectedMicros: number;
  alertsFound: number;
  costPerAlertMicros: number | null;
  dailyAverageMicros: number;
  daily: DaySpend[];
  byMonitor: MonitorSpend[];
  byEndpoint: EndpointSpend[];
}

const jobOf = (endpointId: string) => (endpointId === SERPER_WEBPAGE.endpointId ? SOURCES.page.jobId : (Object.values(SOURCES).find((s) => s.endpointId === endpointId)?.jobId ?? ""));
const charged = (r: Run) => r.status === "completed" || r.status === "failed" || r.status === "blocked" || r.status === "stopped";

/**
 * Adds up run rows for the spend page. Spend is always a sum over runs, never a stored total.
 * `runs` must cover the range and the current calendar month.
 */
export function summarizeSpend(input: { runs: Run[]; monitors: Monitor[]; alerts: Alert[]; now: Date; days: number; prices: Record<string, number>; perRunMicros: Record<string, number> }): SpendSummary {
  const { runs, monitors, alerts, now, days, prices } = input;
  const since = new Date(now.getTime() - days * DAY).toISOString();
  const month = monthStart(now).toISOString();
  const kindOf = new Map(monitors.map((m) => [m.id, m.kind]));
  const inRange = runs.filter((r) => r.startedAt >= since && charged(r));

  const daily: DaySpend[] = [];
  const dayIndex = new Map<string, DaySpend>();
  for (let i = days - 1; i >= 0; i--) {
    const d: DaySpend = { day: dayKey(new Date(now.getTime() - i * DAY)), total: 0, byKind: { mention: 0, page: 0, serp: 0, reviews: 0 }, calls: 0, failed: 0 };
    daily.push(d);
    dayIndex.set(d.day, d);
  }
  const byMonitor = new Map<string, MonitorSpend & { slots: Set<string> }>();
  for (const m of monitors) byMonitor.set(m.id, { monitorId: m.id, name: m.name, runs: 0, calls: 0, spendMicros: 0, monthMicros: 0, capMicros: m.monthlyCapMicros, alerts: 0, costPerAlertMicros: null, slots: new Set() });
  const byEndpoint = new Map<string, EndpointSpend>();
  let totalMicros = 0;
  let monthMicros = 0;

  for (const r of runs) {
    if (r.startedAt >= month) {
      monthMicros += r.actualCostMicros;
      const m = byMonitor.get(r.monitorId);
      if (m) m.monthMicros += r.actualCostMicros;
    }
  }
  for (const r of inRange) {
    totalMicros += r.actualCostMicros;
    const failed = r.status !== "completed";
    const d = dayIndex.get(dayKey(r.startedAt));
    if (d) {
      d.total += r.actualCostMicros;
      d.calls++;
      if (failed) d.failed++;
      const k = kindOf.get(r.monitorId);
      if (k) d.byKind[k] += r.actualCostMicros;
    }
    const m = byMonitor.get(r.monitorId);
    if (m) {
      m.calls++;
      m.spendMicros += r.actualCostMicros;
      m.slots.add(`${r.trigger}:${r.slot}:${r.trigger === "manual" ? r.idempotencyKey.split(":").pop() : ""}`);
    }
    const e = byEndpoint.get(r.endpointId) ?? { endpointId: r.endpointId, jobId: jobOf(r.endpointId), calls: 0, failed: 0, priceMicros: prices[r.endpointId] ?? r.quotedMicros, spendMicros: 0 };
    e.calls++;
    if (failed) e.failed++;
    e.spendMicros += r.actualCostMicros;
    byEndpoint.set(r.endpointId, e);
  }
  let alertsFound = 0;
  for (const a of alerts) {
    if (a.createdAt < since || a.kind === "system") continue;
    alertsFound++;
    const m = byMonitor.get(a.monitorId);
    if (m) m.alerts++;
  }

  // Projection: what is spent, plus each active monitor's remaining runs, held at its cap.
  const monthEnd = nextMonthStart(now).getTime();
  let projectedMicros = 0;
  for (const m of monitors) {
    const spent = byMonitor.get(m.id)?.monthMicros ?? 0;
    const perRun = input.perRunMicros[m.id] ?? m.maxCostPerRunMicros;
    const left = m.status === "active" || m.status === "failing" ? Math.floor((monthEnd - now.getTime()) / INTERVAL_MS[m.schedule]) * perRun : 0;
    projectedMicros += Math.min(Math.max(m.monthlyCapMicros, spent), spent + (m.status === "failing" ? 0 : left));
  }

  const monitorRows = [...byMonitor.values()]
    .map(({ slots, ...m }) => ({ ...m, runs: slots.size, costPerAlertMicros: m.alerts > 0 ? Math.round(m.spendMicros / m.alerts) : null }))
    .sort((a, b) => b.spendMicros - a.spendMicros);
  return {
    totalMicros,
    monthMicros,
    projectedMicros,
    alertsFound,
    costPerAlertMicros: alertsFound > 0 ? Math.round(totalMicros / alertsFound) : null,
    dailyAverageMicros: Math.round(totalMicros / days),
    daily,
    byMonitor: monitorRows,
    byEndpoint: [...byEndpoint.values()].sort((a, b) => b.spendMicros - a.spendMicros),
  };
}

/** The ledger as CSV text. Fields with a comma or a quote are quoted. */
export function ledgerCsv(runs: Run[], monitorNames: Record<string, string>): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = runs.map((r) => [r.startedAt, monitorNames[r.monitorId] ?? r.monitorId, r.source, r.endpointId, r.loootRunId, r.status, (r.actualCostMicros / 1_000_000).toFixed(6), r.errorCode].map(esc).join(","));
  return ["time,monitor,source,endpoint,looot_run_id,status,cost_usd,error_code", ...rows].join("\n");
}
