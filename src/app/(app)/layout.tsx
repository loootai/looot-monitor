import { Suspense } from "react";
import { Shell, type ShellData } from "@/components/shell/Shell";
import { IS_DEMO, now } from "@/lib/clock";
import { monthStart } from "@/lib/schedule";
import { requireSession } from "@/lib/store";

// Every signed-in page reads live data, in demo mode too.
export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { store, user } = await requireSession();
  const at = now();
  const [monitors, counts, settings, monthMicros, budget] = await Promise.all([store.listMonitors(), store.alertCounts(), store.getSettings(), store.spentSince(monthStart(at).toISOString()), store.budgetStatus(at)]);
  const data: ShellData = {
    demo: IS_DEMO,
    user,
    monitors: monitors.map((m) => ({ id: m.id, name: m.name, status: m.status, unread: counts.unreadByMonitor[m.id] ?? 0 })),
    openCount: counts.open,
    unreadCount: counts.unread,
    monthMicros,
    capMicros: settings.workspaceCapMicros,
    budget,
    monthLabel: MONTHS[at.getUTCMonth()],
  };
  return (
    <Suspense>
      <Shell data={data}>{children}</Shell>
    </Suspense>
  );
}
