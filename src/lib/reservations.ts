import { toMicros } from "./money";
import type { Store } from "./store/types";
import type { Run, RunStatus } from "./types";

/** What reconciliation needs from looot: read a run again. The LoootClient has it. */
export interface RunReader {
  getRun?: (runId: string) => Promise<{ status: string; actualCost?: number | string | null; error?: { code?: string; message?: string } | null }>;
}

const TERMINAL = new Set(["completed", "failed", "blocked", "stopped"]);

/** true when a looot run has ended, so its cost is final. */
export const isTerminal = (status: string | undefined): boolean => TERMINAL.has(status ?? "");

export interface ReconcileResult {
  settled: number;
  released: number;
  kept: number;
}

/**
 * Resolves reservations that outlived their soft expiry, for example after a crash or a run that
 * stayed pending. For each one:
 *  - a run row already exists for its key: the money is counted there, so the reservation is settled;
 *  - the looot run can be read and has ended: a completed run is written with its real cost and
 *    settled, a failed, blocked or stopped run is written at $0 and released;
 *  - the run is still pending, has no looot id or cannot be fetched: the reservation stays held
 *    until its hard expiry, then it is released.
 * A pending run is never written as failed and its budget is never handed back early.
 */
export async function reconcileReservations(deps: { store: Store; looot: RunReader; now: Date }): Promise<ReconcileResult> {
  const { store, looot, now } = deps;
  const out: ReconcileResult = { settled: 0, released: 0, kept: 0 };
  for (const r of await store.listExpiredReservations(now)) {
    if (await store.hasRun(r.key)) {
      await store.settleReservation(r.key, now);
      out.settled++;
      continue;
    }
    let remote: Awaited<ReturnType<NonNullable<RunReader["getRun"]>>> | null = null;
    if (r.loootRunId && looot.getRun) {
      try {
        remote = await looot.getRun(r.loootRunId);
      } catch {
        remote = null;
      }
    }
    if (remote && isTerminal(remote.status)) {
      const ok = remote.status === "completed";
      const row: Omit<Run, "id" | "ownerId"> = {
        monitorId: r.monitorId,
        source: r.source,
        trigger: r.trigger,
        slot: r.slot,
        idempotencyKey: r.key,
        endpointId: r.endpointId,
        loootRunId: r.loootRunId,
        status: (ok ? "completed" : remote.status) as RunStatus,
        quotedMicros: r.amountMicros,
        actualCostMicros: ok ? toMicros(remote.actualCost) : 0,
        newItems: 0,
        errorCode: ok ? null : (remote.error?.code ?? "not_finished"),
        errorMessage: ok ? null : (remote.error?.message ?? `Run ended as ${remote.status}`),
        startedAt: r.createdAt,
        finishedAt: now.toISOString(),
      };
      await store.insertRun(row);
      if (ok) {
        await store.settleReservation(r.key, now);
        out.settled++;
      } else {
        await store.releaseReservation(r.key, now);
        out.released++;
      }
      continue;
    }
    if (r.hardExpiresAt <= now.toISOString()) {
      await store.releaseReservation(r.key, now);
      out.released++;
    } else out.kept++;
  }
  return out;
}
