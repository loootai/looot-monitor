import { NextResponse } from "next/server";
import { body, fail, withSession } from "@/lib/http";

/** Deletes every monitor, alert, run, snapshot and setting of the signed-in user. Needs the typed confirmation. */
export async function DELETE(req: Request) {
  return withSession(req, async ({ store }) => {
    const b = await body<{ confirm?: string }>(req);
    if (b?.confirm !== "delete my data") return fail(400, 'Type "delete my data" to confirm.');
    await store.deleteAllData();
    return NextResponse.json({ ok: true });
  });
}
