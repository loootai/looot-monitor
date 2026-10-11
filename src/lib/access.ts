/**
 * Owner allow-list. Supabase accepts any sign-up when the project allows open sign-ups, so being
 * signed in proves nothing. Only an email on LOOOT_MONITOR_ALLOWED_EMAILS, or on a domain in
 * LOOOT_MONITOR_ALLOWED_DOMAINS, may use the workspace. With neither set nobody may, and the app
 * shows a setup page. No import here, so the proxy and the route handlers share one rule.
 */
export type Access = "allowed" | "not_allowed" | "setup_required";

/** Splits a comma separated env value into trimmed, lower-case, non-empty items. */
export function parseList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Decides what a signed-in email may do. Emails match exactly, domains match the part after the last @. */
export function accessFor(email: string | null | undefined, env: Record<string, string | undefined> = process.env): Access {
  const emails = parseList(env.LOOOT_MONITOR_ALLOWED_EMAILS);
  const domains = parseList(env.LOOOT_MONITOR_ALLOWED_DOMAINS).map((d) => d.replace(/^@/, ""));
  if (emails.length === 0 && domains.length === 0) return "setup_required";
  const e = (email ?? "").trim().toLowerCase();
  if (!e || e.split("@").length !== 2) return "not_allowed";
  if (emails.includes(e)) return "allowed";
  return domains.includes(e.split("@")[1]) ? "allowed" : "not_allowed";
}

/** Per-user sliding window. Memory only, so on serverless it limits per warm instance. */
export function makeRateLimit(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, at: number = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => at - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(at);
    hits.set(key, recent);
    return true;
  };
}
