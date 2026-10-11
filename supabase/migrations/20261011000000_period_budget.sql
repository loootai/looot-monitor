-- Period budget with atomic reservation. Additive: one column on settings, one new table, four functions.
-- Nothing is dropped or rewritten, so it is safe to apply over 20261008000000_init.sql with data in it.
--
-- The monthly budget is the existing settings.workspace_cap_micros. The daily budget is new.
-- Before a paid call the runner reserves the quoted price with reserve_budget(). The function locks
-- the owner's settings row, adds up spent + reserved + the new amount and writes the reservation in
-- the same transaction, so two simultaneous runs cannot both pass.

alter table public.settings
  add column daily_budget_micros bigint not null default 1000000 check (daily_budget_micros >= 0);

-- One row per paid call that was quoted. state: reserved (counts against the budget), settled (the
-- run row holds the real cost), released (the call failed or was refused, nothing was spent).
create table public.budget_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  -- Same key the looot call uses. A second reservation for it is refused, so a pending call is never repeated.
  idempotency_key text not null,
  source text not null,
  endpoint_id text not null,
  trigger text not null check (trigger in ('schedule', 'manual')),
  slot timestamptz not null,
  amount_micros bigint not null check (amount_micros >= 0),
  state text not null default 'reserved' check (state in ('reserved', 'settled', 'released')),
  looot_run_id text,
  created_at timestamptz not null default now(),
  -- After this the reservation is checked against the run's real status (GET /v1/runs/{id}).
  expires_at timestamptz not null,
  -- After this a reservation that could not be resolved is released.
  hard_expires_at timestamptz not null,
  settled_at timestamptz,
  unique (owner_id, idempotency_key)
);
create index budget_reservations_owner_state_idx on public.budget_reservations (owner_id, state);
create index budget_reservations_monitor_idx on public.budget_reservations (monitor_id);

alter table public.budget_reservations enable row level security;
alter table public.budget_reservations force row level security;
create policy budget_reservations_select_own on public.budget_reservations for select to authenticated using (owner_id = (select auth.uid()));
create policy budget_reservations_insert_own on public.budget_reservations for insert to authenticated with check (owner_id = (select auth.uid()));
create policy budget_reservations_update_own on public.budget_reservations for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy budget_reservations_delete_own on public.budget_reservations for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.budget_reservations to authenticated;

-- A reservation row must point at a monitor of the same owner, like every other child table.
create trigger budget_reservations_owner_check before insert or update of monitor_id, owner_id on public.budget_reservations for each row execute function public.check_monitor_owner();

