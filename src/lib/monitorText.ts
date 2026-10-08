import type { Monitor } from "./types";

/** What a monitor watches, as one line of text: the query, the URL without its scheme, or the review listing. */
export function targetOf(m: Pick<Monitor, "kind" | "config">): string {
  if (m.kind === "page") return (m.config.url ?? "").replace(/^https?:\/\//, "");
  if (m.kind === "reviews") return m.config.platform === "maps" ? `Maps place ${m.config.placeId ?? ""}` : `App Store id ${m.config.productId ?? ""}`;
  return m.config.query ?? "";
}
