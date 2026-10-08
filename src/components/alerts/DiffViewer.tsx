"use client";

import * as React from "react";
import { Columns2, Rows3 } from "lucide-react";
import { Segmented } from "@/components/ui/misc";
import { collapse, type DiffLine, type WordPart } from "@/lib/pageDiff";
import { cn } from "@/lib/utils";

function Parts({ line, kind }: { line: DiffLine; kind: "add" | "del" }) {
  const parts: WordPart[] | undefined = line.type !== "same" ? line.parts : undefined;
  if (!parts) return <>{line.text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.mark ? (
          <mark key={i} className={cn("rounded-[2px] text-ink", kind === "add" ? "bg-add-mark" : "bg-del-mark")}>
            {p.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </>
  );
}

const NUM = "num w-9 shrink-0 select-none px-1 text-right text-11 leading-5 text-faint";
const GUTTER = "num w-4 shrink-0 select-none text-center text-12 leading-5";
const TEXT = "min-w-0 flex-1 whitespace-pre-wrap break-words py-px pr-2 font-mono text-12 leading-5";

function UnifiedRow({ l }: { l: DiffLine }) {
  return (
    <div className={cn("flex", l.type === "add" && "bg-add", l.type === "del" && "bg-del")}>
      <span className={NUM}>{l.type !== "add" ? l.a : ""}</span>
      <span className={NUM}>{l.type !== "del" ? l.b : ""}</span>
      <span className={cn(GUTTER, l.type === "add" ? "text-emerald" : l.type === "del" ? "text-high" : "text-faint")}>{l.type === "add" ? "+" : l.type === "del" ? "-" : ""}</span>
      <span className={TEXT}>{l.type === "same" ? l.text : <Parts line={l} kind={l.type} />}</span>
    </div>
  );
}

function Side({ l, side }: { l: DiffLine | null; side: "a" | "b" }) {
  if (!l) return <div className="flex min-w-0 flex-1 bg-hover/60" aria-hidden />;
  const changed = l.type !== "same";
  return (
    <div className={cn("flex min-w-0 flex-1", changed && (side === "a" ? "bg-del" : "bg-add"))}>
      <span className={NUM}>{side === "a" ? (l.type !== "add" ? l.a : "") : l.type !== "del" ? l.b : ""}</span>
      <span className={cn(GUTTER, changed ? (side === "a" ? "text-high" : "text-emerald") : "text-faint")}>{changed ? (side === "a" ? "-" : "+") : ""}</span>
      <span className={TEXT}>{l.type === "same" ? l.text : <Parts line={l} kind={l.type} />}</span>
    </div>
  );
}

/** Pairs removed and added lines of one change block so they sit side by side. */
function splitRows(lines: DiffLine[]): [DiffLine | null, DiffLine | null][] {
  const rows: [DiffLine | null, DiffLine | null][] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === "same") {
      rows.push([lines[i], lines[i]]);
      i++;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].type === "del") dels.push(lines[i++]);
    while (i < lines.length && lines[i].type === "add") adds.push(lines[i++]);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push([dels[k] ?? null, adds[k] ?? null]);
  }
  return rows;
}

/**
 * Split or unified text diff. Added lines sit on a green tint with a + gutter, removed on a red
 * tint with a - gutter, changed words are marked, long unchanged runs are collapsed.
 */
export function DiffViewer({ lines, beforeLabel, afterLabel, defaultView = "split" }: { lines: DiffLine[]; beforeLabel: string; afterLabel: string; defaultView?: "split" | "unified" }) {
  const [view, setView] = React.useState<"split" | "unified">(defaultView);
  const [open, setOpen] = React.useState<Set<number>>(new Set());
  const blocks = React.useMemo(() => collapse(lines), [lines]);
  return (
    <section aria-label="Text diff" className="overflow-hidden rounded-panel border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="num flex min-w-0 flex-wrap items-center gap-x-3 text-11 text-mute">
          <span>
            <span className="text-high">-</span> {beforeLabel}
          </span>
          <span>
            <span className="text-emerald">+</span> {afterLabel}
          </span>
        </div>
        <Segmented
          label="Diff view"
          value={view}
          onChange={setView}
          className="h-8 md:h-7"
          options={[
            { value: "split", label: (<><Columns2 className="size-3.5" aria-hidden /> Split</>) },
            { value: "unified", label: (<><Rows3 className="size-3.5" aria-hidden /> Unified</>) },
          ]}
        />
      </div>
      <div className={cn("overflow-x-auto", view === "split" && "max-md:hidden")}>
        {blocks.map((b, bi) =>
          b.kind === "collapsed" && !open.has(bi) ? (
            <button key={bi} type="button" onClick={() => setOpen((s) => new Set(s).add(bi))} className="flex h-7 w-full items-center gap-2 border-y border-line bg-page px-3 text-11 text-mute hover:text-ink">
              Show {b.lines.length} unchanged lines
            </button>
          ) : view === "unified" ? (
            <div key={bi}>
              {b.lines.map((l, i) => (
                <UnifiedRow key={i} l={l} />
              ))}
            </div>
          ) : (
            <div key={bi}>
              {splitRows(b.lines).map(([a, c], i) => (
                <div key={i} className="flex divide-x divide-line">
                  <Side l={a} side="a" />
                  <Side l={c} side="b" />
                </div>
              ))}
            </div>
          ),
        )}
      </div>
      {view === "split" ? (
        // Phones are too narrow for two columns, so split falls back to the unified rows.
        <div className="md:hidden">
          {blocks.map((b, bi) =>
            b.kind === "collapsed" && !open.has(bi) ? (
              <button key={bi} type="button" onClick={() => setOpen((s) => new Set(s).add(bi))} className="flex h-9 w-full items-center border-y border-line bg-page px-3 text-11 text-mute">
                Show {b.lines.length} unchanged lines
              </button>
            ) : (
              <div key={bi}>
                {b.lines.map((l, i) => (
                  <UnifiedRow key={i} l={l} />
                ))}
              </div>
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}
