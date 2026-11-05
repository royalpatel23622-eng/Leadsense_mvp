-- LeadSense MVP schema for Supabase PostgreSQL.
-- YouTube channel/search responses are deliberately never written to these tables.

create extension if not exists pgcrypto;

create table if not exists public.external_prospects (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (length(btrim(business_name)) between 1 and 160),
  website text,
  category text,
  target_service text,
  target_market text,
  stage text not null default 'New Prospect',
  notes text not null default '',
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_prospects_stage_updated_idx
  on public.external_prospects(stage, updated_at desc);

create table if not exists public.opportunity_evidence (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.external_prospects(id) on delete cascade,
  dimension text not null check (dimension in (
    'service_relevance','verified_gaps','buying_intent',
    'operational_readiness','contact_route','freshness'
  )),
  description text not null check (length(btrim(description)) between 1 and 2000),
  source_url text,
  checked_at timestamptz not null default now(),
  confidence text not null default 'medium' check (confidence in ('high','medium','low')),
  strength numeric(4,3) not null default 0.5 check (strength between 0 and 1),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists opportunity_evidence_prospect_idx
  on public.opportunity_evidence(prospect_id, checked_at desc);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.external_prospects(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 240),
  due_at date,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_tasks_due_idx on public.crm_tasks(done, due_at);

-- Presets contain query settings only; they never contain API response data.
create table if not exists public.youtube_search_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  query text not null check (length(btrim(query)) between 1 and 200),
  region_code char(2) not null default 'US',
  declared_country_code char(2),
  country_unknown_only boolean not null default false,
  topic text,
  include_unknown boolean not null default true,
  exclude_declared_india boolean not null default true,
  created_at timestamptz not null default now()
);

-- Counts only this app's search.list calls (not total Google Cloud project usage).
create table if not exists public.youtube_api_usage (
  usage_date date primary key,
  search_calls integer not null default 0 check (search_calls >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.take_youtube_search_slot(p_daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_daily_limit < 1 or p_daily_limit > 1000 then
    raise exception 'Invalid internal search limit';
  end if;
  insert into public.youtube_api_usage(usage_date, search_calls)
  values (current_date, 1)
  on conflict (usage_date) do update
    set search_calls = public.youtube_api_usage.search_calls + 1,
        updated_at = now()
    where public.youtube_api_usage.search_calls < p_daily_limit
  returning search_calls into v_count;
  if v_count is null then
    raise exception 'DAILY_SEARCH_LIMIT';
  end if;
  return v_count;
end;
$$;

-- These tables are only accessed by the app server using the service key.
-- RLS is enabled with no browser-facing policies; do not expose the service key.
alter table public.external_prospects enable row level security;
alter table public.opportunity_evidence enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.youtube_search_presets enable row level security;
alter table public.youtube_api_usage enable row level security;

revoke all on public.external_prospects from anon, authenticated;
revoke all on public.opportunity_evidence from anon, authenticated;
revoke all on public.crm_tasks from anon, authenticated;
revoke all on public.youtube_search_presets from anon, authenticated;
revoke all on public.youtube_api_usage from anon, authenticated;
grant all on public.external_prospects to service_role;
grant all on public.opportunity_evidence to service_role;
grant all on public.crm_tasks to service_role;
grant all on public.youtube_search_presets to service_role;
grant select on public.youtube_api_usage to service_role;
revoke all on function public.take_youtube_search_slot(integer) from public, anon, authenticated;
grant execute on function public.take_youtube_search_slot(integer) to service_role;
