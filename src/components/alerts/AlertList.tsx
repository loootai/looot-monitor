import Link from "next/link";
import { Rating, SeverityBar, SEV_LABEL, SourceIcon } from "@/components/visuals";
import { relative } from "@/lib/clock";
import type { Alert } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A plain list of alert rows that link to the alert. Used on the monitor page. */
export function AlertList({ alerts }: { alerts: Alert[] }) {
  return (
    <ul className="divide-y divide-line">
      {alerts.map((a) => (
        <li key={a.id} className="relative">
          <SeverityBar severity={a.severity} />
          <Link href={`/alerts/${a.id}`} className="flex min-h-14 items-center gap-3 py-2 pl-4 pr-4 hover:bg-hover md:pl-6 md:pr-6">
            <SourceIcon source={a.source} />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate", !a.readAt && a.state === "open" && "font-medium")}>{a.title}</span>
              <span className="flex items-center gap-1.5 text-12 text-mute">
                <span className={cn("text-11 font-medium", a.severity === "high" ? "text-high" : a.severity === "medium" ? "text-medium" : "text-low")}>{SEV_LABEL[a.severity]}</span>
                <span className="truncate">
                  {a.severityReason}
                  {a.state !== "open" ? ` · ${a.state}` : ""}
                </span>
              </span>
            </span>
            {a.kind === "page_change" ? (
              <span className="num shrink-0 text-11">
                <span className="text-emerald">+{a.payload.added ?? 0}</span> <span className="text-faint">/</span> <span className="text-high">-{a.payload.removed ?? 0}</span>
              </span>
            ) : null}
            {a.kind === "review" && a.payload.rating !== undefined ? <Rating value={a.payload.rating} className="shrink-0" /> : null}
            <span className="w-14 shrink-0 text-right text-11 tabular-nums text-mute">{relative(a.createdAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
