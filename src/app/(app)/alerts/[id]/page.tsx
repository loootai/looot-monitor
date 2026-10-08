import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AlertDetail, AlertDetailSkeleton } from "@/components/alerts/AlertDetail";
import { Empty, ErrorPanel, forcedState } from "@/components/states";
import { requireSession } from "@/lib/store";

export const metadata: Metadata = { title: "Alert" };

export default async function AlertPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { store } = await requireSession();
  const forced = forcedState(q.state);
  return (
    <div className="bg-panel md:min-h-full">
      <div className="border-b border-line px-2 py-1 md:px-4">
        <Link href="/" className="inline-flex h-11 items-center gap-1.5 rounded-control px-2 text-mute hover:text-ink md:h-8">
          <ArrowLeft className="size-4" aria-hidden /> Inbox
        </Link>
      </div>
      {forced === "loading" ? <AlertDetailSkeleton /> : forced === "error" ? <ErrorPanel code="alert_load_failed" message="This alert could not be loaded." retryHref={`/alerts/${id}`} /> : forced === "empty" ? <Empty title="This alert was deleted" note="It may have been removed with its monitor." /> : <AlertDetail store={store} id={id} compareId={q.cmp} tab={q.tab} basePath={`/alerts/${id}`} />}
    </div>
  );
}
