import type { Metadata } from "next";
import { DigestClient } from "@/components/digest/DigestClient";
import { ErrorPanel, forcedState } from "@/components/states";
import { Skeleton } from "@/components/ui/misc";
import { clockTime, now } from "@/lib/clock";
import { diffPages } from "@/lib/pageDiff";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Digest" };

export default async function DigestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const forced = forcedState((await searchParams).state);
  if (forced === "loading") {
    return (
      <div className="grid min-h-full lg:grid-cols-[320px_minmax(0,1fr)]" aria-busy="true" aria-label="Loading the digest">
        <div className="space-y-5 border-line bg-panel p-6 lg:border-r">
          {[32, 56, 180, 48].map((h, i) => (
            <Skeleton key={i} style={{ height: h }} />
          ))}
        </div>
        <div className="p-6">
          <Skeleton className="mx-auto h-[560px] max-w-[648px]" />
        </div>
      </div>
    );
  }
  if (forced === "error") return <ErrorPanel code="digest_load_failed · HTTP 503" message="The digest could not be built." retryHref="/digest" lastLoaded={clockTime(new Date(now().getTime() - 4 * 60_000))} />;

  const { store } = await requireSession();
  const at = now();
  const weekAgo = new Date(at.getTime() - 7 * 86_400_000).toISOString();
  const dayAgo = new Date(at.getTime() - 86_400_000).toISOString();
  const [alerts, monitors, settings, weekSpend, daySpend] = await Promise.all([forced === "empty" ? Promise.resolve([]) : store.listAlerts({ since: weekAgo, limit: 500 }), store.listMonitors(), store.getSettings(), store.spentSince(weekAgo), store.spentSince(dayAgo)]);

  // A short before and after for each page change: up to three removed and three added lines.
  const changes: Record<string, { removed: string[]; added: string[] }> = {};
  for (const a of alerts.filter((x) => x.kind === "page_change" && x.payload.beforeSnapshotId && x.payload.afterSnapshotId)) {
    const [before, after] = await Promise.all([store.getSnapshot(a.payload.beforeSnapshotId!), store.getSnapshot(a.payload.afterSnapshotId!)]);
    if (!before || !after) continue;
    const d = diffPages(before.content, after.content);
    changes[a.id] = { removed: d.lines.filter((l) => l.type === "del").slice(0, 3).map((l) => l.text), added: d.lines.filter((l) => l.type === "add").slice(0, 3).map((l) => l.text) };
  }

  return (
    <DigestClient
      alerts={alerts}
      monitors={monitors.map((m) => ({ id: m.id, name: m.name }))}
      changes={changes}
      periods={{ daily: { from: dayAgo, to: at.toISOString(), spendMicros: daySpend }, weekly: { from: weekAgo, to: at.toISOString(), spendMicros: weekSpend } }}
      initial={{ period: settings.digestPeriod, severities: settings.digestSeverities, hour: settings.digestHour }}
    />
  );
}
