import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, withSession } from "@/lib/http";
import { quoteFor } from "@/lib/service";
import type { MonitorConfig } from "@/lib/types";

const input = z.object({ kind: z.enum(["mention", "serp", "page", "reviews"]), schedule: z.enum(["hourly", "every_6h", "daily", "weekly"]), config: z.record(z.string(), z.unknown()) });

/** Free. Returns what a monitor would cost per run and per month. Nothing is run. */
export async function POST(req: Request) {
  return withSession(req, async () => {
    const parsed = input.safeParse(await body(req));
    if (!parsed.success) return fail(400, "Send kind, schedule and config.");
    return NextResponse.json(await quoteFor(parsed.data.kind, parsed.data.config as MonitorConfig, parsed.data.schedule));
  });
}
