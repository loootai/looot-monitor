import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, withSession } from "@/lib/http";
import { runNow } from "@/lib/service";

export const maxDuration = 120;
const input = z.object({ confirmId: z.string().min(6).max(80), maxCostMicros: z.number().int().positive().optional() });

/**
 * Paid. Runs one monitor now. The body carries the id made when the quote was shown, which is the
 * idempotency key (scoped to the monitor and source), and may lower the max cost for this run. The
 * cap is the monitor row's: the body can never raise it or change it for later runs. A second post
 * with the same id charges nothing. Limited to 10 paid calls a minute per user.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withSession(req, async ({ store }) => {
    const parsed = input.safeParse(await body(req));
    if (!parsed.success) return fail(400, "Confirm the quote first.");
    const monitor = await store.getMonitor((await ctx.params).id);
    if (!monitor) return fail(404, "This monitor was deleted.");
    const out = await runNow(store, monitor, parsed.data.confirmId, parsed.data.maxCostMicros);
    if ("ok" in out) return fail(out.status, out.error, { code: "no_token" });
    return NextResponse.json({ outcome: out });
  }, { spends: true });
}
