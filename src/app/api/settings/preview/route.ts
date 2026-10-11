import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { body, fail, withSession } from "@/lib/http";
import { previewSeverity } from "@/lib/service";

const input = z.object({ escalationWords: z.array(z.string()).max(100), priorityDomains: z.array(z.string()).max(100) });

/** Free. Counts how many of the last 30 days of mention alerts would change severity under edited rules. */
export async function POST(req: Request) {
  return withSession(req, async ({ store }) => {
    const parsed = input.safeParse(await body(req));
    if (!parsed.success) return fail(400, "Send the rules to preview.");
    const since = new Date(now().getTime() - 30 * 86_400_000).toISOString();
    const alerts = await store.listAlerts({ since, limit: 2000 });
    return NextResponse.json(previewSeverity(alerts, parsed.data));
  });
}
