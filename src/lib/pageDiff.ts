import { diffArrays, diffWordsWithSpace } from "diff";
import { hash } from "./utils";
import type { PriceChange } from "./types";

export interface WordPart {
  text: string;
  /** true when this part is the changed bit of the line. */
  mark: boolean;
}

export type DiffLine =
  | { type: "same"; a: number; b: number; text: string }
  | { type: "add"; b: number; text: string; parts?: WordPart[] }
  | { type: "del"; a: number; text: string; parts?: WordPart[] };

export interface PageDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
  /** Share of the older page's lines that changed, 0 to 1. */
  changedRatio: number;
  priceChanges: PriceChange[];
}

/**
 * Makes page text comparable: trims lines, collapses runs of spaces, drops empty lines and any
 * line matching an ignore pattern. A pattern is a regular expression, or plain text when it does
 * not compile. Matching ignores case.
 */
export function normalize(markdown: string, ignore: string[] = []): string {
  const tests = ignore
    .filter((p) => p.trim() !== "")
    .map((p) => {
      try {
        const re = new RegExp(p, "i");
        return (l: string) => re.test(l);
      } catch {
        return (l: string) => l.toLowerCase().includes(p.toLowerCase());
      }
    });
  return markdown
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l !== "" && !tests.some((t) => t(l)))
    .join("\n");
}

/** Hash of the normalised text. Two snapshots with the same hash are the same page. */
export function contentHash(normalized: string): string {
  return hash(normalized);
}

const NUM = String.raw`\d+(?:,\d{3})*(?:\.\d+)?`;
const PRICE_RE = new RegExp(String.raw`(?:[$€£]\s?${NUM}|\b(?:USD|EUR|GBP)\s?${NUM}|${NUM}\s?(?:USD|EUR|GBP)\b)`, "g");

/** Every price written on a line, as text. */
export function pricesIn(line: string): string[] {
  return line.match(PRICE_RE) ?? [];
}

const amount = (price: string) => Number(price.replace(/[^\d.]/g, ""));

