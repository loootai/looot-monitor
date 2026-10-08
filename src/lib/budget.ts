export type GuardResult = { ok: true } | { ok: false; status: "blocked_price" | "blocked_budget"; scope: "price" | "monitor" | "workspace"; message: string };

export interface GuardInput {
  /** Sum of the live prices of the calls this run would make. */
  livePriceMicros: number;
  /** The max cost per run the user confirmed. */
  confirmedMaxMicros: number;
  /** What this monitor has spent in the current calendar month. */
  monitorSpentMicros: number;
  monitorCapMicros: number;
  /** What every monitor together has spent in the current calendar month. */
  workspaceSpentMicros: number;
  workspaceCapMicros: number;
}

/**
 * Decides whether a run may spend money. Checked before every looot call.
 * A price above the confirmed max blocks the run. Month spend plus the confirmed max above
 * either cap blocks the run. A refused run makes no looot call and costs nothing.
 */
export function checkGuards(g: GuardInput): GuardResult {
  if (g.livePriceMicros > g.confirmedMaxMicros) {
    return { ok: false, status: "blocked_price", scope: "price", message: `The price is now ${g.livePriceMicros} micro-dollars a run, above the ${g.confirmedMaxMicros} you confirmed.` };
  }
  if (g.monitorSpentMicros + g.confirmedMaxMicros > g.monitorCapMicros) {
    return { ok: false, status: "blocked_budget", scope: "monitor", message: "This monitor reached its monthly cap." };
  }
  if (g.workspaceSpentMicros + g.confirmedMaxMicros > g.workspaceCapMicros) {
    return { ok: false, status: "blocked_budget", scope: "workspace", message: "The workspace reached its monthly cap." };
  }
  return { ok: true };
}
