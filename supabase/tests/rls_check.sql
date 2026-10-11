-- Run by scripts/test-rls.sh after the migrations. Prints "label|value" lines that the script checks.
\set u1 '11111111-1111-1111-1111-111111111111'
\set u2 '22222222-2222-2222-2222-222222222222'

set role authenticated;
select set_config('request.jwt.claim.sub', :'u1', false);

insert into public.settings default values;
insert into public.monitors (id, name, kind, schedule, max_cost_per_run_micros, monthly_cap_micros)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'A monitor', 'page', 'daily', 200, 100000);
insert into public.monitor_sources (monitor_id, source, endpoint_id, job_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'page', 'jina-reader', 'web.scrape.markdown');
insert into public.runs (id, monitor_id, source, trigger, slot, idempotency_key, endpoint_id, status, actual_cost_micros)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'page', 'schedule', now(), 'mon:a:page:slot1', 'jina-reader', 'completed', 200);
insert into public.snapshots (monitor_id, content_hash, content) values ('aaaaaaaa-0000-0000-0000-000000000001', 'h1', 'text');
insert into public.budget_reservations (monitor_id, idempotency_key, source, endpoint_id, trigger, slot, amount_micros, expires_at, hard_expires_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'res1', 'page', 'jina-reader', 'manual', now(), 200, now(), now());
insert into public.serp_results (monitor_id) values ('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.alerts (monitor_id, source, kind, fingerprint, severity, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'page', 'page_change', 'fp1', 'high', 'A alert');

select 'user1 sees ' || t || '|' || n from (
  select 'settings' t, count(*) n from public.settings union all
  select 'monitors', count(*) from public.monitors union all
  select 'monitor_sources', count(*) from public.monitor_sources union all
  select 'runs', count(*) from public.runs union all
  select 'snapshots', count(*) from public.snapshots union all
  select 'serp_results', count(*) from public.serp_results union all
  select 'alerts', count(*) from public.alerts union all
  select 'budget_reservations', count(*) from public.budget_reservations) x order by t;
select 'user1 spent|' || public.spent_since(:'u1', now() - interval '1 day');

-- The unique index refuses a second run row for the same idempotency key.
do $$ begin
  insert into public.runs (monitor_id, source, trigger, slot, idempotency_key, endpoint_id, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'page', 'schedule', now(), 'mon:a:page:slot1', 'jina-reader', 'completed');
  raise notice 'DUPLICATE RUN ACCEPTED';
exception when unique_violation then
  raise notice 'duplicate idempotency key refused';
end $$;

select set_config('request.jwt.claim.sub', :'u2', false);

select 'user2 sees ' || t || '|' || n from (
  select 'settings' t, count(*) n from public.settings union all
  select 'monitors', count(*) from public.monitors union all
  select 'monitor_sources', count(*) from public.monitor_sources union all
  select 'runs', count(*) from public.runs union all
  select 'snapshots', count(*) from public.snapshots union all
  select 'serp_results', count(*) from public.serp_results union all
  select 'alerts', count(*) from public.alerts union all
  select 'budget_reservations', count(*) from public.budget_reservations) x order by t;
select 'user2 spent of user1|' || public.spent_since(:'u1', now() - interval '1 day');

with u as (update public.settings set timezone = 'X' returning 1) select 'user2 updated settings|' || count(*) from u;
with u as (update public.monitors set name = 'taken' returning 1) select 'user2 updated monitors|' || count(*) from u;
with u as (update public.monitor_sources set enabled = false returning 1) select 'user2 updated monitor_sources|' || count(*) from u;
with u as (update public.runs set actual_cost_micros = 0 returning 1) select 'user2 updated runs|' || count(*) from u;
with u as (update public.snapshots set content = 'x' returning 1) select 'user2 updated snapshots|' || count(*) from u;
with u as (update public.serp_results set rows = '[]' returning 1) select 'user2 updated serp_results|' || count(*) from u;
with u as (update public.alerts set state = 'done' returning 1) select 'user2 updated alerts|' || count(*) from u;
with u as (update public.budget_reservations set state = 'released' returning 1) select 'user2 updated budget_reservations|' || count(*) from u;

with d as (delete from public.settings returning 1) select 'user2 deleted settings|' || count(*) from d;
with d as (delete from public.alerts returning 1) select 'user2 deleted alerts|' || count(*) from d;
with d as (delete from public.budget_reservations returning 1) select 'user2 deleted budget_reservations|' || count(*) from d;
with d as (delete from public.snapshots returning 1) select 'user2 deleted snapshots|' || count(*) from d;
with d as (delete from public.serp_results returning 1) select 'user2 deleted serp_results|' || count(*) from d;
with d as (delete from public.runs returning 1) select 'user2 deleted runs|' || count(*) from d;
with d as (delete from public.monitor_sources returning 1) select 'user2 deleted monitor_sources|' || count(*) from d;
with d as (delete from public.monitors returning 1) select 'user2 deleted monitors|' || count(*) from d;

-- user2 cannot write a row that claims to be user1's.
do $$ begin
  insert into public.monitors (owner_id, name, kind, schedule, max_cost_per_run_micros, monthly_cap_micros)
    values ('11111111-1111-1111-1111-111111111111', 'spoof', 'page', 'daily', 1, 1);
  raise notice 'SPOOFED OWNER ACCEPTED';
exception when insufficient_privilege then
  raise notice 'spoofed owner_id refused by RLS';
end $$;

-- user2 cannot hang a child row of their own under user1's monitor.
do $$ begin
  insert into public.alerts (monitor_id, source, kind, fingerprint, severity, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'page', 'page_change', 'fp2', 'low', 'intruder');
  raise notice 'CHILD UNDER ANOTHER USER ACCEPTED';
exception when insufficient_privilege then
  raise notice 'alert under another user monitor refused';
end $$;
do $$ begin
  insert into public.runs (monitor_id, source, trigger, slot, idempotency_key, endpoint_id, status) values ('aaaaaaaa-0000-0000-0000-000000000001', 'page', 'manual', now(), 'k2', 'jina-reader', 'completed');
  raise notice 'CHILD UNDER ANOTHER USER ACCEPTED';
exception when insufficient_privilege then
  raise notice 'run under another user monitor refused';
end $$;

-- After all that, user1 still has every row.
select set_config('request.jwt.claim.sub', :'u1', false);
select 'user1 still has|' || (select count(*) from public.monitors) + (select count(*) from public.alerts) + (select count(*) from public.runs) + (select count(*) from public.snapshots) + (select count(*) from public.serp_results) + (select count(*) from public.monitor_sources) + (select count(*) from public.settings) + (select count(*) from public.budget_reservations);
