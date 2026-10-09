import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { AlertList } from "@/components/alerts/AlertList";
import { DiffViewer } from "@/components/alerts/DiffViewer";
import { BarChart, type BarDatum } from "@/components/BarChart";
import { MonitorActions, RunsTable } from "@/components/monitors/MonitorActions";
import { Empty, ErrorPanel, RowsSkeleton, StatsSkeleton, forcedState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge, Table, Td, Th } from "@/components/ui/misc";
import { KIND_NAME, STATUS_LABEL, StatusDot, SOURCE_NAME } from "@/components/visuals";
import { IS_DEMO, clockTime, dateTime, dayKey, dayLabel, now, shortDate } from "@/lib/clock";
import { targetOf } from "@/lib/monitorText";
import { usd, usdPrecise } from "@/lib/money";
import { diffPages, summarize } from "@/lib/pageDiff";
import { fetchPrices } from "@/lib/prices";
import { buildQuote } from "@/lib/quote";
import { SCHEDULE_LABEL, monthStart, nextMonthStart } from "@/lib/schedule";
import { changeLabel } from "@/lib/serpDiff";
import { canRun } from "@/lib/service";
import { sourcesFor } from "@/lib/sources";
import { requireSession } from "@/lib/store";
import type { SerpResult } from "@/lib/store/types";
import type { Monitor, Run } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Monitor" };

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="border-line px-4 py-3 md:border-l md:px-6 md:first:border-l-0">
      <dt className="text-11 text-mute">{label}</dt>
      <dd className="num mt-0.5 text-20 font-medium tracking-tight">{value}</dd>
      {sub ? <dd className="num text-11 text-mute">{sub}</dd> : null}
    </div>
  );
}

function Sparkline({ points, depth }: { points: (number | null)[]; depth: number }) {
  const w = 120;
  const h = 28;
  const xy = points.map((p, i) => (p === null ? null : `${(i / Math.max(1, points.length - 1)) * w},${2 + ((p - 1) / Math.max(1, depth - 1)) * (h - 4)}`));
  const segs: string[][] = [[]];
  for (const p of xy) {
    if (p === null) segs.push([]);
    else segs[segs.length - 1].push(p);
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Position over 30 days, higher is better" className="overflow-visible">
      <line x1="0" x2={w} y1={h - 1} y2={h - 1} stroke="var(--line)" />
      {segs.filter((s) => s.length > 0).map((s, i) => (s.length === 1 ? <circle key={i} cx={s[0].split(",")[0]} cy={s[0].split(",")[1]} r="1.5" fill="var(--k2)" /> : <polyline key={i} points={s.join(" ")} fill="none" stroke="var(--k2)" strokeWidth="1.5" strokeLinejoin="round" />))}
    </svg>
  );
}

