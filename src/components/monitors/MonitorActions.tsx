"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Pause, Pencil, Play } from "lucide-react";
import { RunNowSheet } from "@/components/monitors/RunNowSheet";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { SOURCE_NAME } from "@/components/visuals";
import { dateTime } from "@/lib/clock";
import { usdPrecise } from "@/lib/money";
import type { Monitor, Run } from "@/lib/types";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";

/** Run now, Pause or Resume, and Edit, in the monitor header. */
export function MonitorActions({ monitor, canRun, label = "Run now" }: { monitor: Monitor; canRun: boolean; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const paused = monitor.status === "paused" || monitor.status === "paused_budget";
  const toggle = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/monitors/${monitor.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: paused ? "active" : "paused" }) });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Could not change the monitor");
      toast({ text: paused ? "Monitor resumed" : "Monitor paused" });
      router.refresh();
    } catch (e) {
      toast({ text: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Play /> {label}
      </Button>
      <Button onClick={toggle} disabled={busy}>
        {paused ? <Play /> : <Pause />} {paused ? "Resume" : "Pause"}
      </Button>
      <Button asChild>
        <Link href={`/monitors/${monitor.id}/edit`}>
          <Pencil /> Edit
        </Link>
      </Button>
      <RunNowSheet monitor={monitor} open={open} onOpenChange={setOpen} canRun={canRun} />
    </div>
  );
}

function CopyId({ value }: { value: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy run id ${value}`}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
      className="num inline-flex items-center gap-1 text-12 text-mute hover:text-ink"
    >
      {value.length > 16 ? `${value.slice(0, 16)}...` : value}
      {done ? <Check className="size-3 text-emerald" aria-hidden /> : <Copy className="size-3" aria-hidden />}
    </button>
  );
}

const RESULT: Record<Run["status"], string> = { completed: "ok", failed: "failed", blocked: "blocked", stopped: "stopped", blocked_price: "refused, price", blocked_budget: "refused, budget", demo: "demo" };

/** The runs table. One row per looot call. A failed row opens to show the error code and message. */
export function RunsTable({ runs }: { runs: Run[] }) {
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[860px]">
        <caption className="sr-only">Runs, newest first</caption>
        <thead>
          <tr>
            <Th>Started</Th>
            <Th>Trigger</Th>
            <Th>Source</Th>
            <Th>Result</Th>
            <Th className="text-right">New</Th>
            <Th className="text-right">Cost</Th>
            <Th className="text-right">Duration</Th>
            <Th>looot run id</Th>
            <Th>Error</Th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const bad = r.status !== "completed" && r.status !== "demo";
            const ms = r.finishedAt ? new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime() : null;
            return (
              <React.Fragment key={r.id}>
                <tr className={cn(bad && "cursor-pointer hover:bg-hover")} onClick={bad ? () => setOpen((o) => (o === r.id ? null : r.id)) : undefined}>
                  <Td className="num whitespace-nowrap text-12">{dateTime(r.startedAt)}</Td>
                  <Td className="text-mute">{r.trigger}</Td>
                  <Td>{SOURCE_NAME[r.source] ?? r.source}</Td>
                  <Td className={cn("whitespace-nowrap", bad ? "text-high" : "text-mute")}>{RESULT[r.status]}</Td>
                  <Td className={cn("num text-right", r.newItems === 0 && "text-faint")}>{r.newItems}</Td>
                  <Td className="num text-right">{usdPrecise(r.actualCostMicros)}</Td>
                  <Td className="num text-right text-mute">{ms === null ? "" : `${(ms / 1000).toFixed(1)}s`}</Td>
                  <Td>{r.loootRunId ? <CopyId value={r.loootRunId} /> : <span className="text-faint">none</span>}</Td>
                  <Td className="num text-12">
                    {r.errorCode ? (
                      <button type="button" aria-expanded={open === r.id} className="text-high underline-offset-2 hover:underline">
                        {r.errorCode}
                      </button>
                    ) : null}
                  </Td>
                </tr>
                {open === r.id ? (
                  <tr className="bg-high-soft">
                    <Td colSpan={9} className="h-auto py-2 text-12">
                      <span className="num font-medium text-high">{r.errorCode}</span> <span>{r.errorMessage ?? "No message."}</span> <span className="text-mute">Cost {usdPrecise(r.actualCostMicros)}.</span>
                    </Td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
