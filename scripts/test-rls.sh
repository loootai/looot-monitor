#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local Postgres (initdb, pg_ctl, psql on PATH) with a
# stand-in auth schema, then checks that row level security keeps users apart in all seven tables.
# Deletes the cluster after.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
for tool in initdb pg_ctl psql; do
  command -v "$tool" >/dev/null 2>&1 || { echo "RLS check skipped: $tool is not on PATH. Install PostgreSQL to run it."; exit 0; }
done
dir="$(mktemp -d)"
port="${PGPORT_TEST:-55441}"
cleanup() { pg_ctl -D "$dir/db" stop -m fast >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT
initdb -D "$dir/db" -U postgres -A trust >/dev/null
pg_ctl -D "$dir/db" -o "-p $port -k '' -c listen_addresses=127.0.0.1" -l "$dir/log" -w start >/dev/null
p() { psql -X -q -h 127.0.0.1 -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
p -f "$root/supabase/tests/auth_stub.sql"
for f in "$root"/supabase/migrations/*.sql; do p -f "$f"; done
out="$(p -At -f "$root/supabase/tests/rls_check.sql" 2>&1)"
echo "$out"
fail() { echo "RLS check FAILED: $1"; exit 1; }
tables="settings monitors monitor_sources runs snapshots serp_results alerts"
for t in $tables; do
  [[ "$out" == *"user1 sees $t|1"* ]] || fail "user1 should see 1 row in $t"
  [[ "$out" == *"user2 sees $t|0"* ]] || fail "user2 should see 0 rows in $t"
  [[ "$out" == *"user2 updated $t|0"* ]] || fail "user2 updated rows in $t"
  [[ "$out" == *"user2 deleted $t|0"* ]] || fail "user2 deleted rows in $t"
done
[[ "$out" == *"user1 spent|200"* ]] || fail "spent_since for the owner"
[[ "$out" == *"user2 spent of user1|0"* ]] || fail "user2 can read user1 spend"
[[ "$out" == *"duplicate idempotency key refused"* ]] || fail "duplicate run row accepted"
[[ "$out" == *"spoofed owner_id refused by RLS"* ]] || fail "spoofed owner accepted"
[[ "$out" == *"alert under another user monitor refused"* ]] || fail "alert under another user's monitor accepted"
[[ "$out" == *"run under another user monitor refused"* ]] || fail "run under another user's monitor accepted"
[[ "$out" == *"user1 still has|7"* ]] || fail "user1 lost rows"
[[ "$out" != *"ACCEPTED"* ]] || fail "a refused write went through"
echo "RLS check passed: 7 tables"
