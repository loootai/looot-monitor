import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { AlertActions } from "@/components/alerts/AlertActions";
import { DiffViewer } from "@/components/alerts/DiffViewer";
import { ScreenshotCompare } from "@/components/alerts/ScreenshotCompare";
import { Empty } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton, Table, Td, Th } from "@/components/ui/misc";
import { Rating, SeverityTag, SourceIcon, SOURCE_NAME } from "@/components/visuals";
import { clockTime, dateTime, relative, shortDate } from "@/lib/clock";
import { usdPrecise } from "@/lib/money";
import { diffPages, summarize } from "@/lib/pageDiff";
import { markTerms } from "@/lib/query";
import { changeLabel } from "@/lib/serpDiff";
import type { Store } from "@/lib/store/types";
import type { Alert, Monitor, Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AlertDetailSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6" aria-busy="true" aria-label="Loading alert">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** The reading pane for one alert. Used in the inbox and as its own page on phones. */
export async function AlertDetail({ store, id, compareId, tab, basePath }: { store: Store; id: string; compareId?: string; tab?: string; basePath: string }) {
  const alert = await store.getAlert(id);
  if (!alert) return <Empty title="This alert was deleted" note="It may have been removed with its monitor." />;
  const monitor = await store.getMonitor(alert.monitorId);
  const run = alert.runId ? (await store.listRuns({ monitorId: alert.monitorId, since: alert.createdAt, before: new Date(new Date(alert.createdAt).getTime() + 1000).toISOString(), limit: 20 })).find((r) => r.id === alert.runId) : undefined;
  const sep = basePath.includes("?") ? "&" : "?";
  return (
    <article className="mx-auto w-full max-w-4xl px-4 py-4 md:px-6 md:py-5">
      <header className="border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-mute">
          <SeverityTag severity={alert.severity} soft />
          <span className="inline-flex items-center gap-1">
            <SourceIcon source={alert.source} className="size-3.5" /> {SOURCE_NAME[alert.source] ?? alert.source}
          </span>
          {monitor ? (
            <Link href={`/monitors/${monitor.id}`} className="text-link underline-offset-2 hover:underline">
              {monitor.name}
            </Link>
          ) : null}
          <span className="num" title={alert.createdAt}>
            First seen {dateTime(alert.createdAt)}
          </span>
        </div>
        <h2 className="mt-2 text-balance text-16 font-medium leading-6">{alert.title}</h2>
        {alert.url ? (
          <a href={alert.url} target="_blank" rel="noopener noreferrer" className="num mt-1 inline-flex max-w-full items-center gap-1 text-12 text-link underline-offset-2 hover:underline">
            <span className="truncate">{alert.url.replace(/^https?:\/\//, "")}</span>
            <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
          </a>
        ) : null}
        <p className="mt-3 text-12 text-mute">
          Why this severity: <span className={cn("font-medium", alert.severity === "high" ? "text-high" : alert.severity === "medium" ? "text-medium" : "text-ink")}>{alert.severityReason}</span>
        </p>
        <div className="mt-3">
          <AlertActions id={alert.id} severity={alert.severity} state={alert.state} />
        </div>
      </header>

      <div className="py-5 text-14 leading-[22px]">
        {alert.kind === "page_change" ? <PageBody store={store} alert={alert} compareId={compareId} tab={tab} href={(extra) => `${basePath}${extra ? `${sep}${extra}` : ""}`} /> : null}
        {alert.kind === "mention" ? <MentionBody store={store} alert={alert} /> : null}
        {alert.kind === "serp_new" || alert.kind === "serp_move" ? <SerpBody alert={alert} /> : null}
        {alert.kind === "review" ? <ReviewBody alert={alert} /> : null}
        {alert.kind === "system" ? <SystemBody alert={alert} monitor={monitor} /> : null}
      </div>

      <footer className="num border-t border-line pt-3 text-11 text-mute">
        {run ? (
          <Link href={`/monitors/${alert.monitorId}?tab=runs`} className="underline-offset-2 hover:text-ink hover:underline">
            Found by run {(run.loootRunId ?? run.id).slice(0, 12)}... at {clockTime(run.startedAt)}, cost {usdPrecise(run.actualCostMicros)}
          </Link>
        ) : (
          <span>Written by the scheduler at {clockTime(alert.createdAt)}. No looot call was made.</span>
        )}
      </footer>
    </article>
  );
}

async function PageBody({ store, alert, compareId, tab, href }: { store: Store; alert: Alert; compareId?: string; tab?: string; href: (extra?: string) => string }) {
  const p = alert.payload;
  const after = p.afterSnapshotId ? await store.getSnapshot(p.afterSnapshotId) : null;
  const all = await store.listSnapshots(alert.monitorId);
  const older = after ? all.filter((s) => s.takenAt < after.takenAt) : [];
  const before: Snapshot | null = (compareId ? older.find((s) => s.id === compareId) : null) ?? (p.beforeSnapshotId ? await store.getSnapshot(p.beforeSnapshotId) : null);
  const summary = summarize({ added: p.added ?? 0, removed: p.removed ?? 0, priceChanges: p.priceChanges ?? [] });
  if (!after || !before) {
    return (
      <>
        <p className="num text-13">{summary}</p>
        <p className="mt-2 text-13 text-mute">The older snapshot was removed by the retention rule.</p>
      </>
    );
  }
  const d = diffPages(before.content, after.content);
  const custom = before.id !== p.beforeSnapshotId;
  const hasShots = Boolean(before.screenshotUrl && after.screenshotUrl);
  const showShots = tab === "screenshots" && hasShots;
  return (
    <div className="space-y-5">
      <p className="num text-13">{custom ? summarize(d) : summary}</p>
      {d.priceChanges.length > 0 ? (
        <div className="overflow-hidden rounded-panel border border-line">
          <Table>
            <caption className="sr-only">Price changes found on the page</caption>
            <thead>
              <tr>
                <Th className="md:first:pl-3">Price</Th>
                <Th className="text-right">Before</Th>
                <Th className="text-right">After</Th>
                <Th className="text-right md:last:pr-3">Change</Th>
              </tr>
            </thead>
            <tbody>
              {d.priceChanges.map((c, i) => (
                <tr key={i} className="last:[&>td]:border-0">
                  <Td className="font-medium md:first:pl-3">{c.label}</Td>
                  <Td className="num text-right text-mute line-through">{c.before}</Td>
                  <Td className="num text-right font-medium">{c.after}</Td>
                  <Td className={cn("num text-right md:last:pr-3", (c.pct ?? 0) > 0 ? "text-high" : "text-mute")}>{c.pct === null ? "" : `${c.pct > 0 ? "+" : ""}${c.pct.toFixed(1)}%`}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}
      {p.watchHits && p.watchHits.length > 0 ? (
        <p className="text-13">
          <span className="text-mute">Watch phrase in the change: </span>
          {p.watchHits.map((w) => (
            <span key={w} className="mr-1 rounded bg-medium-soft px-1.5 py-0.5 text-12 text-medium">
              {w}
            </span>
          ))}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Change views" className="flex gap-4 text-13">
          <Link role="tab" aria-selected={!showShots} href={href(compareId ? `cmp=${compareId}` : undefined)} scroll={false} className={cn("border-b-2 border-transparent pb-1 text-mute hover:text-ink", !showShots && "border-brand font-medium text-ink")}>
            Text
          </Link>
          {hasShots ? (
            <Link role="tab" aria-selected={showShots} href={href("tab=screenshots")} scroll={false} className={cn("border-b-2 border-transparent pb-1 text-mute hover:text-ink", showShots && "border-brand font-medium text-ink")}>
              Screenshots
            </Link>
          ) : null}
        </div>
        {older.length > 1 && !showShots ? (
          <details className="group relative">
            <summary className="flex h-8 list-none items-center gap-1 rounded-control border border-line-strong bg-panel px-2 text-12 hover:bg-hover [&::-webkit-details-marker]:hidden">
              Compare with <span className="num text-mute">{dateTime(before.takenAt)}</span>
              <ChevronDown className="size-3.5 text-mute transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="pop absolute right-0 z-20 mt-1 max-h-64 w-60 overflow-y-auto rounded-panel border border-line bg-panel p-1 shadow-pop">
              {older.map((s) => (
                <li key={s.id}>
                  <Link href={href(s.id === p.beforeSnapshotId ? undefined : `cmp=${s.id}`)} scroll={false} className={cn("num flex h-8 items-center justify-between rounded-[4px] px-2 text-12 hover:bg-hover", s.id === before.id && "bg-hover font-medium")}>
                    {dateTime(s.takenAt)}
                    <span className="text-faint">{s.contentHash.slice(0, 7)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      {showShots ? (
        <ScreenshotCompare before={before.screenshotUrl!} after={after.screenshotUrl!} beforeLabel={dateTime(before.takenAt)} afterLabel={dateTime(after.takenAt)} />
      ) : (
        <DiffViewer lines={d.lines} beforeLabel={`Previous · ${dateTime(before.takenAt)}`} afterLabel={`Current · ${dateTime(after.takenAt)}`} />
      )}
    </div>
  );
}

async function MentionBody({ store, alert }: { store: Store; alert: Alert }) {
  const p = alert.payload;
  const others = alert.domain ? (await store.listAlerts({ limit: 200 })).filter((a) => a.domain === alert.domain && a.id !== alert.id).slice(0, 5) : [];
  return (
    <div className="space-y-5">
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-13">
        {p.outlet ? <Meta label={alert.source === "reddit" ? "Community" : "Outlet"} value={p.outlet} /> : null}
        {alert.author ? <Meta label="Author" value={alert.author} /> : null}
        {alert.publishedAt ? <Meta label="Published" value={dateTime(alert.publishedAt)} mono /> : null}
        {p.engagement !== undefined ? <Meta label={p.engagementLabel ? p.engagementLabel[0].toUpperCase() + p.engagementLabel.slice(1) : "Engagement"} value={String(p.engagement)} mono /> : null}
      </dl>
      {alert.snippet ? (
        <blockquote className="max-w-[68ch] border-l-2 border-line-strong pl-4 text-14 leading-[22px]">
          {markTerms(alert.snippet, p.matched ?? []).map((part, i) =>
            part.hit ? (
              <mark key={i} className="rounded-[2px] bg-add-mark px-0.5 text-ink">
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </blockquote>
      ) : null}
      {others.length > 0 ? (
        <section>
          <h3 className="text-12 font-medium text-mute">Other alerts from {alert.domain}</h3>
          <ul className="mt-1 divide-y divide-line border-y border-line">
            {others.map((o) => (
              <li key={o.id}>
                <Link href={`/alerts/${o.id}`} className="flex min-h-9 items-center gap-3 py-1.5 text-13 hover:bg-hover">
                  <SeverityTag severity={o.severity} className="w-16 shrink-0 text-11" />
                  <span className="min-w-0 flex-1 truncate">{o.title}</span>
                  <span className="num shrink-0 text-11 text-mute">{shortDate(o.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-11 text-mute">{label}</dt>
      <dd className={cn("font-medium", mono && "num font-normal")}>{value}</dd>
    </div>
  );
}

function SerpBody({ alert }: { alert: Alert }) {
  const p = alert.payload;
  return (
    <div className="space-y-5">
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-13">
        <Meta label="Query" value={p.query ?? ""} />
        <Meta label="Position" value={String(p.position ?? "")} mono />
        <Meta label="Before" value={p.previousPosition ? String(p.previousPosition) : "not in the results"} mono={Boolean(p.previousPosition)} />
      </dl>
      {alert.snippet ? <p className="max-w-[68ch] text-mute">{alert.snippet}</p> : null}
      {p.top && p.top.length > 0 ? (
        <section>
          <h3 className="mb-1 text-12 font-medium text-mute">Top {p.top.length} at {dateTime(alert.createdAt)}</h3>
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
                {p.top.map((r) => {
                  const here = r.domain === alert.domain;
                  return (
                    <tr key={r.position} className={cn("last:[&>td]:border-0", here && "bg-brand-soft")}>
                      <Td className="num text-right text-mute md:first:pl-3">{r.position}</Td>
                      <Td className="max-w-0 w-full">
                        <span className={cn("block truncate", here && "font-medium")}>{r.title}</span>
                        <span className="num block truncate text-11 text-mute">{r.url.replace(/^https?:\/\//, "")}</span>
                      </Td>
                      <Td className={cn("num whitespace-nowrap text-right text-12 md:last:pr-3", r.change === null ? "font-medium text-link" : "text-mute")}>{changeLabel(r.change)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReviewBody({ alert }: { alert: Alert }) {
  const p = alert.payload;
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <p className="num text-[40px] font-medium leading-none tracking-tight">
          {p.rating ?? "?"}
          <span className="text-16 text-mute"> / 5</span>
        </p>
        {p.rating !== undefined ? <Rating value={p.rating} className="pb-1" /> : null}
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-13">
        {alert.author ? <Meta label="Reviewer" value={alert.author} /> : null}
        {p.platform ? <Meta label="Platform" value={p.platform} /> : null}
        {alert.publishedAt ? <Meta label="Posted" value={`${dateTime(alert.publishedAt)} (${relative(alert.publishedAt)})`} mono /> : null}
      </dl>
      {alert.snippet ? <p className="max-w-[68ch]">{alert.snippet}</p> : null}
      {alert.url ? (
        <Button asChild size="sm">
          <a href={alert.url} target="_blank" rel="noopener noreferrer">
            Open the listing <ArrowUpRight />
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function SystemBody({ alert, monitor }: { alert: Alert; monitor: Monitor | null }) {
  return (
    <div className="space-y-4">
      {alert.snippet ? <p className="max-w-[68ch]">{alert.snippet}</p> : null}
      {monitor ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="primary">
            <Link href={`/monitors/${monitor.id}`}>{monitor.status === "paused_budget" ? "Raise cap" : "Open the monitor"}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/monitors/${monitor.id}?tab=runs`}>See its runs</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
