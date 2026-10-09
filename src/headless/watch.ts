import { parsePage } from "@/lib/parse";
import { diffPages, type DiffLine } from "@/lib/pageDiff";
import type { PriceMap } from "@/lib/quote";
import { runMonitor, type Runner } from "@/lib/runner";
import { monthStart } from "@/lib/schedule";
import { endpointFor, fallbackMicrosFor } from "@/lib/sources";
import { MemoryStore } from "@/lib/store/demo";
import { DEFAULT_SETTINGS, type Alert, type Monitor, type MonitorConfig, type PriceChange, type Run, type Severity, type Snapshot } from "@/lib/types";
import type { WatchPage, Watchlist } from "./watchlist";

/** What a watch run remembers between runs. Written as one JSON file. */
export interface WatchState {
  version: 1;
  monitors: Monitor[];
  runs: Run[];
  alerts: Alert[];
  snapshots: Snapshot[];
}

export interface PlanLine {
  page: WatchPage;
  endpointId: string;
  priceMicros: number;
  /** false when the page does not fit under the run cap. */
  included: boolean;
}

export interface WatchPlan {
  lines: PlanLine[];
  /** Every page at its price, whether it fits or not. */
  totalMicros: number;
  /** The pages that fit under the run cap. */
  plannedMicros: number;
}

export type PageStatus = "changed" | "unchanged" | "baseline" | "failed" | "blocked_price" | "already_ran" | "skipped_run_cap" | "skipped_month_cap";

export interface PageResult {
  page: WatchPage;
  status: PageStatus;
  costMicros: number;
  error?: string;
  note?: string;
  severity?: Severity;
  reason?: string;
  priceChanges: PriceChange[];
  /** Lines that were edited in place: the old text and the new text. */
  edits: { before: string; after: string }[];
  added: string[];
  removed: string[];
}

export interface WatchReport {
  name: string;
  startedAt: string;
  pages: PageResult[];
  quotedMicros: number;
  spentMicros: number;
  runCapMicros: number;
  monthSpentMicros: number;
  monthlyCapMicros: number;
}

export interface WatchDeps {
  list: Watchlist;
  /** null on the first run. */
  state: WatchState | null;
  looot: Runner;
  prices: PriceMap;
  /** Endpoint ids whose live price could not be read. Their pages are refused. */
  unpriced?: readonly string[];
  now: Date;
  /** Run again inside a day that already ran. Uses a new idempotency key, so it is charged again. */
  force?: boolean;
}

const configOf = (p: WatchPage): MonitorConfig => ({ url: p.url, reader: p.reader, ignore: p.ignore, watchFor: p.watchFor });

/** Prices every page of a list and marks, in list order, the ones that fit under the run cap. */
export function planWatch(list: Watchlist, prices: PriceMap): WatchPlan {
  let plannedMicros = 0;
  const lines = list.pages.map((page) => {
    const endpointId = endpointFor("page", configOf(page));
    const priceMicros = prices[endpointId] ?? fallbackMicrosFor(endpointId);
    const included = plannedMicros + priceMicros <= list.maxSpendPerRunMicros;
    if (included) plannedMicros += priceMicros;
    return { page, endpointId, priceMicros, included };
  });
  return { lines, totalMicros: lines.reduce((n, l) => n + l.priceMicros, 0), plannedMicros };
}

/** Wraps the looot runner so a long page is cut to maxChars at a line end before it is stored and compared. */
function capPageText(looot: Runner, maxChars: number, cut: Set<string>): Runner {
  return {
    async runAndWait(endpointId, input, idempotencyKey) {
      const run = await looot.runAndWait(endpointId, input, idempotencyKey);
      if (run.status !== "completed") return run;
      const page = parsePage(run.result);
      if (page.content.length <= maxChars) return run;
      cut.add(String(input.url));
      const head = page.content.slice(0, maxChars);
      const lineEnd = head.lastIndexOf("\n");
      return { ...run, result: { markdown: lineEnd > 0 ? head.slice(0, lineEnd) : head, metadata: { title: page.title } } };
    },
  };
}

/** Splits a page diff into lines edited in place, new lines and removed lines. */
function splitDiff(lines: DiffLine[]): Pick<PageResult, "edits" | "added" | "removed"> {
  // diffPages gives both halves of an edited line word parts. The unmarked words are the same on both sides.
  const same = (l: DiffLine) => (l.type !== "same" && l.parts ? l.parts.filter((p) => !p.mark).map((p) => p.text).join("") : null);
  const adds = lines.filter((l) => l.type === "add");
  const used = new Set<DiffLine>();
  const edits: PageResult["edits"] = [];
  const removed: string[] = [];
  for (const l of lines) {
    if (l.type !== "del") continue;
    const key = same(l);
    const pair = key === null ? undefined : adds.find((a) => !used.has(a) && same(a) === key);
    if (pair) {
      used.add(pair);
      edits.push({ before: l.text, after: pair.text });
    } else removed.push(l.text);
  }
  return { edits, removed, added: adds.filter((a) => !used.has(a)).map((a) => a.text) };
}

/**
 * Checks every page of a watchlist once, with the same runner the app uses: price guard, monthly
 * cap, idempotency key per page and day, snapshot and diff. Returns the new state and a report.
 * A page past the run cap or the monthly cap makes no looot call.
 */
