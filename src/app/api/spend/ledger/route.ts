import { NextResponse } from "next/server";
import { withSession } from "@/lib/http";

/** One page of the ledger, newest first. `before` is the cursor. */
export async function GET(req: Request) {
  return withSession(req, async ({ store }) => {
    const before = new URL(req.url).searchParams.get("before") ?? undefined;
    return NextResponse.json({ runs: await store.listRuns({ before, limit: 25 }) });
  });
}
