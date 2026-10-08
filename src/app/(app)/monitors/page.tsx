import type { Metadata } from "next";
import { MonitorsTable, type MonitorRow } from "@/components/monitors/MonitorsTable";
import { ErrorPanel, NoMonitors, RowsSkeleton, forcedState } from "@/components/states";
import { clockTime, now } from "@/lib/clock";
import { monthStart } from "@/lib/schedule";
import { canRun } from "@/lib/service";
import { sourcesFor } from "@/lib/sources";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Monitors" };

export default async function MonitorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const forced = forcedState(q.state);
  if (forced === "loading") return <RowsSkeleton rows={10} height={40} />;
  if (forced === "error") return <ErrorPanel code="monitors_load_failed · HTTP 503" message="Monitors could not be loaded." retryHref="/monitors" lastLoaded={clockTime(new Date(now().getTime() - 4 * 60_000))} />;
  const { store } = await requireSession();
  const monitors = forced === "empty" ? [] : await store.listMonitors();
  if (monitors.length === 0) return <NoMonitors />;

  const month = monthStart(now()).toISOString();
  const [counts, rows] = await Promise.all([
    store.alertCounts(),
    Promise.all(
      monitors.map(async (m): Promise<MonitorRow> => {
        const [monthMicros, last] = await Promise.all([store.spentSince(month, m.id), store.listRuns({ monitorId: m.id, limit: 8 })]);
        const latest = last.filter((r) => r.slot === last[0]?.slot);
        const failed = latest.length > 0 && latest.every((r) => r.status === "failed");
        const blocked = latest.find((r) => r.status === "blocked_budget" || r.status === "blocked_price");
        const found = latest.reduce((n, r) => n + r.newItems, 0);
        return {
          ...m,
          sources: [...sourcesFor(m.kind, m.config), ...(m.config.screenshotOnChange ? (["screenshot"] as const) : [])],
          openAlerts: 0,
          monthMicros,
          lastResult: latest.length === 0 ? "no runs yet" : blocked ? "refused, no call made" : failed ? `failed · ${latest[0].errorCode ?? "error"}` : found > 0 ? `${found} new` : "nothing new",
        };
      }),
    ),
  ]);
  return <MonitorsTable rows={rows.map((r) => ({ ...r, openAlerts: counts.openByMonitor[r.id] ?? 0 }))} canRun={canRun()} initialRunId={q.run} />;
}
