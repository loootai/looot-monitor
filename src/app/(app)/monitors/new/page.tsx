import type { Metadata } from "next";
import { MonitorForm } from "@/components/monitors/MonitorForm";
import { formData } from "@/components/monitors/formData";
import { requireSession } from "@/lib/store";
import type { MonitorKind } from "@/lib/types";

export const metadata: Metadata = { title: "New monitor" };

export default async function NewMonitorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const kind = (["mention", "serp", "page", "reviews"] as MonitorKind[]).find((k) => k === q.kind);
  const { store } = await requireSession();
  const data = await formData(store, undefined, kind);
  return <MonitorForm mode="new" initialKind={kind} {...data} />;
}
