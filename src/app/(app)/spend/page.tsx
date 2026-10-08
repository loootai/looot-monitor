import type { Metadata } from "next";
import Link from "next/link";
import { BarChart, type BarDatum } from "@/components/BarChart";
import { Ledger } from "@/components/spend/Ledger";
import { Empty, ErrorPanel, RowsSkeleton, StatsSkeleton, forcedState } from "@/components/states";
import { Table, Td, Th } from "@/components/ui/misc";
import { CapBar } from "@/components/visuals";
import { IS_DEMO, clockTime, dayLabel, now, shortDate } from "@/lib/clock";
import { usd, usdPrecise } from "@/lib/money";
import { fetchPrices } from "@/lib/prices";
import { buildQuote } from "@/lib/quote";
import { monthStart, nextMonthStart } from "@/lib/schedule";
import { KINDS, KIND_LABEL, summarizeSpend } from "@/lib/spend";
import { requireSession } from "@/lib/store";
import type { MonitorKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Spend" };

const KIND_COLOR: Record<MonitorKind, string> = { mention: "var(--k1)", page: "var(--k2)", serp: "var(--k3)", reviews: "var(--k4)" };

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="border-line px-4 py-3 md:border-l md:px-6 md:first:border-l-0">
      <dt className="text-11 text-mute">{label}</dt>
      <dd className="num mt-0.5 text-20 font-medium tracking-tight">{value}</dd>
      {sub ? <dd className="num text-11 text-mute">{sub}</dd> : null}
    </div>
  );
}

