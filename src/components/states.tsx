import Link from "next/link";
import { FileDiff, Newspaper, Plus, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export const STARTERS = [
  { icon: Newspaper, title: "Track my brand in the news", note: "News, X, Reddit and LinkedIn. From $0.0010 a check.", href: "/monitors/new?kind=mention" },
  { icon: FileDiff, title: "Watch a competitor's pricing page", note: "A text diff when the page changes. $0.0002 a check.", href: "/monitors/new?kind=page" },
  { icon: Search, title: "Watch a Google query", note: "New domains and position moves. $0.0010 a check.", href: "/monitors/new?kind=serp" },
];

/** The empty state shared by the inbox and the monitors page: one line, one button, three starters. */
export function NoMonitors({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-xl px-4 py-12 md:py-20", className)}>
      <h2 className="text-16 font-medium">No monitors yet</h2>
      <p className="mt-1 text-mute">A monitor checks one thing on a schedule and tells you what changed. You see the price before anything runs.</p>
      <Button asChild variant="primary" className="mt-4">
        <Link href="/monitors/new">
          <Plus /> Create a monitor
        </Link>
      </Button>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {STARTERS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="group flex min-h-14 items-center gap-3 px-1 py-2 hover:bg-hover">
              <s.icon className="size-4 shrink-0 text-mute" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.title}</span>
                <span className="block text-12 text-mute">{s.note}</span>
              </span>
              <span className="text-12 text-link opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100">Start</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A short, plain empty state for a section. */
export function Empty({ title, note, children, className }: { title: string; note?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-4 py-10 md:px-6", className)}>
      <p className="font-medium">{title}</p>
      {note ? <p className="mt-0.5 max-w-prose text-mute">{note}</p> : null}
      {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

/** Inline error with the code, a retry link and when data last loaded. */
export function ErrorPanel({ code, message, retryHref, lastLoaded, className }: { code: string; message: string; retryHref: string; lastLoaded?: string; className?: string }) {
  return (
    <div role="alert" className={cn("m-4 rounded-panel border border-high bg-high-soft p-4 md:m-6", className)}>
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-high" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{message}</p>
          <p className="num mt-1 text-12 text-mute">
            {code}
            {lastLoaded ? ` · last loaded ${lastLoaded}` : ""}
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href={retryHref}>Retry</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Rows of fixed height, so nothing shifts when the data lands. */
export function RowsSkeleton({ rows = 8, height = 56, className }: { rows?: number; height?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-line", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 md:px-6" style={{ height }}>
          <Skeleton className="size-4" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3" style={{ width: `${68 - ((i * 13) % 30)}%` }} />
            {height > 40 ? <Skeleton className="h-2.5" style={{ width: `${34 + ((i * 7) % 18)}%` }} /> : null}
          </div>
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

/** Four numbers and a chart block, the shape of the spend and monitor pages. */
export function StatsSkeleton({ chart = 240 }: { chart?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 border-b border-line md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 border-line px-4 py-4 md:border-l md:px-6 md:first:border-l-0">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
      <div className="px-4 py-5 md:px-6">
        <Skeleton className="w-full" style={{ height: chart }} />
      </div>
    </div>
  );
}

/** Reads ?state= in demo mode only, so a reviewer can force each state. */
export function forcedState(state: string | string[] | undefined): "loading" | "empty" | "error" | null {
  if (process.env.NEXT_PUBLIC_DEMO !== "1") return null;
  return state === "loading" || state === "empty" || state === "error" ? state : null;
}
