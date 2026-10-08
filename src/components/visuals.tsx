import { AtSign, BriefcaseBusiness, CircleAlert, FileDiff, Gauge, MessagesSquare, Newspaper, Search, Star, TriangleAlert, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonitorKind, MonitorStatus, Severity } from "@/lib/types";

const SOURCE_ICON: Record<string, LucideIcon> = { news: Newspaper, google: Search, page: FileDiff, screenshot: FileDiff, x: AtSign, reddit: MessagesSquare, linkedin: BriefcaseBusiness, maps_reviews: Star, appstore_reviews: Star, reviews: Star, system: Gauge };
export const SOURCE_NAME: Record<string, string> = { news: "News", google: "Google", page: "Page", screenshot: "Screenshot", x: "X", reddit: "Reddit", linkedin: "LinkedIn", maps_reviews: "Maps reviews", appstore_reviews: "App Store", reviews: "Reviews", system: "System" };
export const KIND_NAME: Record<MonitorKind, string> = { mention: "Mentions", serp: "Google results", page: "Page change", reviews: "Reviews" };
export const KIND_ICON: Record<MonitorKind, LucideIcon> = { mention: Newspaper, serp: Search, page: FileDiff, reviews: Star };

export function SourceIcon({ source, className }: { source: string; className?: string }) {
  const Icon = SOURCE_ICON[source] ?? Newspaper;
  return <Icon className={cn("size-4 shrink-0 text-mute", className)} aria-label={SOURCE_NAME[source] ?? source} />;
}

export const SEV_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };
const SEV_ICON: Record<Severity, LucideIcon> = { high: TriangleAlert, medium: CircleAlert, low: Minus };
const SEV_TEXT: Record<Severity, string> = { high: "text-high", medium: "text-medium", low: "text-low" };
const SEV_BG: Record<Severity, string> = { high: "bg-high", medium: "bg-medium", low: "bg-low" };
const SEV_SOFT: Record<Severity, string> = { high: "bg-high-soft text-high", medium: "bg-medium-soft text-medium", low: "bg-low-soft text-low" };

/** Severity as an icon and a word. Colour is never the only signal. */
export function SeverityTag({ severity, className, soft }: { severity: Severity; className?: string; soft?: boolean }) {
  const Icon = SEV_ICON[severity];
  return (
    <span className={cn("inline-flex items-center gap-1 text-12 font-medium", soft ? cn("h-5 rounded px-1.5 text-11", SEV_SOFT[severity]) : SEV_TEXT[severity], className)}>
      <Icon className="size-3.5" aria-hidden />
      {SEV_LABEL[severity]}
    </span>
  );
}

/** The 3 px bar on the left edge of an alert row. */
export function SeverityBar({ severity, className }: { severity: Severity; className?: string }) {
  return <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", SEV_BG[severity], className)} />;
}

export const STATUS_LABEL: Record<MonitorStatus, string> = { active: "Active", paused: "Paused", paused_budget: "Paused, budget reached", failing: "Failing" };
const STATUS_DOT: Record<MonitorStatus, string> = { active: "bg-emerald", paused: "bg-faint", paused_budget: "bg-amber", failing: "bg-high" };

export function StatusDot({ status, className }: { status: MonitorStatus; className?: string }) {
  return <span role="img" aria-label={STATUS_LABEL[status]} className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[status], className)} />;
}

/** A thin spend-over-cap bar. Turns amber at 80% and red at the cap. */
export function CapBar({ spent, cap, className }: { spent: number; cap: number; className?: string }) {
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  return (
    <span className={cn("block h-1 w-16 overflow-hidden rounded-full bg-line", className)} role="img" aria-label={`${Math.round(pct)}% of cap`}>
      <span className={cn("block h-full rounded-full", pct >= 97 ? "bg-high" : pct >= 80 ? "bg-amber" : "bg-emerald")} style={{ width: `${Math.max(pct, spent > 0 ? 4 : 0)}%` }} />
    </span>
  );
}

/** A rating as a number with one star, for example 1.0. */
export function Rating({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("num inline-flex items-center gap-0.5 text-12", value <= 2 ? "text-high" : value === 3 ? "text-medium" : "text-mute", className)} aria-label={`${value} out of 5 stars`}>
      <Star className="size-3 fill-current" aria-hidden />
      {value}
    </span>
  );
}