export default async function SpendPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const forced = forcedState(q.state);
  if (forced === "loading") {
    return (
      <>
        <StatsSkeleton chart={240} />
        <RowsSkeleton rows={6} height={32} />
      </>
    );
  }
  if (forced === "error") return <ErrorPanel code="spend_load_failed · HTTP 503" message="Spend could not be loaded." retryHref="/spend" lastLoaded={clockTime(new Date(now().getTime() - 4 * 60_000))} />;

  const { store } = await requireSession();
  const at = now();
  const days = q.range === "7" ? 7 : q.range === "90" ? 90 : 30;
  const since = new Date(Math.min(at.getTime() - days * 86_400_000, monthStart(at).getTime())).toISOString();
  const [runs, monitors, alerts, settings, prices] = await Promise.all([forced === "empty" ? Promise.resolve([]) : store.listRuns({ since }), store.listMonitors(), store.listAlerts({ since, limit: 5000 }), store.getSettings(), fetchPrices(undefined, { demo: IS_DEMO })]);
  if (runs.length === 0) return <Empty title="No paid calls yet" note="Your first run will show here, with what it cost and what it found." />;

  const perRunMicros = Object.fromEntries(monitors.map((m) => [m.id, buildQuote(m.kind, m.config, m.schedule, prices.prices, prices.pricesAsOf).perRunMicros]));
  const s = summarizeSpend({ runs, monitors, alerts, now: at, days, prices: prices.prices, perRunMicros });
  const left = settings.workspaceCapMicros - s.monthMicros;
  const maxDay = Math.max(...s.daily.map((d) => d.total), 1);
  const data: BarDatum[] = s.daily.map((d) => ({ key: d.day, label: dayLabel(d.day, at), segs: KINDS.map((k) => ({ name: KIND_LABEL[k], value: d.byKind[k], color: KIND_COLOR[k], text: usdPrecise(d.byKind[k]) })), notes: [`${usd(d.total)} total · ${d.calls} calls${d.failed ? `, ${d.failed} failed` : ""}`] }));
  const names = Object.fromEntries(monitors.map((m) => [m.id, m.name]));

  return (
    <div className="bg-panel md:min-h-full">
      <dl className="grid grid-cols-2 border-b border-line md:grid-cols-4">
        <Stat label={`Spent in ${shortDate(monthStart(at)).split(" ")[0]}`} value={usd(s.monthMicros)} sub={`since ${shortDate(monthStart(at))}`} />
        <Stat label="Projected month end" value={usd(s.projectedMicros)} sub={`resets ${shortDate(nextMonthStart(at))}`} />
        <Stat label="Workspace cap" value={usd(settings.workspaceCapMicros)} sub={<span className={cn(left < 0 && "text-high")}>{usd(Math.max(0, left))} left</span>} />
        <Stat label="Cost per alert" value={s.costPerAlertMicros === null ? "none yet" : usdPrecise(s.costPerAlertMicros)} sub={`${s.alertsFound} alerts in ${days} days`} />
      </dl>

      <section aria-labelledby="chart-h" className="border-b border-line px-4 py-4 md:px-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="chart-h" className="text-12 font-medium">
            Daily spend by monitor type <span className="num font-normal text-mute">{usd(s.totalMicros)} in {days} days</span>
          </h2>
          <nav aria-label="Range" className="inline-flex h-9 items-center rounded-control border border-line-strong p-0.5 md:h-7">
            {[7, 30, 90].map((r) => (
              <Link key={r} href={r === 30 ? "/spend" : `/spend?range=${r}`} scroll={false} aria-current={days === r ? "page" : undefined} className={cn("num flex h-full items-center rounded-[4px] px-2.5 text-12 text-mute hover:text-ink", days === r && "bg-brand-soft font-medium text-link")}>
                {r}d
              </Link>
            ))}
          </nav>
        </div>
        <BarChart data={data} height={240} ariaLabel={`Daily spend for the last ${days} days, stacked by monitor type`} maxLabel={usd(maxDay)} legend={KINDS.map((k) => ({ name: KIND_LABEL[k], color: KIND_COLOR[k] }))} rule={{ value: s.dailyAverageMicros, label: `Daily average ${usd(s.dailyAverageMicros)}` }} />
      </section>

      <div className="grid xl:grid-cols-2 xl:divide-x xl:divide-line">
        <section aria-labelledby="bym-h" className="min-w-0 border-b border-line">
          <h2 id="bym-h" className="px-4 pb-2 pt-5 text-12 font-medium md:px-6">
            By monitor
          </h2>
          <div className="overflow-x-auto">
            <Table className="min-w-[540px] [&_td]:px-2 [&_th]:px-2">
              <thead>
                <tr>
                  <Th>Monitor</Th>
                  <Th className="text-right">Runs</Th>
                  <Th className="text-right">Calls</Th>
                  <Th className="text-right">Spend</Th>
                  <Th>Month / cap</Th>
                  <Th className="text-right">Per alert</Th>
                </tr>
              </thead>
              <tbody>
                {s.byMonitor.map((m) => (
                  <tr key={m.monitorId} className="hover:bg-hover">
                    <Td className="max-w-44 truncate">
                      <Link href={`/monitors/${m.monitorId}`} className="hover:underline">
                        {m.name}
                      </Link>
                    </Td>
                    <Td className="num text-right text-mute">{m.runs}</Td>
                    <Td className="num text-right text-mute">{m.calls}</Td>
                    <Td className="num text-right">{usd(m.spendMicros)}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <CapBar spent={m.monthMicros} cap={m.capMicros} className="w-12" />
                        <span className="num whitespace-nowrap text-12 text-mute">{m.capMicros > 0 ? `${Math.round((m.monthMicros / m.capMicros) * 100)}%` : ""}</span>
                      </span>
                    </Td>
                    <Td className="num text-right text-mute">{m.costPerAlertMicros === null ? "" : usdPrecise(m.costPerAlertMicros)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <Td className="border-0 font-medium">Total</Td>
                  <Td className="num border-0 text-right">{s.byMonitor.reduce((n, m) => n + m.runs, 0)}</Td>
                  <Td className="num border-0 text-right">{s.byMonitor.reduce((n, m) => n + m.calls, 0)}</Td>
                  <Td className="num border-0 text-right font-medium">{usd(s.byMonitor.reduce((n, m) => n + m.spendMicros, 0))}</Td>
                  <Td className="border-0" colSpan={2} />
                </tr>
              </tfoot>
            </Table>
          </div>
        </section>
        <section aria-labelledby="bye-h" className="min-w-0 border-b border-line">
          <h2 id="bye-h" className="px-4 pb-2 pt-5 text-12 font-medium md:px-6">
            By endpoint
          </h2>
          <div className="overflow-x-auto">
            <Table className="min-w-[540px] [&_td]:px-2 [&_th]:px-2">
              <thead>
                <tr>
                  <Th>Endpoint</Th>
                  <Th>looot job</Th>
                  <Th className="text-right">Calls</Th>
                  <Th className="text-right">Failed</Th>
                  <Th className="text-right">Price now</Th>
                  <Th className="text-right">Spend</Th>
                </tr>
              </thead>
              <tbody>
                {s.byEndpoint.map((e) => (
                  <tr key={e.endpointId} className="hover:bg-hover">
                    <Td className="num max-w-44 truncate text-12" title={e.endpointId}>
                      {e.endpointId}
                    </Td>
                    <Td className="num max-w-40 truncate text-12 text-mute" title={e.jobId}>
                      {e.jobId}
                    </Td>
                    <Td className="num text-right text-mute">{e.calls}</Td>
                    <Td className={cn("num text-right", e.failed > 0 ? "text-high" : "text-faint")}>{e.failed}</Td>
                    <Td className="num text-right text-mute">{usdPrecise(e.priceMicros)}</Td>
                    <Td className="num text-right">{usd(e.spendMicros)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <Td className="border-0 font-medium" colSpan={2}>
                    Total
                  </Td>
                  <Td className="num border-0 text-right">{s.byEndpoint.reduce((n, e) => n + e.calls, 0)}</Td>
                  <Td className="num border-0 text-right">{s.byEndpoint.reduce((n, e) => n + e.failed, 0)}</Td>
                  <Td className="border-0" />
                  <Td className="num border-0 text-right font-medium">{usd(s.byEndpoint.reduce((n, e) => n + e.spendMicros, 0))}</Td>
                </tr>
              </tfoot>
            </Table>
          </div>
        </section>
      </div>

      <Ledger initial={runs.slice(0, 25)} monitorNames={names} />
    </div>
  );
}
