import { parse } from "yaml";
import { z } from "zod";
import { toMicros } from "@/lib/money";
import { canonicalUrl } from "@/lib/parse";
import { hash } from "@/lib/utils";

/** A watchlist file that cannot be used. The message says which field is wrong. */
export class WatchlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchlistError";
  }
}

export type PageReader = "serper-webpage" | "jina-reader";

export interface WatchPage {
  /** Stable id built from the URL, so state survives a rename or a reorder. */
  id: string;
  name: string;
  url: string;
  group: string;
  reader: PageReader;
  ignore: string[];
  watchFor: string[];
}

export interface Watchlist {
  name: string;
  /** Most one run may spend, in micro-dollars. Pages past it are not called. */
  maxSpendPerRunMicros: number;
  /** Most the list may spend in a calendar month (UTC). */
  monthlyCapMicros: number;
  /** A page is refused when the live price of its reader is above this. null means the reader's dated list price. */
  maxPricePerPageMicros: number | null;
  /** Only this much of a page's text is stored and compared. */
  maxChars: number;
  pages: WatchPage[];
}

const httpUrl = z.string().refine((u) => {
  try {
    return ["http:", "https:"].includes(new URL(u).protocol);
  } catch {
    return false;
  }
}, "must be an http or https URL");
const reader = z.enum(["serper-webpage", "jina-reader"]);
const usd = z.number().positive();
const words = z.array(z.string()).default([]);

const pageSchema = z.strictObject({ name: z.string().min(1), url: httpUrl, reader: reader.optional(), ignore: words, watchFor: words });
const fileSchema = z.strictObject({
  name: z.string().min(1),
  reader: reader.default("serper-webpage"),
  maxSpendPerRunUsd: usd,
  monthlyCapUsd: usd,
  maxPricePerPageUsd: usd.optional(),
  maxChars: z.number().int().min(500).default(200_000),
  ignore: words,
  watchFor: words,
  groups: z.array(z.strictObject({ name: z.string().min(1), ignore: words, watchFor: words, pages: z.array(pageSchema).min(1) })).min(1),
});

/** Reads a watchlist from YAML text and checks it. Throws WatchlistError with the field that is wrong. */
export function parseWatchlist(yamlText: string): Watchlist {
  let raw: unknown;
  try {
    raw = parse(yamlText);
  } catch (e) {
    throw new WatchlistError(`The watchlist is not valid YAML: ${(e as Error).message}`);
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) throw new WatchlistError(`The watchlist is not valid:\n${z.prettifyError(parsed.error)}`);
  const f = parsed.data;
  const seen = new Map<string, string>();
  const pages: WatchPage[] = [];
  for (const g of f.groups) {
    for (const p of g.pages) {
      const id = `wl-${hash(canonicalUrl(p.url))}`;
      const first = seen.get(id);
      if (first) throw new WatchlistError(`The watchlist is not valid: ${p.url} is listed twice ("${first}" and "${p.name}").`);
      seen.set(id, p.name);
      pages.push({ id, name: p.name, url: p.url, group: g.name, reader: p.reader ?? f.reader, ignore: [...f.ignore, ...g.ignore, ...p.ignore], watchFor: [...f.watchFor, ...g.watchFor, ...p.watchFor] });
    }
  }
  return {
    name: f.name,
    maxSpendPerRunMicros: toMicros(f.maxSpendPerRunUsd),
    monthlyCapMicros: toMicros(f.monthlyCapUsd),
    maxPricePerPageMicros: f.maxPricePerPageUsd === undefined ? null : toMicros(f.maxPricePerPageUsd),
    maxChars: f.maxChars,
    pages,
  };
}
