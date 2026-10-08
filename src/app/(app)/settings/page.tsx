import type { Metadata } from "next";
import { SettingsClient, type SourceRow } from "@/components/settings/SettingsClient";
import { IS_DEMO } from "@/lib/clock";
import { hasLoootToken } from "@/lib/looot";
import { fetchPrices } from "@/lib/prices";
import { SERPER_WEBPAGE, SOURCES } from "@/lib/sources";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { store, user } = await requireSession();
  const [settings, prices] = await Promise.all([store.getSettings(), fetchPrices(undefined, { demo: IS_DEMO })]);
  const rows: SourceRow[] = Object.values(SOURCES).map((s) => ({ label: s.label, jobId: s.jobId, endpointId: s.endpointId, priceMicros: prices.prices[s.endpointId] ?? s.fallbackMicros, priceDated: s.priceDated, shapeVerified: s.shapeVerified }));
  rows.splice(3, 0, { label: "Page, second reader", jobId: SOURCES.page.jobId, endpointId: SERPER_WEBPAGE.endpointId, priceMicros: prices.prices[SERPER_WEBPAGE.endpointId] ?? SERPER_WEBPAGE.fallbackMicros, priceDated: SERPER_WEBPAGE.priceDated, shapeVerified: SERPER_WEBPAGE.shapeVerified });
  return <SettingsClient initial={settings} tokenSet={hasLoootToken()} tokenEnv="LOOOT_TOKEN" demo={IS_DEMO} user={user} sources={rows} />;
}