-- Reserves every item or none. Returns jsonb:
--   { ok: true, daily: {budget, spent, reserved}, monthly: {...} }
--   { ok: false, reason: 'duplicate' | 'budget', scope: 'daily' | 'monthly' | 'monitor', daily, monthly }
-- daily and monthly carry the numbers as they were before this call. Runs with the caller's rights,
-- so row level security stops a user from reserving against another owner.
create function public.reserve_budget(
  p_owner uuid,
  p_monitor uuid,
  p_items jsonb,
  p_trigger text,
  p_slot timestamptz,
  p_now timestamptz,
  p_day_start timestamptz,
  p_month_start timestamptz,
  p_soft_seconds int,
  p_hard_seconds int
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_daily bigint;
  v_monthly bigint;
  v_monitor_cap bigint;
  v_total bigint;
  v_spent_day bigint;
  v_spent_month bigint;
  v_spent_monitor bigint;
  v_reserved bigint;
  v_reserved_monitor bigint;
  v_numbers jsonb;
begin
  insert into public.settings (owner_id) values (p_owner) on conflict (owner_id) do nothing;
  -- The row lock is the whole point: every reservation for this owner waits here, one at a time.
  select s.daily_budget_micros, s.workspace_cap_micros into v_daily, v_monthly
    from public.settings s where s.owner_id = p_owner for update;
  if v_daily is null then
    raise exception 'no settings row for owner %', p_owner using errcode = '42501';
  end if;
  select m.monthly_cap_micros into v_monitor_cap from public.monitors m where m.id = p_monitor and m.owner_id = p_owner;
  if v_monitor_cap is null then
    raise exception 'monitor % does not belong to owner %', p_monitor, p_owner using errcode = '42501';
  end if;

  select coalesce(sum((i ->> 'amount_micros')::bigint), 0) into v_total from jsonb_array_elements(p_items) i;
  select coalesce(sum(r.actual_cost_micros), 0) into v_spent_day from public.runs r where r.owner_id = p_owner and r.started_at >= p_day_start;
  select coalesce(sum(r.actual_cost_micros), 0) into v_spent_month from public.runs r where r.owner_id = p_owner and r.started_at >= p_month_start;
  select coalesce(sum(r.actual_cost_micros), 0) into v_spent_monitor from public.runs r where r.owner_id = p_owner and r.monitor_id = p_monitor and r.started_at >= p_month_start;
  select coalesce(sum(b.amount_micros), 0), coalesce(sum(b.amount_micros) filter (where b.monitor_id = p_monitor), 0)
    into v_reserved, v_reserved_monitor
    from public.budget_reservations b where b.owner_id = p_owner and b.state = 'reserved';

  v_numbers := jsonb_build_object(
    'daily', jsonb_build_object('budget', v_daily, 'spent', v_spent_day, 'reserved', v_reserved),
    'monthly', jsonb_build_object('budget', v_monthly, 'spent', v_spent_month, 'reserved', v_reserved)
  );

  if exists (select 1 from public.budget_reservations b where b.owner_id = p_owner and b.idempotency_key in (select i ->> 'key' from jsonb_array_elements(p_items) i)) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate') || v_numbers;
  end if;
  if v_spent_day + v_reserved + v_total > v_daily then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'scope', 'daily') || v_numbers;
  end if;
  if v_spent_month + v_reserved + v_total > v_monthly then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'scope', 'monthly') || v_numbers;
  end if;
  if v_spent_monitor + v_reserved_monitor + v_total > v_monitor_cap then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'scope', 'monitor') || v_numbers;
  end if;

  insert into public.budget_reservations (owner_id, monitor_id, idempotency_key, source, endpoint_id, trigger, slot, amount_micros, created_at, expires_at, hard_expires_at)
  select p_owner, p_monitor, i ->> 'key', i ->> 'source', i ->> 'endpoint_id', p_trigger, p_slot, (i ->> 'amount_micros')::bigint, p_now, p_now + make_interval(secs => p_soft_seconds), p_now + make_interval(secs => p_hard_seconds)
  from jsonb_array_elements(p_items) i;
  return jsonb_build_object('ok', true) || v_numbers;
end;
$$;

-- The run row now holds the real cost. The reservation stops counting.
create function public.settle_reservation(p_owner uuid, p_key text, p_now timestamptz) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set state = 'settled', settled_at = p_now where owner_id = p_owner and idempotency_key = p_key and state = 'reserved';
$$;

-- The call failed or was refused, nothing was spent. Only a reserved row can be released.
create function public.release_reservation(p_owner uuid, p_key text, p_now timestamptz) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set state = 'released', settled_at = p_now where owner_id = p_owner and idempotency_key = p_key and state = 'reserved';
$$;

-- The call is accepted but not finished. Keep the looot run id so a later check can read its status.
create function public.hold_reservation(p_owner uuid, p_key text, p_looot_run_id text) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set looot_run_id = p_looot_run_id where owner_id = p_owner and idempotency_key = p_key and state = 'reserved';
$$;

grant execute on function public.reserve_budget(uuid, uuid, jsonb, text, timestamptz, timestamptz, timestamptz, timestamptz, int, int) to authenticated;
grant execute on function public.settle_reservation(uuid, text, timestamptz) to authenticated;
grant execute on function public.release_reservation(uuid, text, timestamptz) to authenticated;
grant execute on function public.hold_reservation(uuid, text, text) to authenticated;
