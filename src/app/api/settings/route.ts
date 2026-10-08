import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, withSession } from "@/lib/http";

const chips = z.array(z.string().trim().min(1).max(120)).max(100);
const input = z
  .object({
    workspaceCapMicros: z.number().int().min(0),
    defaultCapMicros: z.number().int().min(0),
    escalationWords: chips,
    priorityDomains: chips,
    competitorDomains: chips,
    ignorePatterns: chips,
    snapshotRetentionDays: z.number().int().min(1).max(3650),
    rawRetentionDays: z.number().int().min(1).max(3650),
    timezone: z.string().min(1).max(60),
    digestPeriod: z.enum(["daily", "weekly"]),
    digestSeverities: z.array(z.enum(["high", "medium", "low"])),
    digestHour: z.number().int().min(0).max(23),
  })
  .partial();

export async function PATCH(req: Request) {
  return withSession(async ({ store }) => {
    const parsed = input.safeParse(await body(req));
    if (!parsed.success) return fail(400, "Those settings are not valid.");
    return NextResponse.json({ settings: await store.saveSettings(parsed.data) });
  });
}
