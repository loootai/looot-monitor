import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertDetail, AlertDetailSkeleton } from "@/components/alerts/AlertDetail";
import { InboxClient, type VolumeDay } from "@/components/inbox/InboxClient";
import { ErrorPanel, NoMonitors, RowsSkeleton, forcedState } from "@/components/states";
import { Skeleton } from "@/components/ui/misc";
import { clockTime, dayKey, now } from "@/lib/clock";
import { requireSession } from "@/lib/store";
import type { AlertState } from "@/lib/types";

export const metadata: Metadata = { title: "Inbox" };

function InboxSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading the inbox">
      <div className="flex h-[88px] shrink-0 flex-col justify-center gap-3 border-b border-line bg-panel px-4">
        <Skeleton className="h-6 w-80 max-w-full" />
        <Skeleton className="h-5 w-[28rem] max-w-full" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-full border-line bg-panel md:w-[360px] md:border-r xl:w-[440px]">
          <RowsSkeleton rows={8} height={56} className="[&>div]:px-4" />
        </div>
        <div className="hidden flex-1 bg-panel md:block">
          <AlertDetailSkeleton />
        </div>
      </div>
    </div>
  );
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const forced = forcedState(q.state);
  if (forced === "loading") return <InboxSkeleton />;
  if (forced === "error") return <ErrorPanel code="alerts_load_failed · HTTP 503" message="The inbox could not be loaded." retryHref="/" lastLoaded={clockTime(new Date(now().getTime() - 4 * 60_000))} />;

  const { store } = await requireSession();
  const monitors = forced === "empty" ? [] : await store.listMonitors();
  if (monitors.length === 0) return <NoMonitors />;

  const state: AlertState = q.s === "snoozed" || q.s === "done" ? q.s : "open";
  const at = now();
  const since = new Date(at.getTime() - 30 * 86_400_000).toISOString();
  const [alerts, counts, recent] = await Promise.all([store.listAlerts({ state, limit: 50 }), store.alertCounts(), store.listAlerts({ since, limit: 2000 })]);

  const volume: VolumeDay[] = [];
  const index = new Map<string, VolumeDay>();
  for (let i = 29; i >= 0; i--) {
    const v = { day: dayKey(new Date(at.getTime() - i * 86_400_000)), high: 0, medium: 0, low: 0 };
    volume.push(v);
    index.set(v.day, v);
  }
  for (const a of recent) {
    const v = index.get(dayKey(a.createdAt));
    if (v) v[a.severity]++;
  }

  const selectedId = q.a ?? alerts[0]?.id ?? null;
  return (
    <InboxClient
      key={state}
      alerts={alerts}
      state={state}
      counts={counts}
      monitors={Object.fromEntries(monitors.map((m) => [m.id, { name: m.name, ownerTag: m.ownerTag }]))}
      volume={volume}
      selectedId={selectedId}
      query={q.q ?? ""}
    >
      {selectedId ? (
        <Suspense key={`${selectedId}-${q.cmp ?? ""}-${q.tab ?? ""}`} fallback={<AlertDetailSkeleton />}>
          <AlertDetail store={store} id={selectedId} compareId={q.cmp} tab={q.tab} basePath={`/?${new URLSearchParams({ ...(state !== "open" ? { s: state } : {}), a: selectedId }).toString()}`} />
        </Suspense>
      ) : null}
    </InboxClient>
  );
}
