import "server-only";
import { NextResponse } from "next/server";
import { makeRateLimit } from "./access";
import { csrfProblem } from "./csrf";
import { resolveSession, type Session } from "./store";

/** JSON error answer in one shape: { error, code?, fields? }. */
export function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

const spendLimit = makeRateLimit(10, 60_000);

/** Counts one paid call for this user. true when they are past 10 in the last minute. */
export function overSpendLimit(s: Session): boolean {
  return !spendLimit(s.user.id ?? s.user.email);
}

/** The 429 answer for a user past the spending limit. */
export function tooMany() {
  return fail(429, "Too many paid runs in a minute. Wait and try again.", { code: "rate_limited" });
}

/**
 * Runs a route handler for the signed-in user on the owner allow-list. Answers 401 when nobody is
 * signed in, 403 when the user is not on the list, 503 when no list is set. Thrown errors become a 500.
 * A request that changes state also needs a same-origin Origin and the CSRF token, else 403 with code
 * csrf_origin or csrf_token. With `spends: true` it also limits the user to 10 paid calls a minute
 * and answers 429 past that.
 */
export async function withSession(req: Request, handler: (s: Session) => Promise<Response>, opts: { spends?: boolean } = {}): Promise<Response> {
  const r = await resolveSession();
  if (r.state === "signed_out") return fail(401, "Sign in first.", { code: "unauthorized" });
  if (r.state === "not_allowed") return fail(403, "Not authorised for this workspace.", { code: "forbidden" });
  if (r.state === "setup_required") return fail(503, "Set LOOOT_MONITOR_ALLOWED_EMAILS (or LOOOT_MONITOR_ALLOWED_DOMAINS) on the server first.", { code: "setup_required" });
  const bad = csrfProblem(req.method, req.headers);
  if (bad) return fail(bad.status, bad.error, { code: bad.code });
  const s = r.session;
  if (opts.spends && overSpendLimit(s)) return tooMany();
  try {
    return await handler(s);
  } catch (e) {
    return fail(500, (e as Error).message || "Something went wrong.", { code: "server_error" });
  }
}

/** Reads a JSON body, or null when it is not JSON. */
export async function body<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
