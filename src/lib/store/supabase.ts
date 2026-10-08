import type { SupabaseClient } from "@supabase/supabase-js";
import { endpointFor, sourcesFor, SOURCES } from "../sources";
import { DEFAULT_SETTINGS, type Alert, type Monitor, type Run, type Settings, type Snapshot } from "../types";
import type { AlertCounts, AlertPatch, AlertQuery, NewMonitor, RunQuery, SerpResult, Store } from "./types";

type Row = Record<string, unknown>;

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const NUMERIC = new Set(["workspace_cap_micros", "default_cap_micros", "max_cost_per_run_micros", "monthly_cap_micros", "quoted_micros", "actual_cost_micros"]);

/** Database row to app object: snake_case keys become camelCase, bigint text becomes a number. Nested json is left alone. */
function fromRow<T>(row: Row): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = NUMERIC.has(k) && v !== null ? Number(v) : v;
  return out as T;
}

/** App object to database row. Keys the table does not have are dropped by the caller. */
function toRow(obj: object, omit: string[] = []): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(obj)) if (!omit.includes(k) && v !== undefined) out[snake(k)] = v;
  return out;
}

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

/**
 * Store backed by Supabase. With the user's client, row level security scopes every call; the
 * owner filter is added anyway so the same class is safe with the service role in the cron.
 */
