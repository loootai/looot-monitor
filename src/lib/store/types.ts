import type { BudgetStatus, Reservation, ReserveRequest, ReserveResult } from "../budget";
import type { Alert, AlertState, Monitor, Run, SerpRow, Settings, Severity, Snapshot } from "../types";

export interface AlertQuery {
  state?: AlertState;
  monitorId?: string;
  limit?: number;
  /** Cursor: only alerts created before this instant. */
  before?: string;
  /** Only alerts created at or after this instant. */
  since?: string;
}

export interface AlertCounts {
  open: number;
  snoozed: number;
  done: number;
  unread: number;
  /** Unread open alerts per monitor, for the left rail. */
  unreadByMonitor: Record<string, number>;
  openByMonitor: Record<string, number>;
}

export interface AlertPatch {
  state?: AlertState;
  snoozedUntil?: string | null;
  readAt?: string | null;
  severity?: Severity;
  severityReason?: string;
}

export interface RunQuery {
  monitorId?: string;
  since?: string;
  before?: string;
  limit?: number;
}

export interface SerpResult {
  id: string;
  monitorId: string;
  takenAt: string;
  rows: SerpRow[];
}

export type NewMonitor = Omit<Monitor, "id" | "ownerId" | "createdAt" | "lastRunAt" | "consecutiveFailures" | "lastErrorCode">;

/**
 * Everything the app reads and writes. Two implementations: an in-memory one seeded for the demo,
 * and Supabase, where row level security scopes every call to the signed-in user.
 */
export interface Store {
  readonly ownerId: string;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;

  listMonitors(): Promise<Monitor[]>;
  getMonitor(id: string): Promise<Monitor | null>;
  createMonitor(input: NewMonitor): Promise<Monitor>;
  updateMonitor(id: string, patch: Partial<Monitor>): Promise<Monitor | null>;
  deleteMonitor(id: string): Promise<void>;

  listAlerts(q: AlertQuery): Promise<Alert[]>;
  alertCounts(): Promise<AlertCounts>;
  getAlert(id: string): Promise<Alert | null>;
  updateAlerts(ids: string[], patch: AlertPatch): Promise<void>;
  /** Inserts alerts, skipping any whose (monitor, fingerprint) exists. Returns the rows written. */
  insertAlerts(alerts: Omit<Alert, "id" | "ownerId">[]): Promise<Alert[]>;
  fingerprints(monitorId: string): Promise<Set<string>>;

  listRuns(q: RunQuery): Promise<Run[]>;
  hasRun(idempotencyKey: string): Promise<boolean>;
  /** Inserts a run. Returns false when the idempotency key already has a row. */
  insertRun(run: Omit<Run, "id" | "ownerId">): Promise<Run | null>;
  /** Sum of actual cost since an instant, for one monitor or for all. */
  spentSince(since: string, monitorId?: string): Promise<number>;

  /**
   * Holds the quoted price of every item against the daily budget, the monthly budget and the
   * monitor's cap, all or none, in one atomic step. Two simultaneous callers cannot both pass.
   */
  reserveBudget(req: ReserveRequest): Promise<ReserveResult>;
  /** The run row holds the real cost now. The reservation stops counting. Only a reserved row changes. */
  settleReservation(key: string, at: Date): Promise<void>;
  /** The call failed or was refused. The reservation stops counting. Only a reserved row changes. */
  releaseReservation(key: string, at: Date): Promise<void>;
  /** The call is accepted but not finished. Remembers the looot run id; the reservation keeps counting. */
  holdReservation(key: string, loootRunId: string): Promise<void>;
  /** Reserved rows past their soft expiry, oldest first. */
  listExpiredReservations(at: Date): Promise<Reservation[]>;
  /** Used, held and left for today and this month. */
  budgetStatus(at: Date): Promise<BudgetStatus>;

  listSnapshots(monitorId: string): Promise<Snapshot[]>;
  getSnapshot(id: string): Promise<Snapshot | null>;
  insertSnapshot(s: Omit<Snapshot, "id" | "ownerId">): Promise<Snapshot>;

  listSerp(monitorId: string, limit?: number): Promise<SerpResult[]>;
  insertSerp(r: Omit<SerpResult, "id">): Promise<void>;

  deleteAllData(): Promise<void>;
}
