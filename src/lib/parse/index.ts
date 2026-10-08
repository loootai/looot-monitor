import { domainOf, hash } from "../utils";
import type { Item, SourceId } from "../types";

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (...vs: unknown[]): string | null => {
  for (const v of vs) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
};
const num = (...vs: unknown[]): number | undefined => {
  for (const v of vs) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
};

/** Finds the first array under any of the given keys, looking one level into `data` too. */
function list(raw: unknown, keys: string[]): Obj[] {
  if (Array.isArray(raw)) return raw.map(obj);
  const o = obj(raw);
  for (const k of keys) if (Array.isArray(o[k])) return (o[k] as unknown[]).map(obj);
  const d = obj(o.data);
  for (const k of keys) if (Array.isArray(d[k])) return (d[k] as unknown[]).map(obj);
  if (Array.isArray(o.data)) return (o.data as unknown[]).map(obj);
  return [];
}

/** Turns a date in any common form into ISO text, or null. Relative dates ("3 hours ago") give null. */
export function isoDate(v: unknown): string | null {
  if (typeof v === "number") {
    const d = new Date(v < 1e12 ? v * 1000 : v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v !== "string" || v.trim() === "" || /ago$/i.test(v.trim())) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Lower-cased URL without query tracking, hash or trailing slash, so one page has one fingerprint. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

const fp = (url: string | null, fallback: string) => hash(url ? canonicalUrl(url) : fallback);

/** serper-news: { news: [{ title, link, snippet, date, source }] }. */
export function parseNews(raw: unknown): Item[] {
  return list(raw, ["news", "results"]).flatMap((r) => {
    const title = str(r.title);
    const url = str(r.link, r.url);
    if (!title) return [];
    return [{ fingerprint: fp(url, title), title, url, domain: domainOf(url), author: null, snippet: str(r.snippet, r.description), publishedAt: isoDate(r.date), extra: { outlet: str(r.source) ?? undefined } }];
  });
}

/** serper-search: { organic: [{ title, link, snippet, position }] }. */
export function parseGoogle(raw: unknown): Item[] {
  return list(raw, ["organic", "results"]).flatMap((r, i) => {
    const title = str(r.title);
    const url = str(r.link, r.url);
    if (!title || !url) return [];
    return [{ fingerprint: fp(url, title), title, url, domain: domainOf(url), author: null, snippet: str(r.snippet), publishedAt: isoDate(r.date), extra: { position: num(r.position) ?? i + 1 } }];
  });
}

/** anyapi-run-twitter-search: a list of posts under tweets, results or data. Field names vary, so several are tried. */
export function parseX(raw: unknown): Item[] {
  return list(raw, ["tweets", "results", "items", "posts"]).flatMap((r) => {
    const text = str(r.text, r.full_text, r.content);
    if (!text) return [];
    const user = obj(r.author ?? r.user);
    const handle = str(user.userName, user.username, user.screen_name, r.username);
    const id = str(r.id, r.id_str, r.tweet_id);
    const url = str(r.url, r.twitterUrl) ?? (handle && id ? `https://x.com/${handle}/status/${id}` : null);
    const engagement = (num(r.likeCount, r.favorite_count, r.likes) ?? 0) + (num(r.retweetCount, r.retweet_count, r.retweets) ?? 0);
    return [{ fingerprint: fp(url, id ?? text), title: text.length > 120 ? `${text.slice(0, 117)}...` : text, url, domain: "x.com", author: str(user.name, handle ? `@${handle}` : null), snippet: text, publishedAt: isoDate(r.createdAt ?? r.created_at), extra: { engagement: engagement || undefined, engagementLabel: "likes and reposts" } }];
  });
}

/** scrapecreators-reddit-search: { posts: [{ title, permalink, selftext, subreddit, author, ups, created_utc }] }. */
export function parseReddit(raw: unknown): Item[] {
  return list(raw, ["posts", "results", "children"]).flatMap((entry) => {
    const r = entry.data && typeof entry.data === "object" ? obj(entry.data) : entry;
    const title = str(r.title);
    if (!title) return [];
    const permalink = str(r.permalink);
    const url = permalink ? (permalink.startsWith("http") ? permalink : `https://www.reddit.com${permalink}`) : str(r.url);
    const sub = str(r.subreddit, r.subreddit_name_prefixed);
    return [{ fingerprint: fp(url, title), title, url, domain: "reddit.com", author: str(r.author) ? `u/${str(r.author)}` : null, snippet: str(r.selftext, r.body), publishedAt: isoDate(r.created_utc ?? r.created), extra: { engagement: num(r.ups, r.score), engagementLabel: "upvotes", outlet: sub ? (sub.startsWith("r/") ? sub : `r/${sub}`) : undefined } }];
  });
}

/** anyapi-run-linkedin-search-posts: a list of posts with text, url, author and reaction counts. */
export function parseLinkedin(raw: unknown): Item[] {
  return list(raw, ["posts", "results", "items", "elements"]).flatMap((r) => {
    const text = str(r.text, r.commentary, r.content);
    if (!text) return [];
    const author = obj(r.author ?? r.actor);
    const url = str(r.url, r.postUrl, r.shareUrl);
    return [{ fingerprint: fp(url, text), title: text.length > 120 ? `${text.slice(0, 117)}...` : text, url, domain: "linkedin.com", author: str(author.name, author.fullName, r.authorName), snippet: text, publishedAt: isoDate(r.postedAt ?? r.publishedAt ?? r.date), extra: { engagement: num(r.numLikes, r.likeCount, r.reactions, obj(r.stats).likes), engagementLabel: "reactions" } }];
  });
}

/** serper-reviews: { reviews: [{ rating, snippet, user: { name }, isoDate, id }] }. */
export function parseMapsReviews(raw: unknown): Item[] {
  return list(raw, ["reviews", "results"]).flatMap((r) => {
    const text = str(r.snippet, r.text, r.review);
    const rating = num(r.rating, r.stars);
    if (!text && rating === undefined) return [];
    const user = obj(r.user);
    const author = str(user.name, r.author, r.reviewer);
    const id = str(r.id, r.reviewId);
    return [{ fingerprint: hash(id ?? `${author ?? ""}|${text ?? ""}`), title: text ? (text.length > 90 ? `${text.slice(0, 87)}...` : text) : `${rating} star review`, url: str(r.link, user.link), domain: "google.com", author, snippet: text, publishedAt: isoDate(r.isoDate ?? r.date), extra: { rating } }];
  });
}

/** searchapi-io-apple-product-reviews: { reviews: [{ id, title, text, rating, username, review_date }] }. */
export function parseAppstoreReviews(raw: unknown): Item[] {
  return list(raw, ["reviews", "results"]).flatMap((r) => {
    const text = str(r.text, r.content, r.body);
    const title = str(r.title) ?? (text ? text.slice(0, 90) : null);
    const rating = num(r.rating, r.stars);
    if (!title) return [];
    const author = str(r.username, obj(r.author).name, r.author);
    const id = str(r.id, r.review_id);
    return [{ fingerprint: hash(id ?? `${author ?? ""}|${text ?? title}`), title, url: str(r.link, r.url), domain: "apps.apple.com", author, snippet: text, publishedAt: isoDate(r.review_date ?? r.date ?? r.updated), extra: { rating } }];
  });
}

/** Page readers. jina-reader: { data: { content, title } }. serper-webpage: { markdown, text, metadata: { title } }. */
export function parsePage(raw: unknown): { content: string; title: string | null } {
  const o = obj(raw);
  const d = obj(o.data);
  const content = str(d.content, o.markdown, o.content, o.text, d.markdown, d.text) ?? (typeof raw === "string" ? raw : "");
  return { content, title: str(d.title, obj(o.metadata).title, o.title) };
}

/** Finds an image URL in a screenshot answer, whatever the field is called. */
export function parseScreenshot(raw: unknown): string | null {
  const o = obj(raw);
  const d = obj(o.data);
  return str(o.screenshotUrl, o.screenshot, o.url, o.imageUrl, d.screenshotUrl, d.screenshot, d.url);
}

/** Parser for each list source. Page and screenshot have their own shapes above. */
export const PARSERS: Partial<Record<SourceId, (raw: unknown) => Item[]>> = {
  news: parseNews,
  google: parseGoogle,
  x: parseX,
  reddit: parseReddit,
  linkedin: parseLinkedin,
  maps_reviews: parseMapsReviews,
  appstore_reviews: parseAppstoreReviews,
};
