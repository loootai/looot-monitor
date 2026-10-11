import { usd } from "./money";
import type { RunTrigger, SourceId } from "./types";

export type GuardResult = { ok: true } | { ok: false; status: "blocked_price" | "blocked_budget"; scope: "price" | "monitor" | "workspace" | "daily"; message: string };

/** After this long a reservation is checked against the run's real status. */
export const RESERVATION_SOFT_SECONDS = 15 * 60;
/** After this long a reservation that could not be resolved is released. */
export const RESERVATION_HARD_SECONDS = 24 * 60 * 60;

/** Spent, held and total for one period. remainingMicros never goes below zero. */
export interface BudgetWindow {
  budgetMicros: number;
  spentMicros: number;
  reservedMicros: number;
  remainingMicros: number;
}

/** The daily and monthly budget as the sidebar and the spend page show it. */
export interface BudgetStatus {
  daily: BudgetWindow;
  monthly: BudgetWindow;
}

export const windowOf = (budgetMicros: number, spentMicros: number, reservedMicros: number): BudgetWindow => ({ budgetMicros, spentMicros, reservedMicros, remainingMicros: Math.max(0, budgetMicros - spentMicros - reservedMicros) });

/** One quoted paid call to hold money for. The key is the call's idempotency key. */
export interface ReservationItem {
  key: string;
  source: SourceId;
  endpointId: string;
  amountMicros: number;
}

export interface ReserveRequest {
  monitorId: string;
  items: ReservationItem[];
  trigger: RunTrigger;
  slot: string;
  now: Date;
}

export type BudgetScope = "daily" | "monthly" | "monitor";

export type ReserveResult = { ok: true; budget: BudgetStatus } | { ok: false; reason: "duplicate" } | { ok: false; reason: "budget"; scope: BudgetScope; budget: BudgetStatus };

/** A held amount. state "reserved" counts against the budget. */
export interface Reservation {
  key: string;
  monitorId: string;
  source: SourceId;
  endpointId: string;
  trigger: RunTrigger;
  slot: string;
  amountMicros: number;
  state: "reserved" | "settled" | "released";
  loootRunId: string | null;
  createdAt: string;
  expiresAt: string;
  hardExpiresAt: string;
}

export interface ReserveNumbers {
  dailyBudgetMicros: number;
  monthlyBudgetMicros: number;
  monitorCapMicros: number;
  spentDayMicros: number;
  spentMonthMicros: number;
  spentMonitorMonthMicros: number;
  reservedMicros: number;
  reservedMonitorMicros: number;
  totalMicros: number;
}

/**
 * The reservation rule, in the order the database function applies it: daily budget, monthly
 * budget, then the monitor's monthly cap. Spent plus held plus the new amount must stay within
 * each. null means it fits. The Postgres function reserve_budget() is the same rule under a row lock.
 */
export function overBudget(n: ReserveNumbers): BudgetScope | null {
  if (n.spentDayMicros + n.reservedMicros + n.totalMicros > n.dailyBudgetMicros) return "daily";
  if (n.spentMonthMicros + n.reservedMicros + n.totalMicros > n.monthlyBudgetMicros) return "monthly";
  if (n.spentMonitorMonthMicros + n.reservedMonitorMicros + n.totalMicros > n.monitorCapMicros) return "monitor";
  return null;
}

/** The refusal shown to the user when a reservation fails. Names the period and the numbers. */
export function budgetRefusal(scope: BudgetScope, b: BudgetStatus, needMicros: number): string {
  const w = scope === "daily" ? b.daily : b.monthly;
  if (scope === "monitor") return "This monitor reached its monthly cap.";
  return `The ${scope} budget of ${usd(w.budgetMicros)} cannot cover this run (${usd(needMicros)}): ${usd(w.spentMicros)} spent, ${usd(w.reservedMicros)} held for runs in progress, ${usd(w.remainingMicros)} left. No call was made.`;
}

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