function labelOf(line: string, price: string): string {
  const label = line.replace(price, "").replace(/[#*_|>`]/g, "").replace(/\/\s?(mo|month|yr|year)\b.*/i, "").replace(/[\s:,-]+$/g, "").replace(/^[\s:,-]+/g, "").trim();
  return label.length > 0 && label.length <= 60 ? label : "Price";
}

function wordParts(before: string, after: string): { del: WordPart[]; add: WordPart[] } {
  const del: WordPart[] = [];
  const add: WordPart[] = [];
  for (const p of diffWordsWithSpace(before, after)) {
    if (p.added) add.push({ text: p.value, mark: true });
    else if (p.removed) del.push({ text: p.value, mark: true });
    else {
      del.push({ text: p.value, mark: false });
      add.push({ text: p.value, mark: false });
    }
  }
  return { del, add };
}

/** true when two lines are close enough to be shown as one edited line. */
function similar(a: string, b: string): boolean {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.max(wa.size, wb.size) >= 0.4;
}

/**
 * Line diff of two normalised texts. A removed line followed by a similar added line is paired,
 * gets word-level marks, and is checked for a price change.
 */
export function diffPages(before: string, after: string): PageDiff {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  const lines: DiffLine[] = [];
  const priceChanges: PriceChange[] = [];
  let ai = 0;
  let bi = 0;
  const chunks = diffArrays(a, b);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const next = chunks[i + 1];
    if (c.removed && next?.added) {
      const dels: DiffLine[] = [];
      const adds: DiffLine[] = [];
      const usedAdd = new Set<number>();
      c.value.forEach((oldLine) => {
        const j = next.value.findIndex((n, idx) => !usedAdd.has(idx) && similar(oldLine, n));
        const entry: DiffLine = { type: "del", a: ++ai, text: oldLine };
        if (j >= 0) {
          usedAdd.add(j);
          const newLine = next.value[j];
          const parts = wordParts(oldLine, newLine);
          entry.parts = parts.del;
          adds[j] = { type: "add", b: 0, text: newLine, parts: parts.add };
          const pb = pricesIn(oldLine);
          const pa = pricesIn(newLine);
          pb.forEach((price, k) => {
            if (pa[k] !== undefined && pa[k] !== price) {
              const from = amount(price);
              const to = amount(pa[k]);
              priceChanges.push({ label: labelOf(oldLine, price), before: price, after: pa[k], pct: from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : null });
            }
          });
        }
        dels.push(entry);
      });
      next.value.forEach((n, idx) => {
        const line = adds[idx] ?? ({ type: "add", b: 0, text: n } as DiffLine);
        if (line.type === "add") line.b = ++bi;
        adds[idx] = line;
      });
      lines.push(...dels, ...adds);
      i++;
    } else if (c.removed) c.value.forEach((text) => lines.push({ type: "del", a: ++ai, text }));
    else if (c.added) c.value.forEach((text) => lines.push({ type: "add", b: ++bi, text }));
    else c.value.forEach((text) => lines.push({ type: "same", a: ++ai, b: ++bi, text }));
  }
  const added = lines.filter((l) => l.type === "add").length;
  const removed = lines.filter((l) => l.type === "del").length;
  return { lines, added, removed, changedRatio: a.length === 0 ? (added > 0 ? 1 : 0) : Math.min(1, Math.max(added, removed) / a.length), priceChanges };
}

/** One line that says what changed, built from the numbers. No model is involved. */
export function summarize(d: Pick<PageDiff, "added" | "removed" | "priceChanges">): string {
  const parts = [`+${d.added} ${d.added === 1 ? "line" : "lines"}`, `-${d.removed} ${d.removed === 1 ? "line" : "lines"}`];
  if (d.priceChanges.length > 0) parts.push(`${d.priceChanges.length} ${d.priceChanges.length === 1 ? "price" : "prices"} changed`);
  return parts.join(", ");
}

/** Title of a page alert, built from the diff: the price changes when there are any, else the first new line. */
export function pageTitle(name: string, d: Pick<PageDiff, "added" | "removed" | "priceChanges" | "lines">): string {
  if (d.priceChanges.length > 0) return `${name}: ${d.priceChanges.slice(0, 2).map((p) => `${p.label} ${p.before} → ${p.after}`).join(", ")}`;
  const first = d.lines.find((l) => l.type === "add")?.text ?? d.lines.find((l) => l.type === "del")?.text;
  if (!first) return `${name}: ${summarize(d)}`;
  const clean = first.replace(/^[#>*\-\s]+/, "");
  return `${name}: ${clean.length > 64 ? `${clean.slice(0, 61)}...` : clean}`;
}

/** Watch phrases that appear on one side of the diff only, in added or removed lines. */
export function watchHits(d: PageDiff, phrases: string[]): string[] {
  const changed = d.lines.filter((l) => l.type !== "same").map((l) => l.text.toLowerCase());
  return phrases.filter((p) => p.trim() !== "" && changed.some((l) => l.includes(p.toLowerCase())));
}

export type DiffBlock = { kind: "lines"; lines: DiffLine[] } | { kind: "collapsed"; lines: DiffLine[] };

/** Groups a diff for display: runs of more than `max` unchanged lines become one collapsed block. */
export function collapse(lines: DiffLine[], max = 6, context = 2): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  let run: DiffLine[] = [];
  const push = (kind: DiffBlock["kind"], ls: DiffLine[]) => {
    if (ls.length === 0) return;
    const last = blocks[blocks.length - 1];
    if (last && last.kind === kind && kind === "lines") last.lines.push(...ls);
    else blocks.push({ kind, lines: [...ls] });
  };
  const flush = (atEnd: boolean) => {
    if (run.length > max) {
      const head = blocks.length === 0 ? 0 : context;
      const tail = atEnd ? 0 : context;
      push("lines", run.slice(0, head));
      push("collapsed", run.slice(head, run.length - tail));
      push("lines", run.slice(run.length - tail));
    } else push("lines", run);
    run = [];
  };
  for (const l of lines) {
    if (l.type === "same") run.push(l);
    else {
      flush(false);
      push("lines", [l]);
    }
  }
  flush(true);
  return blocks;
}
