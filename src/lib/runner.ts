import { checkGuards, type GuardResult } from "./budget";
import { dedupe } from "./dedupe";
import { toMicros, usd, usdPrecise } from "./money";
import { PARSERS, parsePage, parseScreenshot } from "./parse";
import { contentHash, diffPages, normalize, pageTitle, watchHits } from "./pageDiff";
import { parseQuery, passesExclusions } from "./query";
import type { PriceMap } from "./quote";
import { manualKey, monthStart, nextMonthStart, nextRunAfter, scheduledKey, slotFor } from "./schedule";
import { diffSerp } from "./serpDiff";
import { mentionSeverity, pageSeverity, reviewSeverity, serpSeverity, systemSeverity } from "./severity";
import { SOURCES, endpointFor, inputFor, sourcesFor } from "./sources";
import type { Store } from "./store/types";
import type { Alert, Item, Monitor, Run, RunStatus, RunTrigger, SerpRow, Settings, SourceId } from "./types";
import { shortDate } from "./clock";

/** The one looot call the runner makes. LoootClient implements it; tests and the demo pass their own. */
export interface Runner {
  runAndWait(endpointId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<{ runId: string; status: string; result?: unknown; actualCost?: number | string | null; error?: { code?: string; message?: string } | null }>;
}

export interface RunDeps {
  store: Store;
  looot: Runner;
  prices: PriceMap;
  /** Endpoint ids whose live price could not be read. A run that needs one of them is refused. */
  unpriced?: readonly string[];
  now: Date;
  /** Demo mode: results come from recorded fixtures, rows are marked "demo" and cost nothing. */
  demo?: boolean;
}

export interface RunOutcome {
  status: "ran" | "blocked_price" | "blocked_budget" | "duplicate";
  costMicros: number;
  newAlerts: number;
  calls: { source: SourceId; status: RunStatus; costMicros: number; newItems: number; errorCode: string | null }[];
  message?: string;
}

type NewAlert = Omit<Alert, "id" | "ownerId">;

function alertBase(monitor: Monitor, at: Date): Pick<NewAlert, "monitorId" | "state" | "snoozedUntil" | "readAt" | "createdAt" | "runId"> {
  return { monitorId: monitor.id, runId: null, state: "open", snoozedUntil: null, readAt: null, createdAt: at.toISOString() };
}

function systemAlert(monitor: Monitor, at: Date, fingerprint: string, title: string, reason: string): NewAlert {
  const v = systemSeverity(reason);
  return { ...alertBase(monitor, at), source: "system", kind: "system", fingerprint, severity: v.severity, severityReason: v.reason, title, url: null, domain: null, author: null, snippet: null, publishedAt: null, payload: {} };
}

/**
 * Runs one monitor once. Order: price guard, budget guard, then one looot call per source, then
 * parse, compare with what was seen and write alerts. A refused run makes no looot call.
 */
export async function runMonitor(deps: RunDeps, monitor: Monitor, opts: { trigger: RunTrigger; confirmId?: string }): Promise<RunOutcome> {
  const { store, looot, prices, now } = deps;
  const settings = await store.getSettings();
  const slot = slotFor(monitor.schedule, now, monitor.runHour);
  const keyFor = (source: string) => (opts.trigger === "manual" ? manualKey(monitor.id, source, opts.confirmId ?? slot.toISOString()) : scheduledKey(monitor.id, source, slot));
  const sources = sourcesFor(monitor.kind, monitor.config);
  const withShot = monitor.kind === "page" && monitor.config.screenshotOnChange === true;

  if (await store.hasRun(keyFor(sources[0]))) return { status: "duplicate", costMicros: 0, newAlerts: 0, calls: [], message: "This slot already ran." };

  const priceOf = (source: SourceId) => prices[endpointFor(source, monitor.config)] ?? 0;
  const livePriceMicros = sources.reduce((n, s) => n + priceOf(s), 0) + (withShot ? prices[SOURCES.screenshot.endpointId] ?? 0 : 0);
  const month = monthStart(now).toISOString();
  const needed = [...sources.map((s) => endpointFor(s, monitor.config)), ...(withShot ? [SOURCES.screenshot.endpointId] : [])];
  const unread = deps.demo ? [] : needed.filter((id) => (deps.unpriced ?? []).includes(id));
  const checked = checkGuards({
    livePriceMicros,
    confirmedMaxMicros: monitor.maxCostPerRunMicros,
    monitorSpentMicros: await store.spentSince(month, monitor.id),
    monitorCapMicros: monitor.monthlyCapMicros,
    workspaceSpentMicros: await store.spentSince(month),
    workspaceCapMicros: settings.workspaceCapMicros,
  });
  // A price nobody could read is not a price the user confirmed. Refuse before any call.
  const guard: GuardResult = unread.length > 0 ? { ok: false, status: "blocked_price", scope: "price", message: `The live price of ${unread.join(", ")} could not be read. No call was made.` } : checked;

  const baseRun = (source: SourceId): Omit<Run, "id" | "ownerId" | "status"> => ({
    monitorId: monitor.id,
    source,
    trigger: opts.trigger,
    slot: slot.toISOString(),
    idempotencyKey: keyFor(source),
    endpointId: endpointFor(source, monitor.config),
    loootRunId: null,
    quotedMicros: priceOf(source),
    actualCostMicros: 0,
    newItems: 0,
    errorCode: null,
    errorMessage: null,
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
  });

  if (!guard.ok) {
    await store.insertRun({ ...baseRun(sources[0]), status: guard.status, errorCode: guard.status, errorMessage: guard.message });
    const reset = nextMonthStart(now);
    const alert =
      guard.status === "blocked_price"
        ? systemAlert(monitor, now, `price:${slot.toISOString()}`, unread.length > 0 ? `${monitor.name} was not run: the live price could not be read` : `${monitor.name} was not run: the price is above your max`, unread.length > 0 ? "Live price could not be read" : `Price ${usdPrecise(livePriceMicros)} is above the confirmed max ${usdPrecise(monitor.maxCostPerRunMicros)}`)
        : guard.scope === "monitor"
          ? systemAlert(monitor, now, `budget:${month.slice(0, 7)}`, `${monitor.name} reached its ${usd(monitor.monthlyCapMicros)} cap. Paused until ${shortDate(reset)}.`, "Monthly cap reached")
          : systemAlert(monitor, now, `workspace-budget:${month.slice(0, 7)}`, `The workspace reached its ${usd(settings.workspaceCapMicros)} cap. ${monitor.name} was not run.`, "Workspace cap reached");
    const written = await store.insertAlerts([alert]);
    await store.updateMonitor(monitor.id, {
      ...(guard.status === "blocked_budget" && guard.scope === "monitor" ? { status: "paused_budget" as const } : {}),
      nextRunAt: nextRunAfter(monitor.schedule, now, monitor.runHour).toISOString(),
    });
    return { status: guard.status, costMicros: 0, newAlerts: written.length, calls: [], message: guard.message };
  }

  const outcome: RunOutcome = { status: "ran", costMicros: 0, newAlerts: 0, calls: [] };
  const seen = await store.fingerprints(monitor.id);
  const priorRuns = await store.listRuns({ monitorId: monitor.id, limit: 1 });
  const firstRun = priorRuns.length === 0;
  let lastError: string | null = null;

  const call = async (source: SourceId) => {
    const row = baseRun(source);
    try {
      const run = await looot.runAndWait(row.endpointId, inputFor(source, monitor.config), row.idempotencyKey);
      const ok = run.status === "completed";
      return {
        row: {
          ...row,
          loootRunId: run.runId ?? null,
          status: (deps.demo ? "demo" : ok ? "completed" : run.status === "blocked" || run.status === "stopped" ? run.status : "failed") as RunStatus,
          actualCostMicros: ok && !deps.demo ? toMicros(run.actualCost) : 0,
          errorCode: ok ? null : (run.error?.code ?? (run.status === "failed" ? "provider_error" : "not_finished")),
          errorMessage: ok ? null : (run.error?.message ?? `Run ended as ${run.status}`),
        },
        result: ok ? run.result : undefined,
        ok,
      };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return { row: { ...row, status: "failed" as RunStatus, errorCode: err.code ?? "request_failed", errorMessage: err.message ?? "The looot request failed" }, result: undefined, ok: false };
    }
  };

  for (const source of sources) {
    const { row, result, ok } = await call(source);
    let alerts: NewAlert[] = [];
    if (ok) {
      if (source === "page") alerts = await handlePage(deps, monitor, result, settings, async () => (withShot ? call("screenshot") : null), outcome);
      else if (source === "google") alerts = await handleSerp(deps, monitor, result, settings);
      else alerts = handleList(source, monitor, result, seen, settings, firstRun, now);
    } else lastError = row.errorCode;
    const stored = await store.insertRun({ ...row, newItems: alerts.length });
    if (!stored) {
      outcome.calls.push({ source, status: row.status, costMicros: 0, newItems: 0, errorCode: "duplicate" });
      continue;
    }
    const written = await store.insertAlerts(alerts.map((a) => ({ ...a, runId: stored.id })));
    for (const a of written) seen.add(a.fingerprint);
    outcome.costMicros += row.actualCostMicros;
    outcome.newAlerts += written.length;
    outcome.calls.push({ source, status: row.status, costMicros: row.actualCostMicros, newItems: written.length, errorCode: row.errorCode });
  }

  const allFailed = outcome.calls.length > 0 && outcome.calls.every((c) => c.status === "failed" || c.status === "blocked" || c.status === "stopped");
  const failures = allFailed ? monitor.consecutiveFailures + 1 : 0;
  if (allFailed && failures === 3) {
    const written = await store.insertAlerts([systemAlert(monitor, now, `failing:${slot.toISOString()}`, `${monitor.name} failed 3 runs in a row`, `Last error: ${lastError ?? "unknown"}`)]);
    outcome.newAlerts += written.length;
  }
  await store.updateMonitor(monitor.id, {
    lastRunAt: now.toISOString(),
    nextRunAt: nextRunAfter(monitor.schedule, now, monitor.runHour).toISOString(),
    consecutiveFailures: failures,
    lastErrorCode: allFailed ? lastError : null,
    status: allFailed && failures >= 3 ? "failing" : monitor.status === "failing" && !allFailed ? "active" : monitor.status,
  });
  return outcome;
}

function handleList(source: SourceId, monitor: Monitor, result: unknown, seen: Set<string>, settings: Settings, firstRun: boolean, now: Date): NewAlert[] {
  const parser = PARSERS[source];
  if (!parser) return [];
  const q = parseQuery(monitor.config.query ?? "");
  const items = parser(result).filter((it) => monitor.kind !== "mention" || passesExclusions(`${it.title} ${it.snippet ?? ""}`, q));
  const fresh = dedupe(items, seen, { firstRun, now });
  return fresh.map((it) => itemAlert(source, monitor, it, settings, now, q.terms));
}

function itemAlert(source: SourceId, monitor: Monitor, it: Item, settings: Settings, now: Date, terms: string[]): NewAlert {
  const review = source === "maps_reviews" || source === "appstore_reviews";
  const v = review ? reviewSeverity(it.extra.rating) : mentionSeverity({ title: it.title, snippet: it.snippet, domain: it.domain, engagement: it.extra.engagement }, settings);
  return {
    ...alertBase(monitor, now),
    source,
    kind: review ? "review" : "mention",
    fingerprint: it.fingerprint,
    severity: v.severity,
    severityReason: v.reason,
    title: it.title,
    url: it.url,
    domain: it.domain,
    author: it.author,
    snippet: it.snippet,
    publishedAt: it.publishedAt,
    payload: review ? { rating: it.extra.rating, platform: source === "maps_reviews" ? "Google Maps" : "App Store" } : { engagement: it.extra.engagement, engagementLabel: it.extra.engagementLabel, outlet: it.extra.outlet, matched: terms },
  };
}

async function handleSerp(deps: RunDeps, monitor: Monitor, result: unknown, settings: Settings): Promise<NewAlert[]> {
  const items = (PARSERS.google?.(result) ?? []).slice(0, monitor.config.depth ?? 10);
  const current: SerpRow[] = items.map((it, i) => ({ position: it.extra.position ?? i + 1, title: it.title, url: it.url ?? "", domain: it.domain ?? "", snippet: it.snippet ?? undefined }));
  const previous = (await deps.store.listSerp(monitor.id, 1))[0]?.rows ?? [];
  const competitorDomains = [...settings.competitorDomains, ...(monitor.config.competitorDomains ?? [])];
  const tracked = [...(monitor.config.myDomain ? [monitor.config.myDomain] : []), ...competitorDomains];
  const { rows, events } = diffSerp(previous, current, tracked);
  await deps.store.insertSerp({ monitorId: monitor.id, takenAt: deps.now.toISOString(), rows });
  return events.map((e) => {
    const v = serpSeverity({ kind: e.kind, domain: e.row.domain, position: e.row.position, previousPosition: e.previousPosition }, { competitorDomains, myDomain: monitor.config.myDomain });
    const what = e.kind === "serp_new" ? `enters position ${e.row.position}` : e.kind === "serp_gone" ? `left the results (was ${e.previousPosition})` : `moved from ${e.previousPosition} to ${e.row.position}`;
    return {
      ...alertBase(monitor, deps.now),
      source: "google" as const,
      kind: e.kind === "serp_new" ? ("serp_new" as const) : ("serp_move" as const),
      fingerprint: `${e.kind}:${e.row.domain}:${e.row.position}:${deps.now.toISOString().slice(0, 10)}`,
      severity: v.severity,
      severityReason: v.reason,
      title: `${e.row.domain} ${what} for "${monitor.config.query ?? ""}"`,
      url: e.row.url || null,
      domain: e.row.domain,
      author: null,
      snippet: e.row.snippet ?? e.row.title,
      publishedAt: null,
      payload: { position: e.row.position, previousPosition: e.previousPosition, query: monitor.config.query, top: rows.slice(0, 10) },
    };
  });
}

async function handlePage(
  deps: RunDeps,
  monitor: Monitor,
  result: unknown,
  settings: Settings,
  takeScreenshot: () => Promise<{ row: Omit<Run, "id" | "ownerId">; result: unknown; ok: boolean } | null>,
  outcome: RunOutcome,
): Promise<NewAlert[]> {
  const page = parsePage(result);
  const text = normalize(page.content, [...settings.ignorePatterns, ...(monitor.config.ignore ?? [])]);
  const h = contentHash(text);
  const last = (await deps.store.listSnapshots(monitor.id))[0];
  const snap = { monitorId: monitor.id, runId: null, contentHash: h, content: text, title: page.title, bytes: text.length, screenshotUrl: null as string | null, takenAt: deps.now.toISOString() };
  if (!last) {
    // The first run stores a baseline and creates no alert.
    await deps.store.insertSnapshot({ ...snap, changed: false });
    return [];
  }
  if (last.contentHash === h) return [];
  const d = diffPages(last.content, text);
  const shot = await takeScreenshot();
  if (shot) {
    const stored = await deps.store.insertRun(shot.row);
    if (stored) {
      outcome.costMicros += shot.row.actualCostMicros;
      outcome.calls.push({ source: "screenshot", status: shot.row.status, costMicros: shot.row.actualCostMicros, newItems: 0, errorCode: shot.row.errorCode });
      if (shot.ok) snap.screenshotUrl = parseScreenshot(shot.result);
    }
  }
  const after = await deps.store.insertSnapshot({ ...snap, changed: true });
  const hits = watchHits(d, monitor.config.watchFor ?? []);
  const v = pageSeverity({ priceChanges: d.priceChanges, watchHits: hits, changedRatio: d.changedRatio });
  return [
    {
      ...alertBase(monitor, deps.now),
      source: "page",
      kind: "page_change",
      fingerprint: `${last.contentHash}:${h}`,
      severity: v.severity,
      severityReason: v.reason,
      title: pageTitle(monitor.name, d),
      url: monitor.config.url ?? null,
      domain: monitor.config.url ? new URL(monitor.config.url).hostname.replace(/^www\./, "") : null,
      author: null,
      snippet: d.lines.find((l) => l.type === "add")?.text ?? d.lines.find((l) => l.type === "del")?.text ?? null,
      publishedAt: null,
      payload: { added: d.added, removed: d.removed, priceChanges: d.priceChanges, watchHits: hits, beforeSnapshotId: last.id, afterSnapshotId: after.id },
    },
  ];
}
