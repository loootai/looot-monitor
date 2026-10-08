import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, withSession } from "@/lib/http";

const patch = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  patch: z.object({ state: z.enum(["open", "snoozed", "done"]).optional(), snoozedUntil: z.string().nullable().optional(), readAt: z.string().nullable().optional(), severity: z.enum(["high", "medium", "low"]).optional(), severityReason: z.string().max(200).optional() }),
});

/** One page of alerts, newest first. `before` is the cursor. */
export async function GET(req: Request) {
  return withSession(async ({ store }) => {
    const q = new URL(req.url).searchParams;
    const state = q.get("state");
    const alerts = await store.listAlerts({ state: state === "open" || state === "snoozed" || state === "done" ? state : undefined, monitorId: q.get("monitorId") ?? undefined, before: q.get("before") ?? undefined, limit: 50 });
    return NextResponse.json({ alerts });
  });
}

/** Triage: mark done, snooze, read or unread, change severity. Works on one alert or many. */
export async function PATCH(req: Request) {
  return withSession(async ({ store }) => {
    const parsed = patch.safeParse(await body(req));
    if (!parsed.success) return fail(400, "Send ids and a patch.");
    await store.updateAlerts(parsed.data.ids, parsed.data.patch);
    return NextResponse.json({ ok: true, counts: await store.alertCounts() });
  });
}
