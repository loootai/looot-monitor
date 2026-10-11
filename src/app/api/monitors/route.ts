import { NextResponse } from "next/server";
import { body, fail, overSpendLimit, tooMany, withSession } from "@/lib/http";
import { parseMonitor, runNow } from "@/lib/service";

/** Creates a monitor. With run: true it also runs the first check, capped at the confirmed max. */
export async function POST(req: Request) {
  return withSession(req, async (session) => {
    const { store } = session;
    const b = await body<{ run?: boolean; confirmId?: string }>(req);
    const parsed = parseMonitor(b);
    if (!parsed.ok) return fail(parsed.status, parsed.error, { fields: parsed.fields });
    const monitor = await store.createMonitor(parsed.value);
    if (!b?.run) return NextResponse.json({ monitor });
    if (overSpendLimit(session)) return tooMany();
    const outcome = await runNow(store, monitor, b.confirmId ?? crypto.randomUUID());
    return NextResponse.json({ monitor, outcome });
  });
}
