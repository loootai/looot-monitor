import { NextResponse } from "next/server";
import { IS_DEMO } from "@/lib/clock";
import { fail, withSession } from "@/lib/http";
import { LoootError, balanceUsdOf, hasLoootToken, loootFromEnv } from "@/lib/looot";

/** Free. Tests the looot connection by reading the balance. The token is never returned. */
export async function GET() {
  return withSession(async () => {
    if (IS_DEMO) return NextResponse.json({ ok: true, demo: true, balanceUsd: 18.42 });
    if (!hasLoootToken()) return fail(409, "LOOOT_TOKEN is not set on the server.", { code: "missing_token" });
    try {
      const answer = await loootFromEnv().balance();
      return NextResponse.json({ ok: true, balanceUsd: balanceUsdOf(answer) });
    } catch (e) {
      const err = e as LoootError;
      return fail(502, err.message, { code: err.code ?? `http_${err.status ?? 0}` });
    }
  });
}
