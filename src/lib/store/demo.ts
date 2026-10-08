import { buildSeed, DEMO_OWNER, type Seed } from "@/demo/seed";
import type { Alert, Monitor, Run, Settings, Snapshot } from "../types";
import type { AlertCounts, AlertPatch, AlertQuery, NewMonitor, RunQuery, SerpResult, Store } from "./types";

let seq = 0;
const newId = (prefix: string) => `${prefix}-n${String(++seq).padStart(4, "0")}`;
const desc = <T>(key: (t: T) => string) => (a: T, b: T) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0);

/** In-memory store for demo mode and for tests. Starts from the seed, or empty. */
export class MemoryStore implements Store {
  readonly ownerId = DEMO_OWNER;
  #d: Seed;

  constructor(seed?: Seed) {
    this.#d = seed ?? { settings: { ...buildEmptySettings() }, monitors: [], runs: [], alerts: [], snapshots: [], serp: [] };
  }

  async getSettings(): Promise<Settings> {
    return { ...this.#d.settings };
  }
  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    this.#d.settings = { ...this.#d.settings, ...patch };
    return { ...this.#d.settings };
  }

  async listMonitors(): Promise<Monitor[]> {
    return this.#d.monitors.map((m) => ({ ...m }));
  }
  async getMonitor(id: string): Promise<Monitor | null> {
    const m = this.#d.monitors.find((x) => x.id === id);
    return m ? { ...m } : null;
  }
  async createMonitor(input: NewMonitor): Promise<Monitor> {
    const m: Monitor = { ...input, id: newId("mon"), ownerId: this.ownerId, createdAt: input.confirmedAt, lastRunAt: null, consecutiveFailures: 0, lastErrorCode: null };
    this.#d.monitors.push(m);
    return { ...m };
  }
  async updateMonitor(id: string, patch: Partial<Monitor>): Promise<Monitor | null> {
    const i = this.#d.monitors.findIndex((x) => x.id === id);
    if (i < 0) return null;
    this.#d.monitors[i] = { ...this.#d.monitors[i], ...patch, id, ownerId: this.ownerId };
    return { ...this.#d.monitors[i] };
  }
  async deleteMonitor(id: string): Promise<void> {
    this.#d.monitors = this.#d.monitors.filter((m) => m.id !== id);
    this.#d.alerts = this.#d.alerts.filter((a) => a.monitorId !== id);
    this.#d.runs = this.#d.runs.filter((r) => r.monitorId !== id);
    this.#d.snapshots = this.#d.snapshots.filter((s) => s.monitorId !== id);
    this.#d.serp = this.#d.serp.filter((s) => s.monitorId !== id);
  }

  async listAlerts(q: AlertQuery): Promise<Alert[]> {
    return this.#d.alerts
      .filter((a) => (!q.state || a.state === q.state) && (!q.monitorId || a.monitorId === q.monitorId) && (!q.before || a.createdAt < q.before) && (!q.since || a.createdAt >= q.since))
      .sort(desc((a) => a.createdAt))
      .slice(0, q.limit ?? 50)
      .map((a) => ({ ...a }));
  }
  async alertCounts(): Promise<AlertCounts> {
    const c: AlertCounts = { open: 0, snoozed: 0, done: 0, unread: 0, unreadByMonitor: {}, openByMonitor: {} };
    for (const a of this.#d.alerts) {
      c[a.state]++;
      if (a.state !== "open") continue;
      c.openByMonitor[a.monitorId] = (c.openByMonitor[a.monitorId] ?? 0) + 1;
      if (!a.readAt) {
        c.unread++;
        c.unreadByMonitor[a.monitorId] = (c.unreadByMonitor[a.monitorId] ?? 0) + 1;
      }
    }
    return c;
  }
  async getAlert(id: string): Promise<Alert | null> {
    const a = this.#d.alerts.find((x) => x.id === id);
    return a ? { ...a } : null;
  }
  async updateAlerts(ids: string[], patch: AlertPatch): Promise<void> {
    const set = new Set(ids);
    this.#d.alerts = this.#d.alerts.map((a) => (set.has(a.id) ? { ...a, ...patch } : a));
  }
  async insertAlerts(alerts: Omit<Alert, "id" | "ownerId">[]): Promise<Alert[]> {
    const out: Alert[] = [];
    for (const a of alerts) {
      if (this.#d.alerts.some((x) => x.monitorId === a.monitorId && x.fingerprint === a.fingerprint)) continue;
      const row: Alert = { ...a, id: newId("al"), ownerId: this.ownerId };
      this.#d.alerts.push(row);
      out.push({ ...row });
    }
    return out;
  }
  async fingerprints(monitorId: string): Promise<Set<string>> {
    return new Set(this.#d.alerts.filter((a) => a.monitorId === monitorId).map((a) => a.fingerprint));
  }

  async listRuns(q: RunQuery): Promise<Run[]> {
    const out: Run[] = [];
    const rows = [...this.#d.runs].sort(desc((r) => r.startedAt));
    for (const r of rows) {
      if (q.monitorId && r.monitorId !== q.monitorId) continue;
      if (q.since && r.startedAt < q.since) continue;
      if (q.before && r.startedAt >= q.before) continue;
      out.push({ ...r });
      if (q.limit && out.length >= q.limit) break;
    }
    return out;
  }
  async hasRun(idempotencyKey: string): Promise<boolean> {
    return this.#d.runs.some((r) => r.idempotencyKey === idempotencyKey);
  }
  async insertRun(run: Omit<Run, "id" | "ownerId">): Promise<Run | null> {
    // Same rule as the unique index on (owner_id, idempotency_key).
    if (this.#d.runs.some((r) => r.idempotencyKey === run.idempotencyKey)) return null;
    const row: Run = { ...run, id: newId("rn"), ownerId: this.ownerId };
    this.#d.runs.push(row);
    return { ...row };
  }
  async spentSince(since: string, monitorId?: string): Promise<number> {
    let n = 0;
    for (const r of this.#d.runs) if (r.startedAt >= since && (!monitorId || r.monitorId === monitorId)) n += r.actualCostMicros;
    return n;
  }

  async listSnapshots(monitorId: string): Promise<Snapshot[]> {
    return this.#d.snapshots.filter((s) => s.monitorId === monitorId).sort(desc((s) => s.takenAt)).map((s) => ({ ...s }));
  }
  async getSnapshot(id: string): Promise<Snapshot | null> {
    const s = this.#d.snapshots.find((x) => x.id === id);
    return s ? { ...s } : null;
  }
  async insertSnapshot(s: Omit<Snapshot, "id" | "ownerId">): Promise<Snapshot> {
    const row: Snapshot = { ...s, id: newId("sn"), ownerId: this.ownerId };
    this.#d.snapshots.push(row);
    return { ...row };
  }

  async listSerp(monitorId: string, limit = 30): Promise<SerpResult[]> {
    return this.#d.serp.filter((s) => s.monitorId === monitorId).sort(desc((s) => s.takenAt)).slice(0, limit);
  }
  async insertSerp(r: Omit<SerpResult, "id">): Promise<void> {
    this.#d.serp.push({ ...r, id: newId("sr") });
  }

  async deleteAllData(): Promise<void> {
    this.#d = { settings: buildEmptySettings(), monitors: [], runs: [], alerts: [], snapshots: [], serp: [] };
  }
}

function buildEmptySettings(): Settings {
  return {
    workspaceCapMicros: 3_000_000,
    defaultCapMicros: 250_000,
    escalationWords: ["outage", "breach", "lawsuit", "scam", "refund", "down", "leak"],
    priorityDomains: [],
    competitorDomains: [],
    ignorePatterns: ["cookie", "last updated"],
    snapshotRetentionDays: 90,
    rawRetentionDays: 30,
    timezone: "UTC",
    digestPeriod: "weekly",
    digestSeverities: ["high", "medium", "low"],
    digestHour: 8,
  };
}

const g = globalThis as unknown as { __loootMonitorDemo?: MemoryStore };

/** The one demo store of this server process, seeded on first use. */
export function demoStore(): MemoryStore {
  if (!g.__loootMonitorDemo) g.__loootMonitorDemo = new MemoryStore(buildSeed());
  return g.__loootMonitorDemo;
}
