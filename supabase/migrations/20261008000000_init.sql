-- looot-monitor schema. Seven tables, each with owner_id, row level security enabled and forced,
-- and four policies that compare owner_id with the signed-in user.
-- Money is integer micro-dollars (bigint). Times are timestamptz.

create extension if not exists pgcrypto;

-- One row per user. Created on first load.
create table public.settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  workspace_cap_micros bigint not null default 3000000 check (workspace_cap_micros >= 0),
  default_cap_micros bigint not null default 250000 check (default_cap_micros >= 0),
  escalation_words text[] not null default array['outage', 'breach', 'lawsuit', 'scam', 'refund', 'down', 'leak'],
  priority_domains text[] not null default '{}',
  competitor_domains text[] not null default '{}',
  ignore_patterns text[] not null default array['cookie', 'last updated'],
  snapshot_retention_days int not null default 90 check (snapshot_retention_days between 1 and 3650),
  raw_retention_days int not null default 30 check (raw_retention_days between 1 and 3650),
  timezone text not null default 'UTC',
  digest_period text not null default 'weekly' check (digest_period in ('daily', 'weekly')),
  digest_severities text[] not null default array['high', 'medium', 'low'],
  digest_hour smallint not null default 8 check (digest_hour between 0 and 23),
  updated_at timestamptz not null default now()
);

create table public.monitors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('mention', 'serp', 'page', 'reviews')),
  owner_tag text not null default 'mine' check (owner_tag in ('mine', 'competitor')),
  competitor_name text,
  config jsonb not null default '{}',
  schedule text not null check (schedule in ('hourly', 'every_6h', 'daily', 'weekly')),
  run_hour smallint not null default 8 check (run_hour between 0 and 23),
  status text not null default 'active' check (status in ('active', 'paused', 'paused_budget', 'failing')),
  max_cost_per_run_micros bigint not null check (max_cost_per_run_micros > 0),
  monthly_cap_micros bigint not null check (monthly_cap_micros > 0),
  confirmed_at timestamptz not null default now(),
  next_run_at timestamptz,
  last_run_at timestamptz,
  consecutive_failures int not null default 0,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index monitors_owner_status_idx on public.monitors (owner_id, status);
-- The cron scan: active monitors that are due.
create index monitors_due_idx on public.monitors (next_run_at) where status in ('active', 'failing');

create table public.monitor_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  source text not null check (source in ('news', 'google', 'page', 'screenshot', 'x', 'reddit', 'linkedin', 'maps_reviews', 'appstore_reviews')),
  endpoint_id text not null,
  job_id text not null,
  enabled boolean not null default true,
  last_hash text,
  last_ok_at timestamptz,
  unique (monitor_id, source)
);
create index monitor_sources_owner_idx on public.monitor_sources (owner_id);

-- One row per looot call. Spend is always a sum over this table.
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  source text not null,
  trigger text not null check (trigger in ('schedule', 'manual')),
  slot timestamptz not null,
  idempotency_key text not null,
  endpoint_id text not null,
  looot_run_id text,
  status text not null check (status in ('completed', 'failed', 'blocked', 'stopped', 'blocked_price', 'blocked_budget', 'demo')),
  quoted_micros bigint not null default 0,
  actual_cost_micros bigint not null default 0 check (actual_cost_micros >= 0),
  new_items int not null default 0,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- A cron retry for the same slot cannot write, or charge, twice.
  unique (owner_id, idempotency_key)
);
create index runs_owner_started_idx on public.runs (owner_id, started_at desc);
create index runs_monitor_started_idx on public.runs (monitor_id, started_at desc);

-- Page monitors only. Content is the normalised markdown after ignore patterns.
create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  content_hash text not null,
  content text not null,
  title text,
  bytes int not null default 0,
  screenshot_url text,
  changed boolean not null default false,
  taken_at timestamptz not null default now()
);
create index snapshots_monitor_taken_idx on public.snapshots (monitor_id, taken_at desc);
create index snapshots_owner_idx on public.snapshots (owner_id);
create index snapshots_run_idx on public.snapshots (run_id);

-- Google monitors only. One stored result list per run.
create table public.serp_results (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  rows jsonb not null default '[]',
  taken_at timestamptz not null default now()
);
create index serp_results_monitor_taken_idx on public.serp_results (monitor_id, taken_at desc);
create index serp_results_owner_idx on public.serp_results (owner_id);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  source text not null,
  kind text not null check (kind in ('mention', 'serp_new', 'serp_move', 'page_change', 'review', 'system')),
  fingerprint text not null,
  severity text not null check (severity in ('high', 'medium', 'low')),
  severity_reason text not null default '',
  title text not null,
  url text,
  domain text,
  author text,
  snippet text,
  published_at timestamptz,
  payload jsonb not null default '{}',
  state text not null default 'open' check (state in ('open', 'snoozed', 'done')),
  snoozed_until timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  -- The dedupe: one alert per thing per monitor.
  unique (monitor_id, fingerprint)
);
create index alerts_owner_state_created_idx on public.alerts (owner_id, state, created_at desc);
create index alerts_owner_severity_created_idx on public.alerts (owner_id, severity, created_at desc);
create index alerts_run_idx on public.alerts (run_id);

-- A child row must have the same owner as its monitor. Row level security already stops a user
-- from reading another user's monitor; this stops a row from pointing at one.
create function public.check_monitor_owner() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.monitors m where m.id = new.monitor_id and m.owner_id = new.owner_id) then
    raise exception 'monitor % does not belong to owner %', new.monitor_id, new.owner_id using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger monitor_sources_owner_check before insert or update of monitor_id, owner_id on public.monitor_sources for each row execute function public.check_monitor_owner();
create trigger runs_owner_check before insert or update of monitor_id, owner_id on public.runs for each row execute function public.check_monitor_owner();
create trigger snapshots_owner_check before insert or update of monitor_id, owner_id on public.snapshots for each row execute function public.check_monitor_owner();
create trigger serp_results_owner_check before insert or update of monitor_id, owner_id on public.serp_results for each row execute function public.check_monitor_owner();
create trigger alerts_owner_check before insert or update of monitor_id, owner_id on public.alerts for each row execute function public.check_monitor_owner();

-- Sum of what an owner spent since an instant, for one monitor or for all. Runs with the caller's
-- rights, so row level security still applies to a signed-in user.
create function public.spent_since(p_owner uuid, p_since timestamptz, p_monitor uuid default null) returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(r.actual_cost_micros), 0)::bigint
  from public.runs r
  where r.owner_id = p_owner and r.started_at >= p_since and (p_monitor is null or r.monitor_id = p_monitor);
$$;

-- Row level security: enabled and forced on every table, four policies each.
do $$
declare
  t text;
begin
  foreach t in array array['settings', 'monitors', 'monitor_sources', 'runs', 'snapshots', 'serp_results', 'alerts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t || '_delete_own', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

grant execute on function public.spent_since(uuid, timestamptz, uuid) to authenticated;
