-- User-owned creator leads, manually submitted public evidence, and contact routes.
-- LeadSense does not crawl sources or persist YouTube API response data here.
create table if not exists public.creator_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^UC[a-zA-Z0-9_-]{22}$'),
  channel_url text not null,
  creator_name text not null check (length(btrim(creator_name)) between 1 and 160),
  service_category text not null default 'Other' check (length(btrim(service_category)) between 1 and 100),
  stage text not null default 'Researching' check (stage in ('Researching','Contact ready','Contacted','Follow-up','Closed')),
  notes text not null default '' check (length(notes) <= 5000),
  expires_at timestamptz not null default (now() + interval '29 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel_id),
  unique (id, user_id)
);

create index if not exists creator_leads_user_updated_idx on public.creator_leads(user_id, updated_at desc);
create index if not exists creator_leads_expiry_idx on public.creator_leads(expires_at);

create table if not exists public.creator_evidence (
  id uuid primary key default gen_random_uuid(),
  creator_lead_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  service_category text not null check (length(btrim(service_category)) between 1 and 100),
  evidence_type text not null check (evidence_type in ('public_request','creator_statement','hiring_post','service_request','context_note')),
  strength text not null check (strength in ('strong','moderate','weak')),
  source_url text not null,
  excerpt text not null check (length(btrim(excerpt)) between 1 and 1500),
  published_at timestamptz,
  discovered_at timestamptz not null default now(),
  last_checked_at timestamptz,
  verification_status text not null default 'unverified' check (verification_status in ('source_found','publicly_available','manually_verified','unverified','no_longer_available')),
  extraction_method text not null default 'manual' check (extraction_method = 'manual'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (creator_lead_id, user_id) references public.creator_leads(id, user_id) on delete cascade
);

create index if not exists creator_evidence_lead_checked_idx on public.creator_evidence(creator_lead_id, discovered_at desc);
create index if not exists creator_evidence_user_idx on public.creator_evidence(user_id, discovered_at desc);

create table if not exists public.creator_contacts (
  id uuid primary key default gen_random_uuid(),
  creator_lead_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  contact_type text not null check (contact_type in ('business_email','website','contact_form','professional_profile')),
  contact_value text not null check (length(btrim(contact_value)) between 1 and 500),
  source_url text not null,
  discovered_at timestamptz not null default now(),
  last_checked_at timestamptz,
  verification_status text not null default 'unverified' check (verification_status in ('source_found','publicly_available','link_checked','manually_verified','unverified','no_longer_available')),
  extraction_method text not null default 'manual' check (extraction_method = 'manual'),
  notes text not null default '' check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (creator_lead_id, user_id) references public.creator_leads(id, user_id) on delete cascade
);

create index if not exists creator_contacts_lead_idx on public.creator_contacts(creator_lead_id, created_at desc);

alter table public.creator_leads enable row level security;
alter table public.creator_evidence enable row level security;
alter table public.creator_contacts enable row level security;
revoke all on public.creator_leads, public.creator_evidence, public.creator_contacts from anon, authenticated;
grant all on public.creator_leads, public.creator_evidence, public.creator_contacts to service_role;

-- Creator IDs and channel metadata originate from YouTube API responses. Remove
-- saved creator records and linked notes/contacts before the 30-day retention limit.
create or replace function public.purge_expired_creator_workspace()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_deleted integer;
begin
  delete from public.creator_leads where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.purge_expired_creator_workspace() from public, anon, authenticated;
grant execute on function public.purge_expired_creator_workspace() to service_role;

-- Supabase projects must have the pg_cron extension enabled for unattended expiry.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'leadsense-purge-expired-creator-workspace';
select cron.schedule('leadsense-purge-expired-creator-workspace', '15 * * * *', 'select public.purge_expired_creator_workspace()');
