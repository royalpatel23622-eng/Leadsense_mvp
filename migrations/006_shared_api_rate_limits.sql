-- Shared, privacy-preserving minute buckets for API rate limiting.
create table if not exists public.api_rate_limit_windows (
  bucket_hash text not null check (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (bucket_hash, window_start)
);

alter table public.api_rate_limit_windows enable row level security;
revoke all on public.api_rate_limit_windows from anon, authenticated;
grant all on public.api_rate_limit_windows to service_role;

create or replace function public.take_api_rate_limit_slot(
  p_bucket_hash text,
  p_limit integer,
  p_window_seconds integer default 60
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_bucket_hash !~ '^[0-9a-f]{64}$'
    or p_limit < 1 or p_limit > 10000
    or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'Invalid internal API rate limit';
  end if;
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_limit_windows(bucket_hash, window_start, request_count)
    values (p_bucket_hash, v_window, 1)
    on conflict (bucket_hash, window_start) do update
      set request_count = public.api_rate_limit_windows.request_count + 1,
          updated_at = clock_timestamp()
      where public.api_rate_limit_windows.request_count < p_limit
    returning request_count into v_count;
  if v_count is null then raise exception 'API_RATE_LIMITED'; end if;
  return v_count;
end;
$$;
revoke all on function public.take_api_rate_limit_slot(text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_api_rate_limit_slot(text, integer, integer) to service_role;

-- Keep the table small by removing old minute buckets once an hour.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'leadsense-purge-api-rate-limits';
select cron.schedule(
  'leadsense-purge-api-rate-limits',
  '35 * * * *',
  $$delete from public.api_rate_limit_windows where window_start < now() - interval '2 days'$$
);
