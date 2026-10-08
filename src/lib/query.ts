export interface ParsedQuery {
  /** Phrases and words to find. Any one of them is a match. */
  terms: string[];
  /** Words that drop an item when present. */
  excluded: string[];
}

/** Reads the small query syntax: "quoted phrases", OR between alternatives, -exclude. */
export function parseQuery(query: string): ParsedQuery {
  const terms: string[] = [];
  const excluded: string[] = [];
  const re = /(-?)"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    if (m[2] !== undefined) (m[1] ? excluded : terms).push(m[2].trim());
    else if (m[3] === "OR") continue;
    else if (m[3].startsWith("-") && m[3].length > 1) excluded.push(m[3].slice(1));
    else terms.push(m[3]);
  }
  return { terms: terms.filter(Boolean), excluded: excluded.filter(Boolean) };
}

/** true when the text has no excluded word. Providers do the matching; this only applies -exclude. */
export function passesExclusions(text: string, q: ParsedQuery): boolean {
  const t = text.toLowerCase();
  return !q.excluded.some((x) => t.includes(x.toLowerCase()));
}

export interface MarkedPart {
  text: string;
  hit: boolean;
}

/** Splits text into plain and matched parts so the UI can mark the query terms. */
export function markTerms(text: string, terms: string[]): MarkedPart[] {
  const clean = terms.map((t) => t.replace(/^@/, "")).filter((t) => t.length > 1);
  if (clean.length === 0 || !text) return [{ text, hit: false }];
  const re = new RegExp(`(${clean.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text
    .split(re)
    .filter((p) => p !== "")
    .map((p) => ({ text: p, hit: clean.some((t) => t.toLowerCase() === p.toLowerCase()) }));
}
