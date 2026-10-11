/**
 * The reservation functions in supabase/migrations, run on a throwaway local Postgres (initdb and
 * pg_ctl on PATH, no containers). Skips with a note when PostgreSQL is not installed. Concurrent
 * callers are real psql processes held at an advisory-lock barrier and released together.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const PG_BIN = ["/opt/homebrew/opt/postgresql@17/bin", ...(process.env.PATH ?? "").split(":")];
const bin = (name: string) => PG_BIN.map((d) => path.join(d, name)).find((p) => existsSync(p));
const have = Boolean(bin("initdb") && bin("pg_ctl") && bin("psql"));
if (!have) console.warn("budgetSql tests skipped: initdb, pg_ctl and psql are not on PATH. Install PostgreSQL to run them.");

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const M1 = "aaaaaaaa-0000-0000-0000-000000000001";
const M2 = "aaaaaaaa-0000-0000-0000-000000000002";
const NOW = "2026-10-08T09:10:00Z";
const DAY = "2026-10-08T00:00:00Z";
const MONTH = "2026-10-01T00:00:00Z";

let dir = "";
let port = 0;
let pgBinDir = "";

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

const psqlArgs = (extra: string[]) => ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", ...extra];
const psql = (...extra: string[]) => execFileSync(path.join(pgBinDir, "psql"), psqlArgs(extra), { encoding: "utf8" }).trim();
const sql = (q: string) => psql("-c", q);

interface Reply {
  ok: boolean;
  reason?: string;
  scope?: string;
  daily: { budget: number; spent: number; reserved: number };
  monthly: { budget: number; spent: number; reserved: number };
}
const items = (...rows: [string, number][]) => JSON.stringify(rows.map(([key, amount]) => ({ key, source: "news", endpoint_id: "serper-news", amount_micros: amount }))).replace(/'/g, "''");
const reserveSql = (owner: string, monitor: string, rows: [string, number][], now = NOW) =>
  `select public.reserve_budget('${owner}', '${monitor}', '${items(...rows)}'::jsonb, 'schedule', '${now}', '${now}', '${DAY}', '${MONTH}', 900, 86400)`;
const reserve = (owner: string, monitor: string, rows: [string, number][], now = NOW) => JSON.parse(sql(reserveSql(owner, monitor, rows, now))) as Reply;
const setBudget = (owner: string, daily: number, monthly: number) => sql(`update public.settings set daily_budget_micros = ${daily}, workspace_cap_micros = ${monthly} where owner_id = '${owner}'`);
const reservedSum = (owner: string) => Number(sql(`select coalesce(sum(amount_micros), 0) from public.budget_reservations where owner_id = '${owner}' and state = 'reserved'`));
const reset = () => sql(`truncate public.budget_reservations; delete from public.runs; update public.settings set daily_budget_micros = 1000, workspace_cap_micros = 100000`);

/** Starts n psql clients that all wait on one advisory lock, then releases them together. */
async function race(n: number, query: (i: number) => string): Promise<string[]> {
  const holder = spawn(path.join(pgBinDir, "psql"), psqlArgs([]), { stdio: ["pipe", "ignore", "ignore"] });
  holder.stdin.write("select pg_advisory_lock(4242);\n");
  await new Promise((r) => setTimeout(r, 300));
  const clients = Array.from({ length: n }, (_, i) => {
    const p = spawn(path.join(pgBinDir, "psql"), psqlArgs(["-c", "select pg_advisory_lock_shared(4242)", "-c", query(i)]), { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    return new Promise<string>((resolve) => p.on("close", () => resolve(out.split("\n").filter((l) => l.startsWith("{")).join("\n"))));
  });
  // Wait until every client is blocked on the lock, then let them all go at once.
  for (let t = 0; t < 100; t++) {
    if (Number(sql("select count(*) from pg_locks where locktype = 'advisory' and not granted")) >= n) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  holder.stdin.write("select pg_advisory_unlock(4242);\n\\q\n");
  return Promise.all(clients);
}

describe.skipIf(!have)("reserve_budget on Postgres", () => {
  beforeAll(async () => {
    pgBinDir = path.dirname(bin("psql")!);
    dir = path.resolve(root, "..", ".pgtest-looot-monitor");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    port = await freePort();
    execFileSync(path.join(pgBinDir, "initdb"), ["-D", path.join(dir, "db"), "-U", "postgres", "-A", "trust"], { stdio: "ignore" });
    execFileSync(path.join(pgBinDir, "pg_ctl"), ["-D", path.join(dir, "db"), "-o", `-p ${port} -k '' -c listen_addresses=127.0.0.1 -c max_connections=60`, "-l", path.join(dir, "log"), "-w", "start"], { stdio: "ignore" });
    psql("-f", path.join(root, "supabase/tests/auth_stub.sql"));
    for (const f of readdirSync(path.join(root, "supabase/migrations")).sort()) psql("-f", path.join(root, "supabase/migrations", f));
    sql(`insert into public.settings (owner_id) values ('${U1}'), ('${U2}')`);
    sql(`insert into public.monitors (id, owner_id, name, kind, schedule, max_cost_per_run_micros, monthly_cap_micros) values ('${M1}', '${U1}', 'A', 'mention', 'hourly', 1000, 50000), ('${M2}', '${U1}', 'B', 'mention', 'hourly', 1000, 1500)`);
  }, 60_000);

  afterAll(() => {
    if (!dir) return;
    spawnSync(path.join(pgBinDir, "pg_ctl"), ["-D", path.join(dir, "db"), "stop", "-m", "fast"], { stdio: "ignore" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("ten simultaneous reservations of 400 against a 1000 budget: exactly two succeed", async () => {
    reset();
    const outs = await race(10, (i) => reserveSql(U1, M1, [[`k${i}`, 400]]));
    const replies = outs.map((o) => JSON.parse(o) as Reply);
    expect(replies).toHaveLength(10);
    expect(replies.filter((r) => r.ok)).toHaveLength(2);
    expect(replies.filter((r) => !r.ok && r.scope === "daily")).toHaveLength(8);
    expect(reservedSum(U1)).toBe(800);
  }, 60_000);

  it("two simultaneous reservations of 600 against a 1000 budget: exactly one succeeds", async () => {
    reset();
    const outs = await race(2, (i) => reserveSql(U1, M1, [[`two${i}`, 600]]));
    expect(outs.map((o) => (JSON.parse(o) as Reply).ok).sort()).toEqual([false, true]);
    expect(reservedSum(U1)).toBe(600);
  }, 60_000);

  it("the race harness can see a race: a read-then-write version lets several through", async () => {
    reset();
    sql(`create or replace function public.naive_reserve(p_owner uuid, p_key text, p_amount bigint) returns boolean language plpgsql as $$
      declare held bigint;
      begin
        select coalesce(sum(amount_micros), 0) into held from public.budget_reservations where owner_id = p_owner and state = 'reserved';
        perform pg_sleep(0.3);
        if held + p_amount > 1000 then return false; end if;
        insert into public.budget_reservations (owner_id, monitor_id, idempotency_key, source, endpoint_id, trigger, slot, amount_micros, expires_at, hard_expires_at)
          values (p_owner, '${M1}', p_key, 'news', 'serper-news', 'schedule', now(), p_amount, now(), now());
        return true;
      end $$`);
    const outs = await race(4, (i) => `select jsonb_build_object('ok', public.naive_reserve('${U1}', 'n${i}', 600))`);
    expect(outs.filter((o) => (JSON.parse(o) as { ok: boolean }).ok).length).toBeGreaterThan(1);
    sql("drop function public.naive_reserve(uuid, text, bigint)");
  }, 60_000);

  it("refuses at the monthly budget and says which one", () => {
    reset();
    setBudget(U1, 100_000, 1500);
    expect(reserve(U1, M1, [["m1", 1000]]).ok).toBe(true);
    const r = reserve(U1, M1, [["m2", 1000]]);
    expect(r).toMatchObject({ ok: false, scope: "monthly" });
    expect(r.monthly).toMatchObject({ budget: 1500, reserved: 1000, spent: 0 });
  });

  it("refuses at one monitor's monthly cap", () => {
    reset();
    setBudget(U1, 100_000, 100_000);
    expect(reserve(U1, M2, [["c1", 1000]]).ok).toBe(true);
    expect(reserve(U1, M2, [["c2", 1000]])).toMatchObject({ ok: false, scope: "monitor" });
    expect(reserve(U1, M1, [["c3", 1000]]).ok).toBe(true);
  });

  it("counts spent runs and holds together, and a day that rolled over does not count against the daily budget", () => {
    reset();
    sql(`insert into public.runs (owner_id, monitor_id, source, trigger, slot, idempotency_key, endpoint_id, status, actual_cost_micros, started_at) values ('${U1}', '${M1}', 'news', 'schedule', '${DAY}', 'old', 'serper-news', 'completed', 900, '2026-10-07T12:00:00Z')`);
    setBudget(U1, 1000, 2000);
    expect(reserve(U1, M1, [["d1", 1000]]).ok).toBe(true); // yesterday's 900 is not in today
    expect(reserve(U1, M1, [["d2", 200]])).toMatchObject({ ok: false, scope: "daily" });
    sql(`update public.budget_reservations set state = 'released'`);
    setBudget(U1, 5000, 2000);
    expect(reserve(U1, M1, [["d3", 1200]])).toMatchObject({ ok: false, scope: "monthly" }); // 900 spent this month + 1200 > 2000
    sql(`insert into public.runs (owner_id, monitor_id, source, trigger, slot, idempotency_key, endpoint_id, status, actual_cost_micros, started_at) values ('${U1}', '${M1}', 'news', 'schedule', '${DAY}', 'today', 'serper-news', 'completed', 800, '${NOW}')`);
    setBudget(U1, 1000, 2000);
    expect(reserve(U1, M1, [["d4", 300]])).toMatchObject({ ok: false, scope: "daily" });
    expect(reserve(U1, M1, [["d5", 200]]).ok).toBe(true);
  });

  it("refuses a repeated key and writes nothing", () => {
    reset();
    expect(reserve(U1, M1, [["dup", 100]]).ok).toBe(true);
    expect(reserve(U1, M1, [["dup", 100]])).toMatchObject({ ok: false, reason: "duplicate" });
    expect(Number(sql(`select count(*) from public.budget_reservations where idempotency_key = 'dup'`))).toBe(1);
  });

  it("takes every item or none", () => {
    reset();
    expect(reserve(U1, M1, [["a", 600], ["b", 600]])).toMatchObject({ ok: false, scope: "daily" });
    expect(Number(sql("select count(*) from public.budget_reservations"))).toBe(0);
    expect(reserve(U1, M1, [["a", 400], ["b", 500]]).ok).toBe(true);
    expect(Number(sql("select count(*) from public.budget_reservations"))).toBe(2);
  });

  it("settle, release and hold change only a reserved row", () => {
    reset();
    reserve(U1, M1, [["s", 300], ["r", 300], ["h", 300]]);
    sql(`select public.settle_reservation('${U1}', 's', '${NOW}')`);
    sql(`select public.release_reservation('${U1}', 'r', '${NOW}')`);
    sql(`select public.hold_reservation('${U1}', 'h', 'run_abc')`);
    expect(sql(`select state || ':' || idempotency_key from public.budget_reservations order by idempotency_key`).split("\n")).toEqual(["reserved:h", "released:r", "settled:s"]);
    expect(sql(`select looot_run_id from public.budget_reservations where idempotency_key = 'h'`)).toBe("run_abc");
    // A settled row cannot be released afterwards, so a late release never frees money that was spent.
    sql(`select public.release_reservation('${U1}', 's', '${NOW}')`);
    expect(sql(`select state from public.budget_reservations where idempotency_key = 's'`)).toBe("settled");
    expect(reservedSum(U1)).toBe(300);
  });

  it("a pending reservation keeps counting until it is released", () => {
    reset();
    expect(reserve(U1, M1, [["p", 800]]).ok).toBe(true);
    sql(`select public.hold_reservation('${U1}', 'p', 'run_p')`);
    expect(reserve(U1, M1, [["q", 800]])).toMatchObject({ ok: false, scope: "daily" });
    sql(`select public.release_reservation('${U1}', 'p', '${NOW}')`);
    expect(reserve(U1, M1, [["q", 800]]).ok).toBe(true);
  });

  it("stores the soft and hard expiry", () => {
    reset();
    reserve(U1, M1, [["e", 100]]);
    expect(sql(`select extract(epoch from expires_at - created_at)::int || ',' || extract(epoch from hard_expires_at - created_at)::int from public.budget_reservations where idempotency_key = 'e'`)).toBe("900,86400");
  });

  it("another user cannot reserve against, read or release the owner's budget", () => {
    reset();
    reserve(U1, M1, [["own", 100]]);
    const asU2 = (q: string) => spawnSync(path.join(pgBinDir, "psql"), psqlArgs(["-c", "set role authenticated", "-c", `select set_config('request.jwt.claim.sub', '${U2}', false)`, "-c", q]), { encoding: "utf8" });
    const r = asU2(reserveSql(U1, M1, [["theft", 100]]));
    expect(r.status === 0 && r.stdout.includes('"ok": true')).toBe(false);
    expect(asU2("select count(*) from public.budget_reservations").stdout.trim().split("\n").pop()).toBe("0");
    asU2(`select public.release_reservation('${U1}', 'own', '${NOW}')`);
    expect(sql(`select state from public.budget_reservations where idempotency_key = 'own'`)).toBe("reserved");
    expect(Number(sql(`select count(*) from public.budget_reservations where idempotency_key = 'theft'`))).toBe(0);
  });
});
