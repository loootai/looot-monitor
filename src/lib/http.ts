import "server-only";
import { NextResponse } from "next/server";
import { getSession, type Session } from "./store";

/** JSON error answer in one shape: { error, code?, fields? }. */
export function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Runs a route handler for the signed-in user, or answers 401. Thrown errors become a 500 with the message. */
export async function withSession(handler: (s: Session) => Promise<Response>): Promise<Response> {
  const s = await getSession();
  if (!s) return fail(401, "Sign in first.", { code: "unauthorized" });
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
