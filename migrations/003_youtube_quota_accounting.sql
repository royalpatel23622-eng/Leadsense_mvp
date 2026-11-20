-- Method-specific, persistent YouTube API quota reservation.
-- Apply after schema.sql and migrations/002_accounts_search_history.sql.
alter table public.youtube_api_usage add column if not exists other_units integer not null default 0 check (other_units >= 0);
alter table public.youtube_api_usage add column if not exists channels_list_calls integer not null default 0 check (channels_list_calls >= 0);
alter table public.youtube_api_usage add column if not exists videos_list_calls integer not null default 0 check (videos_list_calls >= 0);
alter table public.youtube_api_usage add column if not exists playlists_list_calls integer not null default 0 check (playlists_list_calls >= 0);
alter table public.youtube_api_usage add column if not exists playlist_items_list_calls integer not null default 0 check (playlist_items_list_calls >= 0);
alter table public.user_daily_usage add column if not exists youtube_api_calls integer not null default 0 check (youtube_api_calls >= 0);

create or replace function public.take_youtube_api_slot(p_method text, p_search_limit integer, p_other_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date := (now() at time zone 'America/Los_Angeles')::date;
  v_row public.youtube_api_usage%rowtype;
begin
  if p_search_limit < 1 or p_search_limit > 100 or p_other_limit < 1 or p_other_limit > 10000 then
    raise exception 'Invalid internal YouTube quota limit';
  end if;

  if p_method = 'search.list' then
    insert into public.youtube_api_usage(usage_date, search_calls)
    values (v_date, 1)
    on conflict (usage_date) do update
      set search_calls = public.youtube_api_usage.search_calls + 1, updated_at = now()
      where public.youtube_api_usage.search_calls < p_search_limit
    returning * into v_row;
  elsif p_method in ('channels.list','videos.list','playlists.list','playlistItems.list') then
    insert into public.youtube_api_usage(usage_date, other_units,
      channels_list_calls, videos_list_calls, playlists_list_calls, playlist_items_list_calls)
    values (v_date, 1,
      case when p_method = 'channels.list' then 1 else 0 end,
      case when p_method = 'videos.list' then 1 else 0 end,
      case when p_method = 'playlists.list' then 1 else 0 end,
      case when p_method = 'playlistItems.list' then 1 else 0 end)
    on conflict (usage_date) do update set
      other_units = public.youtube_api_usage.other_units + 1,
      channels_list_calls = public.youtube_api_usage.channels_list_calls + case when p_method = 'channels.list' then 1 else 0 end,
      videos_list_calls = public.youtube_api_usage.videos_list_calls + case when p_method = 'videos.list' then 1 else 0 end,
      playlists_list_calls = public.youtube_api_usage.playlists_list_calls + case when p_method = 'playlists.list' then 1 else 0 end,
      playlist_items_list_calls = public.youtube_api_usage.playlist_items_list_calls + case when p_method = 'playlistItems.list' then 1 else 0 end,
      updated_at = now()
    where public.youtube_api_usage.other_units < p_other_limit
    returning * into v_row;
  else
    raise exception 'Unsupported YouTube API method';
  end if;

  if v_row.usage_date is null then raise exception 'DAILY_YOUTUBE_QUOTA_LIMIT'; end if;
  return jsonb_build_object('usageDate', v_row.usage_date, 'method', p_method,
    'searchCalls', v_row.search_calls, 'otherUnits', v_row.other_units,
    'channelsListCalls', v_row.channels_list_calls, 'videosListCalls', v_row.videos_list_calls,
    'playlistsListCalls', v_row.playlists_list_calls, 'playlistItemsListCalls', v_row.playlist_items_list_calls,
    'resetTimeZone', 'America/Los_Angeles');
end;
$$;

revoke all on function public.take_youtube_api_slot(text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_youtube_api_slot(text, integer, integer) to service_role;

create or replace function public.take_user_youtube_api_slot(p_user_id uuid, p_daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_daily_limit < 1 or p_daily_limit > 10000 then raise exception 'Invalid user YouTube API call limit'; end if;
  insert into public.user_daily_usage(user_id, usage_date, youtube_api_calls)
  values (p_user_id, (now() at time zone 'America/Los_Angeles')::date, 1)
  on conflict (user_id, usage_date) do update
    set youtube_api_calls = public.user_daily_usage.youtube_api_calls + 1, updated_at = now()
    where public.user_daily_usage.youtube_api_calls < p_daily_limit
  returning youtube_api_calls into v_count;
  if v_count is null then raise exception 'USER_DAILY_YOUTUBE_API_LIMIT'; end if;
  return v_count;
end;
$$;
revoke all on function public.take_user_youtube_api_slot(uuid, integer) from public, anon, authenticated;
grant execute on function public.take_user_youtube_api_slot(uuid, integer) to service_role;

-- Align per-user fairness counters with the same Pacific calendar day.
create or replace function public.take_user_search_slot(p_user_id uuid, p_daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_daily_limit < 1 or p_daily_limit > 1000 then raise exception 'Invalid user search limit'; end if;
  insert into public.user_daily_usage(user_id, usage_date, search_requests)
  values (p_user_id, (now() at time zone 'America/Los_Angeles')::date, 1)
  on conflict (user_id, usage_date) do update
    set search_requests = public.user_daily_usage.search_requests + 1, updated_at = now()
    where public.user_daily_usage.search_requests < p_daily_limit
  returning search_requests into v_count;
  if v_count is null then raise exception 'USER_DAILY_SEARCH_LIMIT'; end if;
  return v_count;
end;
$$;

create or replace function public.take_user_analysis_slot(p_user_id uuid, p_daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_daily_limit < 1 or p_daily_limit > 1000 then raise exception 'Invalid user analysis limit'; end if;
  insert into public.user_daily_usage(user_id, usage_date, analysis_requests)
  values (p_user_id, (now() at time zone 'America/Los_Angeles')::date, 1)
  on conflict (user_id, usage_date) do update
    set analysis_requests = public.user_daily_usage.analysis_requests + 1, updated_at = now()
    where public.user_daily_usage.analysis_requests < p_daily_limit
  returning analysis_requests into v_count;
  if v_count is null then raise exception 'USER_DAILY_ANALYSIS_LIMIT'; end if;
  return v_count;
end;
$$;

revoke all on function public.take_user_search_slot(uuid, integer) from public, anon, authenticated;
grant execute on function public.take_user_search_slot(uuid, integer) to service_role;
revoke all on function public.take_user_analysis_slot(uuid, integer) from public, anon, authenticated;
grant execute on function public.take_user_analysis_slot(uuid, integer) to service_role;
