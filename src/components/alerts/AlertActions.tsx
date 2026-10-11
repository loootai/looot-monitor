"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, Check, Link2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { now } from "@/lib/clock";
import type { AlertState, Severity } from "@/lib/types";
import { apiFetch } from "@/lib/apiFetch";

/** Sends a triage change for one or more alerts. Throws with the server's message on failure. */
export async function patchAlerts(ids: string[], patch: Record<string, unknown>) {
  const res = await apiFetch("/api/alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, patch }) });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
}

export const snoozeUntil = () => new Date(now().getTime() + 24 * 3_600_000).toISOString();

/** Severity select and the Done, Snooze and Copy link buttons in the alert header. */
export function AlertActions({ id, severity, state }: { id: string; severity: Severity; state: AlertState }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = React.useTransition();
  const act = (patch: Record<string, unknown>, done: string) =>
    start(async () => {
      try {
        await patchAlerts([id], patch);
        toast({ text: done });
        // The inbox listens for this to move the row without a reload.
        window.dispatchEvent(new CustomEvent("alert-changed", { detail: { id, patch } }));
        router.refresh();
      } catch (e) {
        toast({ text: (e as Error).message, tone: "error" });
      }
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Severity" value={severity} disabled={busy} onChange={(e) => act({ severity: e.target.value, severityReason: "Set by hand" }, `Severity set to ${e.target.value}`)} className="w-28 md:h-7 md:text-12">
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </Select>
      {state === "open" ? (
        <>
          <Button size="sm" disabled={busy} onClick={() => act({ state: "done", readAt: now().toISOString() }, "Marked done")}>
            <Check /> Done
          </Button>
          <Button size="sm" disabled={busy} onClick={() => act({ state: "snoozed", snoozedUntil: snoozeUntil() }, "Snoozed for 24 hours")}>
            <AlarmClock /> Snooze
          </Button>
        </>
      ) : (
        <Button size="sm" disabled={busy} onClick={() => act({ state: "open", snoozedUntil: null }, "Moved back to open")}>
          <RotateCcw /> Reopen
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`${window.location.origin}/alerts/${id}`);
            toast({ text: "Link copied" });
          } catch {
            toast({ text: "Could not copy the link", tone: "error" });
          }
        }}
      >
        <Link2 /> Copy link
      </Button>
    </div>
  );
}