export class SupabaseStore implements Store {
  constructor(
    private readonly db: SupabaseClient,
    readonly ownerId: string,
  ) {}

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.db.from("settings").select("*").eq("owner_id", this.ownerId).maybeSingle();
    fail("read settings", error);
    if (data) {
      const { ownerId: _o, updatedAt: _u, ...s } = fromRow<Settings & { ownerId: string; updatedAt: string }>(data);
      return { ...DEFAULT_SETTINGS, ...s };
    }
    const created = await this.db.from("settings").insert({ owner_id: this.ownerId }).select("*").maybeSingle();
    if (created.error && created.error.code !== "23505") fail("create settings", created.error);
    return { ...DEFAULT_SETTINGS };
  }
  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const { error } = await this.db.from("settings").upsert({ owner_id: this.ownerId, ...toRow(patch), updated_at: new Date().toISOString() });
    fail("save settings", error);
    return this.getSettings();
  }

  async listMonitors(): Promise<Monitor[]> {
    const { data, error } = await this.db.from("monitors").select("*").eq("owner_id", this.ownerId).order("created_at", { ascending: true });
    fail("list monitors", error);
    return (data ?? []).map((r) => fromRow<Monitor>(r));
  }
  async getMonitor(id: string): Promise<Monitor | null> {
    const { data, error } = await this.db.from("monitors").select("*").eq("owner_id", this.ownerId).eq("id", id).maybeSingle();
    fail("read monitor", error);
    return data ? fromRow<Monitor>(data) : null;
  }
  async #syncSources(m: Monitor): Promise<void> {
    const wanted = [...sourcesFor(m.kind, m.config), ...(m.kind === "page" && m.config.screenshotOnChange ? (["screenshot"] as const) : [])];
    const rows = wanted.map((s) => ({ owner_id: this.ownerId, monitor_id: m.id, source: s, endpoint_id: endpointFor(s, m.config), job_id: SOURCES[s].jobId, enabled: true }));
    const up = await this.db.from("monitor_sources").upsert(rows, { onConflict: "monitor_id,source" });
    fail("save monitor sources", up.error);
    const off = await this.db.from("monitor_sources").update({ enabled: false }).eq("owner_id", this.ownerId).eq("monitor_id", m.id).not("source", "in", `(${wanted.join(",")})`);
    fail("save monitor sources", off.error);
  }
  async createMonitor(input: NewMonitor): Promise<Monitor> {
    const { data, error } = await this.db.from("monitors").insert({ owner_id: this.ownerId, ...toRow(input) }).select("*").single();
    fail("create monitor", error);
    const m = fromRow<Monitor>(data!);
    await this.#syncSources(m);
    return m;
  }
  async updateMonitor(id: string, patch: Partial<Monitor>): Promise<Monitor | null> {
    const { data, error } = await this.db.from("monitors").update({ ...toRow(patch, ["id", "ownerId", "createdAt"]), updated_at: new Date().toISOString() }).eq("owner_id", this.ownerId).eq("id", id).select("*").maybeSingle();
    fail("update monitor", error);
    if (!data) return null;
    const m = fromRow<Monitor>(data);
    if (patch.config || patch.kind) await this.#syncSources(m);
    return m;
  }
  async deleteMonitor(id: string): Promise<void> {
    const { error } = await this.db.from("monitors").delete().eq("owner_id", this.ownerId).eq("id", id);
    fail("delete monitor", error);
  }

  async listAlerts(q: AlertQuery): Promise<Alert[]> {
    let query = this.db.from("alerts").select("*").eq("owner_id", this.ownerId).order("created_at", { ascending: false }).limit(q.limit ?? 50);
    if (q.state) query = query.eq("state", q.state);
    if (q.monitorId) query = query.eq("monitor_id", q.monitorId);
    if (q.before) query = query.lt("created_at", q.before);
    if (q.since) query = query.gte("created_at", q.since);
    const { data, error } = await query;
    fail("list alerts", error);
    return (data ?? []).map((r) => fromRow<Alert>(r));
  }
  async alertCounts(): Promise<AlertCounts> {
    const c: AlertCounts = { open: 0, snoozed: 0, done: 0, unread: 0, unreadByMonitor: {}, openByMonitor: {} };
    const count = async (state: string) => {
      const { count: n, error } = await this.db.from("alerts").select("id", { count: "exact", head: true }).eq("owner_id", this.ownerId).eq("state", state);
      fail("count alerts", error);
      return n ?? 0;
    };
    [c.snoozed, c.done] = await Promise.all([count("snoozed"), count("done")]);
    // Open alerts are the working set; read the two columns the rail needs, capped.
    const { data, error } = await this.db.from("alerts").select("monitor_id, read_at").eq("owner_id", this.ownerId).eq("state", "open").limit(5000);
    fail("count alerts", error);
    for (const r of data ?? []) {
      c.open++;
      c.openByMonitor[r.monitor_id] = (c.openByMonitor[r.monitor_id] ?? 0) + 1;
      if (!r.read_at) {
        c.unread++;
        c.unreadByMonitor[r.monitor_id] = (c.unreadByMonitor[r.monitor_id] ?? 0) + 1;
      }
    }
    return c;
  }
  async getAlert(id: string): Promise<Alert | null> {
    const { data, error } = await this.db.from("alerts").select("*").eq("owner_id", this.ownerId).eq("id", id).maybeSingle();
    fail("read alert", error);
    return data ? fromRow<Alert>(data) : null;
  }
  async updateAlerts(ids: string[], patch: AlertPatch): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db.from("alerts").update(toRow(patch)).eq("owner_id", this.ownerId).in("id", ids);
    fail("update alerts", error);
  }
  async insertAlerts(alerts: Omit<Alert, "id" | "ownerId">[]): Promise<Alert[]> {
    if (alerts.length === 0) return [];
    const rows = alerts.map((a) => ({ owner_id: this.ownerId, ...toRow(a) }));
    const { data, error } = await this.db.from("alerts").upsert(rows, { onConflict: "monitor_id,fingerprint", ignoreDuplicates: true }).select("*");
    fail("insert alerts", error);
    return (data ?? []).map((r) => fromRow<Alert>(r));
  }
  async fingerprints(monitorId: string): Promise<Set<string>> {
    const { data, error } = await this.db.from("alerts").select("fingerprint").eq("owner_id", this.ownerId).eq("monitor_id", monitorId).order("created_at", { ascending: false }).limit(5000);
    fail("read fingerprints", error);
    return new Set((data ?? []).map((r) => r.fingerprint as string));
  }

  async listRuns(q: RunQuery): Promise<Run[]> {
    let query = this.db.from("runs").select("*").eq("owner_id", this.ownerId).order("started_at", { ascending: false }).limit(q.limit ?? 10_000);
    if (q.monitorId) query = query.eq("monitor_id", q.monitorId);
    if (q.since) query = query.gte("started_at", q.since);
    if (q.before) query = query.lt("started_at", q.before);
    const { data, error } = await query;
    fail("list runs", error);
    return (data ?? []).map((r) => fromRow<Run>(r));
  }
  async hasRun(idempotencyKey: string): Promise<boolean> {
    const { count, error } = await this.db.from("runs").select("id", { count: "exact", head: true }).eq("owner_id", this.ownerId).eq("idempotency_key", idempotencyKey);
    fail("read run", error);
    return (count ?? 0) > 0;
  }
  async insertRun(run: Omit<Run, "id" | "ownerId">): Promise<Run | null> {
    const { data, error } = await this.db.from("runs").insert({ owner_id: this.ownerId, ...toRow(run) }).select("*").maybeSingle();
    // 23505 is the unique index on (owner_id, idempotency_key): this slot already has a row.
    if (error?.code === "23505") return null;
    fail("insert run", error);
    return data ? fromRow<Run>(data) : null;
  }
  async spentSince(since: string, monitorId?: string): Promise<number> {
    const { data, error } = await this.db.rpc("spent_since", { p_owner: this.ownerId, p_since: since, p_monitor: monitorId ?? null });
    fail("sum spend", error);
    return Number(data ?? 0);
  }

  async listSnapshots(monitorId: string): Promise<Snapshot[]> {
    const { data, error } = await this.db.from("snapshots").select("*").eq("owner_id", this.ownerId).eq("monitor_id", monitorId).order("taken_at", { ascending: false }).limit(200);
    fail("list snapshots", error);
    return (data ?? []).map((r) => fromRow<Snapshot>(r));
  }
  async getSnapshot(id: string): Promise<Snapshot | null> {
    const { data, error } = await this.db.from("snapshots").select("*").eq("owner_id", this.ownerId).eq("id", id).maybeSingle();
    fail("read snapshot", error);
    return data ? fromRow<Snapshot>(data) : null;
  }
  async insertSnapshot(s: Omit<Snapshot, "id" | "ownerId">): Promise<Snapshot> {
    const { data, error } = await this.db.from("snapshots").insert({ owner_id: this.ownerId, ...toRow(s) }).select("*").single();
    fail("insert snapshot", error);
    return fromRow<Snapshot>(data!);
  }

  async listSerp(monitorId: string, limit = 30): Promise<SerpResult[]> {
    const { data, error } = await this.db.from("serp_results").select("*").eq("owner_id", this.ownerId).eq("monitor_id", monitorId).order("taken_at", { ascending: false }).limit(limit);
    fail("list results", error);
    return (data ?? []).map((r) => fromRow<SerpResult>(r));
  }
  async insertSerp(r: Omit<SerpResult, "id">): Promise<void> {
    const { error } = await this.db.from("serp_results").insert({ owner_id: this.ownerId, monitor_id: r.monitorId, taken_at: r.takenAt, rows: r.rows });
    fail("insert results", error);
  }

  async deleteAllData(): Promise<void> {
    // Monitors cascade to sources, runs, snapshots, results and alerts.
    const m = await this.db.from("monitors").delete().eq("owner_id", this.ownerId);
    fail("delete monitors", m.error);
    const s = await this.db.from("settings").delete().eq("owner_id", this.ownerId);
    fail("delete settings", s.error);
  }
}
