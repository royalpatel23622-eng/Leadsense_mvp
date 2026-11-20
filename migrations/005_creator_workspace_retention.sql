-- Keep user-authored creator notes, evidence, contacts, and follow-up stages.
-- Only fields copied from the public YouTube API expire after 29 days.
alter table public.creator_leads
  add column if not exists display_label text check (display_label is null or length(btrim(display_label)) <= 160);

alter table public.creator_leads alter column channel_id drop not null;
alter table public.creator_leads alter column channel_url drop not null;
alter table public.creator_leads alter column creator_name drop not null;

-- Refresh only the API-sourced profile fields on an idempotent save. A live
-- search must never reset a user's label, stage, service category, or notes.
create or replace function public.save_creator_lead_profile(
  p_user_id uuid,
  p_channel_id text,
  p_channel_url text,
  p_creator_name text,
  p_expires_at timestamptz
)
returns setof public.creator_leads
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null
    or p_channel_id !~ '^UC[a-zA-Z0-9_-]{22}$'
    or p_expires_at <= now()
    or p_expires_at > now() + interval '30 days' then
    raise exception 'Invalid creator profile refresh';
  end if;
  return query
    insert into public.creator_leads(user_id, channel_id, channel_url, creator_name, expires_at)
    values (p_user_id, p_channel_id, p_channel_url, p_creator_name, p_expires_at)
    on conflict (user_id, channel_id) do update set
      channel_url = excluded.channel_url,
      creator_name = excluded.creator_name,
      expires_at = excluded.expires_at
    returning *;
end;
$$;
revoke all on function public.save_creator_lead_profile(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.save_creator_lead_profile(uuid, text, text, text, timestamptz) to service_role;

create or replace function public.purge_expired_creator_workspace()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_scrubbed integer;
begin
  update public.creator_leads
  set channel_id = null, channel_url = null, creator_name = null
  where expires_at <= now()
    and (channel_id is not null or channel_url is not null or creator_name is not null);
  get diagnostics v_scrubbed = row_count;
  return v_scrubbed;
end;
$$;
revoke all on function public.purge_expired_creator_workspace() from public, anon, authenticated;
grant execute on function public.purge_expired_creator_workspace() to service_role;

-- Replace the old cascading retention job with a field-only scrub. Parent rows
-- and user-created child records remain until the account owner deletes them.
select cron.unschedule(jobid)
from cron.job
where jobname = 'leadsense-purge-expired-creator-workspace';

select cron.schedule(
  'leadsense-purge-expired-creator-workspace',
  '15 * * * *',
  'select public.purge_expired_creator_workspace()'
);
