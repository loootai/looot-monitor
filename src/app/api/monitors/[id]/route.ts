import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { body, fail, withSession } from "@/lib/http";
import { nextRunAfter } from "@/lib/schedule";
import { parseMonitor } from "@/lib/service";

const quick = z.object({ status: z.enum(["active", "paused"]).optional(), monthlyCapMicros: z.number().int().positive().optional() });

/** Edits a monitor. A body with `kind` is a full edit from the form; otherwise pause, resume or raise the cap. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withSession(req, async ({ store }) => {
    const { id } = await ctx.params;
    const current = await store.getMonitor(id);
    if (!current) return fail(404, "This monitor was deleted.");
    const b = await body(req);
    if (b && "kind" in b) {
      const parsed = parseMonitor(b);
      if (!parsed.ok) return fail(parsed.status, parsed.error, { fields: parsed.fields });
      const { status: _s, ...rest } = parsed.value;
      return NextResponse.json({ monitor: await store.updateMonitor(id, rest) });
    }
    const parsed = quick.safeParse(b);
    if (!parsed.success) return fail(400, "Nothing to change.");
    const patch: Record<string, unknown> = { ...parsed.data };
    // Raising the cap or resuming puts a budget-paused monitor back on its schedule.
    if ((parsed.data.monthlyCapMicros && current.status === "paused_budget") || parsed.data.status === "active") {
      patch.status = "active";
      patch.nextRunAt = nextRunAfter(current.schedule, now(), current.runHour).toISOString();
    }
    return NextResponse.json({ monitor: await store.updateMonitor(id, patch) });
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withSession(req, async ({ store }) => {
    await store.deleteMonitor((await ctx.params).id);
    return NextResponse.json({ ok: true });
  });
}
