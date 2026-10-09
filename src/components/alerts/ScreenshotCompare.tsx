"use client";

import * as React from "react";

/** Before and after screenshots. A slider on wide screens, stacked on phones. */
export function ScreenshotCompare({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) {
  const [pos, setPos] = React.useState(50);
  return (
    <div>
      <div className="hidden overflow-hidden rounded-panel border border-line bg-panel md:block">
        {/* The dates sit in their own bar: drawn over the image they collide with the page's own header. */}
        <div className="num flex items-center justify-between gap-3 border-b border-line px-3 py-1.5 text-11 text-mute">
          <span>Before · {beforeLabel}</span>
          <span>After · {afterLabel}</span>
        </div>
        <div className="relative overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- screenshots come from any host, or are local demo files */}
          <img src={after} alt={`Screenshot after, ${afterLabel}`} className="block w-full" />
          <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={before} alt={`Screenshot before, ${beforeLabel}`} className="block w-full" />
          </div>
          <div className="pointer-events-none absolute inset-y-0 w-px bg-brand" style={{ left: `${pos}%` }} aria-hidden>
            <span className="absolute left-1/2 top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel text-11 text-mute shadow-pop">↔</span>
          </div>
          <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Move the divider between before and after" className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
        </div>
      </div>
      <div className="space-y-3 md:hidden">
        {[
          { src: before, label: `Before · ${beforeLabel}` },
          { src: after, label: `After · ${afterLabel}` },
        ].map((s) => (
          <figure key={s.label} className="overflow-hidden rounded-panel border border-line bg-panel">
            <figcaption className="num border-b border-line px-3 py-1.5 text-11 text-mute">{s.label}</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt={s.label} className="block w-full" />
          </figure>
        ))}
      </div>
    </div>
  );
}