export default async function MonitorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const forced = forcedState(q.state);
  if (forced === "loading") {
    return (
      <>
        <StatsSkeleton chart={160} />
        <RowsSkeleton rows={6} height={56} />
      </>
    );
  }
  if (forced === "error") return <ErrorPanel code="monitor_load_failed · HTTP 503" message="This monitor could not be loaded." retryHref={`/monitors/${id}`} lastLoaded={clockTime(new Date(now().getTime() - 4 * 60_000))} />;

  const { store } = await requireSession();
  const monitor = await store.getMonitor(id);
  if (!monitor) return <Empty title="This monitor was deleted" note="Its alerts and runs went with it." />;

  const at = now();
  const since = new Date(at.getTime() - 30 * 86_400_000).toISOString();
  const month = monthStart(at).toISOString();
  const [runsAll, alertsAll, prices] = await Promise.all([forced === "empty" ? Promise.resolve([] as Run[]) : store.listRuns({ monitorId: id, since }), forced === "empty" ? Promise.resolve([]) : store.listAlerts({ monitorId: id, limit: 100 }), fetchPrices(undefined, { demo: IS_DEMO })]);
  const quote = buildQuote(monitor.kind, monitor.config, monitor.schedule, prices.prices, prices.pricesAsOf, prices.source);
  const monthRuns = runsAll.filter((r) => r.startedAt >= month);
  const monthMicros = monthRuns.reduce((n, r) => n + r.actualCostMicros, 0);
  const monthSlots = new Set(monthRuns.map((r) => `${r.slot}|${r.trigger === "manual" ? r.idempotencyKey : ""}`)).size;
  const openAlerts = alertsAll.filter((a) => a.state === "open").length;
  const tabs = [
    { key: "alerts", label: "Alerts", count: alertsAll.length },
    { key: "runs", label: "Runs", count: runsAll.length },
    ...(monitor.kind === "page" ? [{ key: "snapshots", label: "Snapshots" }] : []),
    ...(monitor.kind === "serp" ? [{ key: "results", label: "Results" }] : []),
    { key: "settings", label: "Settings" },
  ] as { key: string; label: string; count?: number }[];
  const tab = tabs.some((t) => t.key === q.tab) ? q.tab! : "alerts";

  // Runs per day, by result, with the month's running spend against the cap.
  const days: BarDatum[] = [];
  const line: number[] = [];
  const byDay = new Map<string, { found: number; none: number; failed: number; cost: number }>();
  for (const r of runsAll) {
    const d = byDay.get(dayKey(r.startedAt)) ?? { found: 0, none: 0, failed: 0, cost: 0 };
    if (r.status !== "completed" && r.status !== "demo") d.failed++;
    else if (r.newItems > 0) d.found++;
    else d.none++;
    d.cost += r.actualCostMicros;
    byDay.set(dayKey(r.startedAt), d);
  }
  let running = 0;
  let maxDay = 1;
  for (let i = 29; i >= 0; i--) {
    const date = new Date(at.getTime() - i * 86_400_000);
    const key = dayKey(date);
    const d = byDay.get(key) ?? { found: 0, none: 0, failed: 0, cost: 0 };
    if (key.slice(8) === "01") running = 0;
    running += d.cost;
    maxDay = Math.max(maxDay, d.found + d.none + d.failed);
    line.push(monitor.monthlyCapMicros > 0 ? running / monitor.monthlyCapMicros : 0);
    days.push({ key, label: dayLabel(key, at), segs: [{ name: "Found something", value: d.found, color: "var(--k2)" }, { name: "Nothing new", value: d.none, color: "var(--kq)" }, { name: "Failed", value: d.failed, color: "var(--high)" }], notes: [`${usd(d.cost)} that day, ${usd(running)} in the month`] });
  }
  const legend = [{ name: "Found something", color: "var(--k2)" }, { name: "Nothing new", color: "var(--kq)" }, { name: "Failed", color: "var(--high)" }];
  const href = (t: string) => `/monitors/${id}${t === "alerts" ? "" : `?tab=${t}`}`;
  const isLink = monitor.kind === "page" && monitor.config.url;

  return (
    <div className="bg-panel md:min-h-full">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 md:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusDot status={monitor.status} />
            <h2 className="truncate text-16 font-semibold tracking-tight">{monitor.name}</h2>
            <Badge tone={monitor.status === "failing" ? "high" : monitor.status === "paused_budget" ? "amber" : monitor.status === "active" ? "brand" : "neutral"}>{STATUS_LABEL[monitor.status]}</Badge>
            <Badge>{KIND_NAME[monitor.kind]}</Badge>
            <Badge>{monitor.ownerTag === "mine" ? "Mine" : `Competitor${monitor.competitorName ? `, ${monitor.competitorName}` : ""}`}</Badge>
          </div>
          <p className="num mt-1 flex min-w-0 items-center gap-1 text-12 text-mute">
            {isLink ? (
              <a href={monitor.config.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-link underline-offset-2 hover:underline">
                <span className="truncate">{targetOf(monitor)}</span>
                <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
              </a>
            ) : (
              <span className="truncate">{targetOf(monitor)}</span>
            )}
            <span className="shrink-0 font-sans">· {SCHEDULE_LABEL[monitor.schedule]}</span>
          </p>
        </div>
        <MonitorActions monitor={monitor} canRun={canRun()} />
      </header>

      {monitor.status === "paused_budget" ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber bg-amber-soft px-4 py-3 md:px-6">
          <TriangleAlert className="size-4 shrink-0 text-amber" aria-hidden />
          <p className="min-w-0 flex-1">
            Budget reached. Spent <span className="num">{usd(monthMicros)}</span> of the <span className="num">{usd(monitor.monthlyCapMicros)}</span> cap. Checks start again on {shortDate(nextMonthStart(at))}, or now if you raise the cap.
          </p>
          <Button asChild size="sm">
            <Link href={`/monitors/${id}/edit#budget`}>Raise cap</Link>
          </Button>
        </div>
      ) : null}
      {monitor.status === "failing" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-high bg-high-soft px-4 py-3 md:px-6">
          <TriangleAlert className="size-4 shrink-0 text-high" aria-hidden />
          <p className="min-w-0 flex-1">
            The last {monitor.consecutiveFailures} runs failed with <span className="num font-medium">{monitor.lastErrorCode ?? "an error"}</span>. Failed calls cost nothing.
          </p>
          <Button asChild size="sm">
            <Link href="/settings#looot">Check token</Link>
          </Button>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 border-b border-line md:grid-cols-4">
        <Stat label="Open alerts" value={openAlerts} />
        <Stat label="Runs this month" value={monthSlots} sub={`${monthRuns.length} looot calls`} />
        <Stat label="Spent this month / cap" value={<span className="whitespace-nowrap">{usd(monthMicros)} <span className="text-13 font-normal text-mute">/ {usd(monitor.monthlyCapMicros)}</span></span>} />
        <Stat label="Average cost per run" value={monthSlots > 0 ? usdPrecise(Math.round(monthMicros / monthSlots)) : usdPrecise(quote.perRunMicros)} sub={`quote ${usdPrecise(quote.perRunMicros)}`} />
      </dl>

      {runsAll.length === 0 ? (
        <Empty title={monitor.nextRunAt && monitor.status === "active" ? `First check runs at ${clockTime(monitor.nextRunAt)} UTC` : "No runs yet"} note="A run reads the sources, compares the result with the last one and writes an alert for what is new.">
          <MonitorActions monitor={monitor} canRun={canRun()} />
        </Empty>
      ) : (
        <div className="border-b border-line px-4 py-4 md:px-6">
          <BarChart data={days} height={160} ariaLabel="Looot calls per day for 30 days, by result" maxLabel={`${maxDay} ${maxDay === 1 ? "call" : "calls"}`} legend={legend} line={{ points: line, label: "Month spend against cap", topLabel: `cap ${usd(monitor.monthlyCapMicros)}` }} />
        </div>
      )}

      <nav aria-label="Monitor sections" className="scroll-thin flex gap-5 overflow-x-auto border-b border-line px-4 md:px-6">
        {tabs.map((t) => (
          <Link key={t.key} href={href(t.key)} scroll={false} aria-current={tab === t.key ? "page" : undefined} className={cn("flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent text-mute hover:text-ink", tab === t.key && "border-brand font-medium text-ink")}>
            {t.label}
            {t.count !== undefined ? <span className="num text-11 font-normal text-mute">{t.count}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "alerts" ? alertsAll.length === 0 ? <Empty title="No alerts from this monitor yet" note={monitor.kind === "page" ? "The first run stores a baseline. An alert is written when the page text changes." : "An alert is written for each new item a run finds."} /> : <AlertList alerts={alertsAll} /> : null}
      {tab === "runs" ? (
        runsAll.length === 0 ? (
          <Empty title="No runs yet" />
        ) : (
          <>
            <RunsTable runs={runsAll.slice(0, 60)} />
            {runsAll.length > 60 ? <p className="px-4 py-3 text-12 text-mute md:px-6">Showing the newest 60 of {runsAll.length} calls in the last 30 days. The full ledger is on the Spend page.</p> : null}
          </>
        )
      ) : null}
      {tab === "snapshots" ? <SnapshotsTab monitor={monitor} a={q.a} b={q.b} /> : null}
      {tab === "results" ? <ResultsTab monitor={monitor} /> : null}
      {tab === "settings" ? (
        <div className="max-w-2xl px-4 py-5 md:px-6">
          <dl className="divide-y divide-line border-y border-line text-13">
            {(
              [
                ["Type", KIND_NAME[monitor.kind]],
                ["Target", targetOf(monitor)],
                ["Sources", [...sourcesFor(monitor.kind, monitor.config), ...(monitor.config.screenshotOnChange ? ["screenshot"] : [])].map((s) => SOURCE_NAME[s]).join(", ")],
                ...(monitor.kind === "page" ? [["Reader", monitor.config.reader ?? "jina-reader"], ["Ignore lines containing", (monitor.config.ignore ?? []).join(", ") || "nothing"], ["Watch for", (monitor.config.watchFor ?? []).join(", ") || "nothing"]] : []),
                ...(monitor.kind === "serp" ? [["Depth", `Top ${monitor.config.depth ?? 10}`], ["My domain", monitor.config.myDomain || "not set"]] : []),
                ["Schedule", `${SCHEDULE_LABEL[monitor.schedule]}${monitor.schedule === "daily" || monitor.schedule === "weekly" ? ` at ${String(monitor.runHour).padStart(2, "0")}:00 UTC` : ""}`],
                ["Next run", monitor.nextRunAt ? dateTime(monitor.nextRunAt) : "not scheduled"],
                ["Confirmed max per run", usdPrecise(monitor.maxCostPerRunMicros)],
                ["Monthly cap", usd(monitor.monthlyCapMicros)],
                ["Confirmed", dateTime(monitor.confirmedAt)],
                ["Idempotency key", `mon:${monitor.id}:{source}:{slot}`],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="flex min-h-9 items-center justify-between gap-6 py-1.5">
                <dt className="shrink-0 text-mute">{k}</dt>
                <dd className={cn("min-w-0 break-words text-right", /\d|:|\//.test(v) && "num text-12")}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-12 text-mute">The slot is the schedule boundary, so a retried scheduler tick sends the same key and cannot charge twice.</p>
          <Button asChild className="mt-4">
            <Link href={`/monitors/${id}/edit`}>Edit</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

async function SnapshotsTab({ monitor, a, b }: { monitor: Monitor; a?: string; b?: string }) {
  const { store } = await requireSession();
  const snaps = await store.listSnapshots(monitor.id);
  if (snaps.length === 0) return <Empty title="No snapshots yet" note="The first run stores the page text as the baseline." />;
  const to = snaps.find((s) => s.id === b) ?? snaps[0];
  const from = snaps.find((s) => s.id === a) ?? snaps.find((s) => s.takenAt < to.takenAt) ?? null;
  const [older, newer] = from && from.takenAt > to.takenAt ? [to, from] : [from, to];
  const d = older ? diffPages(older.content, newer.content) : null;
  return (
    <div className="grid gap-6 px-4 py-5 md:px-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <form method="get" className="min-w-0">
        <input type="hidden" name="tab" value="snapshots" />
        <fieldset>
          <legend className="text-12 font-medium">Pick two snapshots to compare</legend>
          <ol className="mt-2 border-l border-line-strong">
            {snaps.map((s, i) => (
              <li key={s.id} className="relative flex min-h-11 items-center gap-2 py-1 pl-4">
                <span className={cn("absolute -left-[4.5px] top-1/2 size-2 -translate-y-1/2 rounded-full border border-panel", s.changed ? "bg-emerald" : "bg-line-strong")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="num block text-12">{dateTime(s.takenAt)}</span>
                  <span className="num block text-11 text-mute">
                    {s.contentHash.slice(0, 7)} · {(s.bytes / 1024).toFixed(1)} kB · <span className="font-sans">{i === snaps.length - 1 ? "baseline" : s.changed ? "changed" : "same"}</span>
                  </span>
                </span>
                <label className="flex size-8 cursor-pointer items-center justify-center" title="Older side">
                  <input type="radio" name="a" value={s.id} defaultChecked={s.id === older?.id} aria-label={`Compare from ${dateTime(s.takenAt)}`} className="accent-[var(--high)]" />
                </label>
                <label className="flex size-8 cursor-pointer items-center justify-center" title="Newer side">
                  <input type="radio" name="b" value={s.id} defaultChecked={s.id === newer.id} aria-label={`Compare to ${dateTime(s.takenAt)}`} className="accent-[var(--emerald)]" />
                </label>
              </li>
            ))}
          </ol>
        </fieldset>
        <Button type="submit" className="mt-3">
          Compare
        </Button>
      </form>
      <div className="min-w-0">
        {d && older ? (
          <>
            <p className="num mb-3 text-13">{d.added + d.removed === 0 ? "These two snapshots have the same text." : summarize(d)}</p>
            <DiffViewer lines={d.lines} beforeLabel={`From · ${dateTime(older.takenAt)}`} afterLabel={`To · ${dateTime(newer.takenAt)}`} defaultView="unified" />
          </>
        ) : (
          <Empty title="Only the baseline so far" note="A second snapshot is stored when the page text changes." className="px-0" />
        )}
      </div>
    </div>
  );
}

async function ResultsTab({ monitor }: { monitor: Monitor }) {
  const { store } = await requireSession();
  const [history, settings] = await Promise.all([store.listSerp(monitor.id, 30), store.getSettings()]);
  if (history.length === 0) return <Empty title="No results stored yet" note="The first run stores the current top results as the baseline." />;
  const latest: SerpResult = history[0];
  const depth = monitor.config.depth ?? 10;
  const tracked = [...new Set([...(monitor.config.myDomain ? [monitor.config.myDomain] : []), ...settings.competitorDomains, ...(monitor.config.competitorDomains ?? [])])];
  const oldestFirst = [...history].reverse();
  const series = tracked.map((domain) => ({ domain, points: oldestFirst.map((h) => h.rows.find((r) => r.domain === domain)?.position ?? null), now: latest.rows.find((r) => r.domain === domain)?.position ?? null })).filter((s) => s.points.some((p) => p !== null));
  return (
    <div className="grid gap-8 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0">
        <h3 className="mb-2 text-12 font-medium text-mute">
          Top {latest.rows.length} at <span className="num">{dateTime(latest.takenAt)}</span>
        </h3>
        <div className="overflow-x-auto rounded-panel border border-line">
          <Table>
            <thead>
              <tr>
                <Th className="w-10 text-right md:first:pl-3">#</Th>
                <Th>Result</Th>
                <Th className="text-right md:last:pr-3">Since last run</Th>
              </tr>
            </thead>
            <tbody>
              {latest.rows.map((r) => {
                const mine = r.domain === monitor.config.myDomain;
                return (
                  <tr key={r.position} className={cn("last:[&>td]:border-0", mine && "bg-brand-soft")}>
                    <Td className="num text-right text-mute md:first:pl-3">{r.position}</Td>
                    <Td className="w-full max-w-0">
                      <span className={cn("block truncate", mine && "font-medium")}>{r.title}</span>
                      <span className="num block truncate text-11 text-mute">
                        {r.url.replace(/^https?:\/\//, "")}
                        {mine ? <span className="font-sans"> · your domain</span> : tracked.includes(r.domain) ? <span className="font-sans"> · competitor</span> : null}
                      </span>
                    </Td>
                    <Td className={cn("num whitespace-nowrap text-right text-12 md:last:pr-3", r.change === null ? "font-medium text-link" : "text-mute")}>{changeLabel(r.change)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-12 font-medium text-mute">Tracked domains, position over {history.length} days</h3>
        {series.length === 0 ? (
          <p className="text-mute">None of your tracked domains is in the results.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {series.map((s) => (
              <li key={s.domain} className="flex items-center gap-3 py-2">
                <span className="num min-w-0 flex-1 truncate text-12">{s.domain}</span>
                <Sparkline points={s.points} depth={depth} />
                <span className="num w-8 text-right text-13 font-medium">{s.now ?? "out"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-11 text-mute">Top of each chart is position 1. A gap means the domain was not in the top {depth}.</p>
      </section>
    </div>
  );
}