export async function runWatch(deps: WatchDeps): Promise<{ state: WatchState; report: WatchReport }> {
  const { list, now } = deps;
  const prev = deps.state ?? { version: 1, monitors: [], runs: [], alerts: [], snapshots: [] };
  const ids = new Set(list.pages.map((p) => p.id));
  const at = now.toISOString();

  const monitors: Monitor[] = list.pages.map((p) => {
    const old = prev.monitors.find((m) => m.id === p.id);
    const endpointId = endpointFor("page", configOf(p));
    return {
      id: p.id,
      ownerId: "",
      createdAt: old?.createdAt ?? at,
      lastRunAt: old?.lastRunAt ?? null,
      nextRunAt: old?.nextRunAt ?? null,
      consecutiveFailures: old?.consecutiveFailures ?? 0,
      lastErrorCode: old?.lastErrorCode ?? null,
      name: p.name,
      kind: "page",
      ownerTag: "competitor",
      competitorName: p.group,
      config: configOf(p),
      schedule: "daily",
      runHour: 0,
      status: old?.status === "failing" ? "failing" : "active",
      maxCostPerRunMicros: list.maxPricePerPageMicros ?? fallbackMicrosFor(endpointId),
      // The list has one monthly cap. It is the store's workspace cap, so no page has a cap of its own.
      monthlyCapMicros: Number.MAX_SAFE_INTEGER,
      confirmedAt: at,
    };
  });
  const store = new MemoryStore({
    settings: { ...DEFAULT_SETTINGS, workspaceCapMicros: list.monthlyCapMicros },
    monitors,
    // Runs of a page that left the list stay: their cost still counts against this month's cap.
    runs: prev.runs,
    alerts: prev.alerts.filter((a) => ids.has(a.monitorId)),
    snapshots: prev.snapshots.filter((s) => ids.has(s.monitorId)),
    serp: [],
  });

  const plan = planWatch(list, deps.prices);
  const cut = new Set<string>();
  const looot = capPageText(deps.looot, list.maxChars, cut);
  const month = monthStart(now).toISOString();
  const pages: PageResult[] = [];
  let spentMicros = 0;

  for (const line of plan.lines) {
    const result: PageResult = { page: line.page, status: "unchanged", costMicros: 0, priceChanges: [], edits: [], added: [], removed: [] };
    pages.push(result);
    if (!line.included) {
      result.status = "skipped_run_cap";
      continue;
    }
    if ((await store.spentSince(month)) + line.priceMicros > list.monthlyCapMicros) {
      result.status = "skipped_month_cap";
      continue;
    }
    const monitor = (await store.getMonitor(line.page.id))!;
    const hadBaseline = (await store.listSnapshots(monitor.id)).length > 0;
    const out = await runMonitor({ store, looot, prices: deps.prices, unpriced: deps.unpriced, now }, monitor, deps.force ? { trigger: "manual", confirmId: at } : { trigger: "schedule" });
    result.costMicros = out.costMicros;
    spentMicros += out.costMicros;
    if (out.status === "duplicate") result.status = "already_ran";
    else if (out.status === "blocked_budget") result.status = "skipped_month_cap";
    else if (out.status === "blocked_price") {
      result.status = "blocked_price";
      result.error = out.message;
    } else if (out.calls[0]?.status !== "completed") {
      result.status = "failed";
      result.error = out.calls[0]?.errorCode ?? "unknown";
    } else if (!hadBaseline) {
      result.status = "baseline";
      const chars = (await store.listSnapshots(monitor.id))[0]?.bytes ?? 0;
      if (chars < 200) result.note = `The page text was ${chars} characters long. The reader may be blocked on this site.`;
    } else if (out.newAlerts > 0) {
      const alert = (await store.listAlerts({ monitorId: monitor.id, since: at, limit: 5 })).find((a) => a.kind === "page_change");
      const before = alert?.payload.beforeSnapshotId ? await store.getSnapshot(alert.payload.beforeSnapshotId) : null;
      const after = alert?.payload.afterSnapshotId ? await store.getSnapshot(alert.payload.afterSnapshotId) : null;
      if (alert && before && after) {
        result.status = "changed";
        result.severity = alert.severity;
        result.reason = alert.severityReason;
        result.priceChanges = alert.payload.priceChanges ?? [];
        Object.assign(result, splitDiff(diffPages(before.content, after.content).lines));
      }
    }
    if (cut.has(line.page.url)) result.note = `Only the first ${list.maxChars.toLocaleString("en-US")} characters are compared. Lines pushed past that point show as removed.`;
  }

  const data = store.dump();
  const newest = new Map<string, Snapshot>();
  for (const s of data.snapshots) if (!newest.has(s.monitorId) || newest.get(s.monitorId)!.takenAt <= s.takenAt) newest.set(s.monitorId, s);
  const runsFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
  const alertsFrom = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const state: WatchState = {
    version: 1,
    monitors: data.monitors,
    runs: data.runs.filter((r) => r.startedAt >= runsFrom),
    alerts: data.alerts.filter((a) => a.createdAt >= alertsFrom),
    // The next run compares with the newest text only.
    snapshots: [...newest.values()],
  };
  const report: WatchReport = { name: list.name, startedAt: at, pages, quotedMicros: plan.plannedMicros, spentMicros, runCapMicros: list.maxSpendPerRunMicros, monthSpentMicros: await store.spentSince(month), monthlyCapMicros: list.monthlyCapMicros };
  return { state, report };
}
