"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { dateTime } from "@/lib/clock";
import { usdPrecise } from "@/lib/money";
import type { Run } from "@/lib/types";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";

/** Every paid call, newest first, with cursor paging and a CSV export. */
export function Ledger({ initial, monitorNames }: { initial: Run[]; monitorNames: Record<string, string> }) {
  const toast = useToast();
  const [rows, setRows] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(initial.length < 25);
  const more = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/spend/ledger?before=${encodeURIComponent(rows[rows.length - 1].startedAt)}`);
      const data = (await res.json()) as { runs?: Run[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load more");
      const seen = new Set(rows.map((r) => r.id));
      const next = (data.runs ?? []).filter((r) => !seen.has(r.id));
      setRows((r) => [...r, ...next]);
      if ((data.runs ?? []).length < 25) setDone(true);
    } catch (e) {
      toast({ text: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="ledger-h">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-6 md:px-6">
        <h2 id="ledger-h" className="text-12 font-medium">
          Ledger <span className="font-normal text-mute">every looot call, newest first</span>
        </h2>
        <Button asChild size="sm">
          <a href="/api/spend/export" download>
            <Download /> Export CSV
          </a>
        </Button>
      </div>
      <div className="overflow-x-auto border-t border-line">
        <Table className="min-w-[820px]">
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Monitor</Th>
              <Th>Endpoint</Th>
              <Th>looot run id</Th>
              <Th>Status</Th>
              <Th className="text-right">Cost</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="num whitespace-nowrap text-12">{dateTime(r.startedAt)}</Td>
                <Td className="max-w-56 truncate">{monitorNames[r.monitorId] ?? "Deleted monitor"}</Td>
                <Td className="num text-12 text-mute">{r.endpointId}</Td>
                <Td className="num text-12 text-mute">{r.loootRunId ?? "none"}</Td>
                <Td className={cn(r.status === "completed" ? "text-mute" : r.status === "demo" ? "text-amber" : "text-high")}>
                  {r.status}
                  {r.errorCode && r.status === "failed" ? <span className="num text-12"> · {r.errorCode}</span> : null}
                </Td>
                <Td className="num text-right">{usdPrecise(r.actualCostMicros)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      {!done ? (
        <div className="p-3 md:px-6">
          <Button onClick={more} disabled={busy}>
            {busy ? "Loading..." : "Load older"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
