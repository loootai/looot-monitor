import { now } from "@/lib/clock";
import { withSession } from "@/lib/http";
import { ledgerCsv } from "@/lib/spend";

/** The ledger of the last 90 days as a CSV download. */
export async function GET(req: Request) {
  return withSession(req, async ({ store }) => {
    const since = new Date(now().getTime() - 90 * 86_400_000).toISOString();
    const [runs, monitors] = await Promise.all([store.listRuns({ since }), store.listMonitors()]);
    const csv = ledgerCsv(runs, Object.fromEntries(monitors.map((m) => [m.id, m.name])));
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="looot-monitor-ledger.csv"' } });
  });
}
