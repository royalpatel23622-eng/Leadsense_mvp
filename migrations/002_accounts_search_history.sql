-- LeadSense accounts, user-owned search history, usage, and admin audit foundation.
-- Apply after schema.sql in Supabase SQL Editor.
-- Never grant browser users access to the service_role key or to other users' rows.

create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'member' check (role in ('member','admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  plan text not null default 'free' check (plan in ('free','starter','pro','agency')),
  search_limit_override integer check (search_limit_override between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_app_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.app_users(id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists create_app_user_profile_after_signup on auth.users;
create trigger create_app_user_profile_after_signup
after insert or update of email on auth.users
for each row execute function public.create_app_user_profile();

-- Add an owner to the existing shared CRM tables before enabling account access.
alter table public.external_prospects add column if not exists user_id uuid references public.app_users(id) on delete cascade;
alter table public.crm_tasks add column if not exists user_id uuid references public.app_users(id) on delete cascade;
alter table public.youtube_search_presets add column if not exists user_id uuid references public.app_users(id) on delete cascade;
alter table public.youtube_search_presets add column if not exists filters jsonb not null default '{}'::jsonb;

-- Existing shared records go to the first administrator account. If no admin exists yet,
-- leave them unassigned for manual review instead of exposing them to every new account.
update public.external_prospects set user_id = (select id from public.app_users where role = 'admin' order by created_at limit 1) where user_id is null;
update public.crm_tasks set user_id = (select id from public.app_users where role = 'admin' order by created_at limit 1) where user_id is null;
update public.youtube_search_presets set user_id = (select id from public.app_users where role = 'admin' order by created_at limit 1) where user_id is null;

alter table public.external_prospects enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.youtube_search_presets enable row level security;

drop policy if exists external_prospects_own_rows on public.external_prospects;
create policy external_prospects_own_rows on public.external_prospects
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists crm_tasks_own_rows on public.crm_tasks;
create policy crm_tasks_own_rows on public.crm_tasks
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists youtube_presets_own_rows on public.youtube_search_presets;
create policy youtube_presets_own_rows on public.youtube_search_presets
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.external_prospects to authenticated;
grant select, insert, update, delete on public.crm_tasks to authenticated;
grant select, insert, update, delete on public.youtube_search_presets to authenticated;
grant all on public.external_prospects to service_role;
grant all on public.crm_tasks to service_role;
grant all on public.youtube_search_presets to service_role;

create table if not exists public.discovery_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  query text not null check (length(btrim(query)) between 1 and 1000),
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','cancelled')),
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists discovery_searches_user_created_idx
  on public.discovery_searches(user_id, created_at desc);
create index if not exists discovery_searches_status_created_idx
  on public.discovery_searches(status, created_at);

create table if not exists public.user_daily_usage (
  user_id uuid not null references public.app_users(id) on delete cascade,
  usage_date date not null default current_date,
  search_requests integer not null default 0 check (search_requests >= 0),
  analysis_requests integer not null default 0 check (analysis_requests >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create or replace function public.take_user_search_slot(p_user_id uuid, p_daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_daily_limit < 1 or p_daily_limit > 1000 then
    raise exception 'Invalid user search limit';
  end if;
  insert into public.user_daily_usage(user_id, usage_date, search_requests)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date) do update
    set search_requests = public.user_daily_usage.search_requests + 1,
        updated_at = now()
    where public.user_daily_usage.search_requests < p_daily_limit
  returning search_requests into v_count;
  if v_count is null then
    raise exception 'USER_DAILY_SEARCH_LIMIT';
  end if;
  return v_count;
end;
$$;

create or replace function public.take_user_analysis_slot(p_user_id uuid, p_daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_daily_limit < 1 or p_daily_limit > 1000 then
    raise exception 'Invalid user analysis limit';
  end if;
  insert into public.user_daily_usage(user_id, usage_date, analysis_requests)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date) do update
    set analysis_requests = public.user_daily_usage.analysis_requests + 1,
        updated_at = now()
    where public.user_daily_usage.analysis_requests < p_daily_limit
  returning analysis_requests into v_count;
  if v_count is null then
    raise exception 'USER_DAILY_ANALYSIS_LIMIT';
  end if;
  return v_count;
end;
$$;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.app_users(id),
  action text not null check (length(btrim(action)) between 1 and 120),
  target_user_id uuid references public.app_users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_error_logs (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  message text not null,
  path text not null,
  status integer not null,
  created_at timestamptz not null default now()
);
create index if not exists api_error_logs_created_idx on public.api_error_logs(created_at desc);

alter table public.app_users enable row level security;
alter table public.discovery_searches enable row level security;
alter table public.user_daily_usage enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.api_error_logs enable row level security;

drop policy if exists app_users_read_own_profile on public.app_users;
create policy app_users_read_own_profile on public.app_users
  for select to authenticated using (auth.uid() = id);

drop policy if exists discovery_searches_read_own on public.discovery_searches;
create policy discovery_searches_read_own on public.discovery_searches
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists discovery_searches_insert_own on public.discovery_searches;
create policy discovery_searches_insert_own on public.discovery_searches
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists discovery_searches_update_own on public.discovery_searches;
create policy discovery_searches_update_own on public.discovery_searches
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_daily_usage_read_own on public.user_daily_usage;
create policy user_daily_usage_read_own on public.user_daily_usage
  for select to authenticated using (auth.uid() = user_id);

grant select on public.app_users to authenticated;
grant select, insert, update on public.discovery_searches to authenticated;
grant select on public.user_daily_usage to authenticated;
revoke all on public.app_users from anon;
revoke all on public.discovery_searches from anon;
revoke all on public.user_daily_usage from anon;
revoke all on public.admin_audit_logs from anon, authenticated;
grant all on public.app_users to service_role;
grant all on public.discovery_searches to service_role;
grant all on public.user_daily_usage to service_role;
revoke all on function public.take_user_search_slot(uuid, integer) from public, anon, authenticated;
grant execute on function public.take_user_search_slot(uuid, integer) to service_role;
revoke all on function public.take_user_analysis_slot(uuid, integer) from public, anon, authenticated;
grant execute on function public.take_user_analysis_slot(uuid, integer) to service_role;
grant all on public.admin_audit_logs to service_role;
grant all on public.api_error_logs to service_role;

-- After your first account is created and email is confirmed, promote it once:
-- update public.app_users set role = 'admin', updated_at = now()
-- where email = 'YOUR_ADMIN_EMAIL';
-- If existing shared CRM records remained unassigned, give them to that administrator:
-- update public.external_prospects set user_id = (select id from public.app_users where role = 'admin' order by created_at limit 1) where user_id is null;
-- update public.crm_tasks set user_id = (select id from public.app_users where role = 'admin' order by created_at limit 1) where user_id is null;
-- update public.youtube_search_presets set user_id = (select id from public.app_users where role = 'admin' order by created_at limit 1) where user_id is null;
-- Do not expose a self-service admin role endpoint.
