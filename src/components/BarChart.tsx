"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface BarSeg {
  name: string;
  value: number;
  /** A CSS colour, usually a var(). */
  color: string;
  /** Text shown in the tooltip instead of the raw value. */
  text?: string;
}

export interface BarDatum {
  key: string;
  label: string;
  segs: BarSeg[];
  /** Extra tooltip lines under the segments. */
  notes?: string[];
}

interface Props {
  data: BarDatum[];
  height: number;
  ariaLabel: string;
  /** Top of the left axis, as text. */
  maxLabel: string;
  /** A dashed horizontal line, in the units of the bars. */
  rule?: { value: number; label: string };
  /** A dashed line over the bars on its own axis, one point per bar, 0 to 1. */
  line?: { points: number[]; label: string; topLabel: string };
  legend?: { name: string; color: string }[];
  className?: string;
}

/** Stacked bars with a hover and focus tooltip. Bars have a 2 px top radius and 1 px gaps, with one faint baseline. */
export function BarChart({ data, height, ariaLabel, maxLabel, rule, line, legend, className }: Props) {
  const [at, setAt] = React.useState<number | null>(null);
  const totals = data.map((d) => d.segs.reduce((n, s) => n + s.value, 0));
  const max = Math.max(...totals, rule?.value ?? 0, 1e-9);
  const ticks = data.length <= 10 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 3), Math.floor(((data.length - 1) * 2) / 3), data.length - 1];
  const cur = at !== null ? data[at] : null;
  return (
    <figure className={cn("min-w-0", className)}>
      {legend ? (
        <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-11 text-mute">
          {legend.map((l) => (
            <span key={l.name} className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: l.color }} aria-hidden />
              {l.name}
            </span>
          ))}
          {line ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t border-dashed border-ink" aria-hidden />
              {line.label}
            </span>
          ) : null}
          {rule ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t border-dashed border-mute" aria-hidden />
              {rule.label}
            </span>
          ) : null}
        </figcaption>
      ) : null}
      <div className="relative" onMouseLeave={() => setAt(null)}>
        <div className="num pointer-events-none absolute left-0 top-0 z-10 text-11 text-faint">{maxLabel}</div>
        {line ? <div className="num pointer-events-none absolute right-0 top-0 z-10 text-11 text-faint">{line.topLabel}</div> : null}
        <div role="img" aria-label={ariaLabel} className="relative flex items-end gap-px border-b border-line-strong pt-5" style={{ height }}>
          {rule ? <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-mute opacity-60" style={{ bottom: `${(rule.value / max) * (height - 20)}px` }} /> : null}
          {data.map((d, i) => (
            <button key={d.key} type="button" tabIndex={i === 0 ? 0 : -1} aria-label={`${d.label}: ${d.segs.map((s) => `${s.name} ${s.text ?? s.value}`).join(", ")}`} onMouseEnter={() => setAt(i)} onFocus={() => setAt(i)} onBlur={() => setAt(null)} onKeyDown={(e) => {
              const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -1;
              if (next >= 0 && next < data.length) (e.currentTarget.parentElement?.querySelectorAll("button")[next] as HTMLElement | undefined)?.focus();
            }} className={cn("flex h-full min-w-0 flex-1 flex-col justify-end outline-offset-0", at !== null && at !== i && "opacity-45")}>
              {totals[i] === 0 ? null : (
                <span className="flex w-full flex-col-reverse overflow-hidden rounded-t-[2px]" style={{ height: `${Math.max(2, (totals[i] / max) * (height - 20))}px` }}>
                  {d.segs.map((s) => (s.value > 0 ? <span key={s.name} style={{ background: s.color, flexGrow: s.value, flexBasis: 0 }} /> : null))}
                </span>
              )}
            </button>
          ))}
          {line ? (
            <svg className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: height - 20 }} width="100%" viewBox={`0 0 ${data.length} 100`} preserveAspectRatio="none" aria-hidden>
              <polyline fill="none" stroke="var(--ink)" strokeWidth="1.25" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" points={line.points.map((p, i) => `${i + 0.5},${100 - Math.min(1, p) * 100}`).join(" ")} />
            </svg>
          ) : null}
          {cur && at !== null ? (
            <div className="pointer-events-none absolute top-0 z-20 w-48 rounded-control border border-line bg-panel p-2 text-left text-12 shadow-pop" style={at < data.length / 2 ? { left: `calc(${((at + 1) / data.length) * 100}% + 6px)` } : { right: `calc(${((data.length - at) / data.length) * 100}% + 6px)` }}>
              <div className="mb-1 font-medium">{cur.label}</div>
              {cur.segs.map((s) => (
                <div key={s.name} className="flex items-center justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-mute">
                    <span className="size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="num">{s.text ?? s.value}</span>
                </div>
              ))}
              {cur.notes?.map((n) => (
                <div key={n} className="num mt-1 border-t border-line pt-1 text-11 text-mute">
                  {n}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="relative mt-1 h-4">
          {ticks.map((t, k) => (
            <span key={t} className={cn("num absolute text-11 text-mute", k === ticks.length - 1 && data.length > 10 ? "right-0" : k === 0 || data.length <= 10 ? "" : "-translate-x-1/2")} style={k === ticks.length - 1 && data.length > 10 ? undefined : { left: data.length <= 10 ? `${(t / data.length) * 100}%` : k === 0 ? 0 : `${((t + 0.5) / data.length) * 100}%` }}>
              {data[t]?.label.replace(/^\w+, /, "")}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
