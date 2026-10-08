import type { Metadata } from "next";
import { MonitorForm } from "@/components/monitors/MonitorForm";
import { formData } from "@/components/monitors/formData";
import { Empty } from "@/components/states";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Edit monitor" };

export default async function EditMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { store } = await requireSession();
  const monitor = await store.getMonitor((await params).id);
  if (!monitor) return <Empty title="This monitor was deleted" />;
  const data = await formData(store, monitor);
  return <MonitorForm mode="edit" initial={monitor} {...data} />;
}
