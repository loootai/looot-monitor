import { NextResponse } from "next/server";
import { loootFromEnv } from "@/lib/looot";
import { fetchPrices } from "@/lib/prices";
import { runMonitor } from "@/lib/runner";
import { SupabaseStore } from "@/lib/store/supabase";
import { adminSupabase } from "@/lib/supabase/server";
import type { Monitor } from "@/lib/types";

export const maxDuration = 300;
const MAX_PER_TICK = 25;

/**
 * One scheduler tick, called hourly by Vercel Cron (vercel.json) with "Authorization: Bearer <CRON_SECRET>".
 * Picks up to 25 due monitors and runs each under its owner. Every run goes through the same price
 * and budget guards as a manual one, and the slot-based idempotency key means a retried tick cannot
 * charge twice.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NEXT_PUBLIC_DEMO === "1") return NextResponse.json({ error: "The demo has no scheduler." }, { status: 501 });
  const db = adminSupabase();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set. Scheduled checks are off." }, { status: 501 });
  if (!process.env.LOOOT_TOKEN) return NextResponse.json({ error: "LOOOT_TOKEN is not set. Scheduled checks are off." }, { status: 501 });

  const at = new Date();
  const { data, error } = await db.from("monitors").select("id, owner_id").in("status", ["active", "failing"]).lte("next_run_at", at.toISOString()).order("next_run_at", { ascending: true }).limit(MAX_PER_TICK);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const prices = await fetchPrices();
  const looot = loootFromEnv();
  const results: { monitor: string; status: string; costMicros: number; newAlerts: number }[] = [];
  for (const row of data ?? []) {
    const store = new SupabaseStore(db, row.owner_id as string);
    try {
      const monitor = (await store.getMonitor(row.id as string)) as Monitor | null;
      if (!monitor) continue;
      const out = await runMonitor({ store, looot, prices: prices.prices, unpriced: prices.unread, now: at }, monitor, { trigger: "schedule" });
      results.push({ monitor: monitor.id, status: out.status, costMicros: out.costMicros, newAlerts: out.newAlerts });
    } catch (e) {
      results.push({ monitor: row.id as string, status: `error: ${(e as Error).message}`, costMicros: 0, newAlerts: 0 });
    }
  }
  return NextResponse.json({ at: at.toISOString(), ran: results.length, spentMicros: results.reduce((n, r) => n + r.costMicros, 0), results });
}
