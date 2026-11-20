# Supabase database setup and migrations

This guide describes the migration files in this repository. Applying migrations to a live Supabase project is a separate operation; this repository has not been used to verify your live database.

## Before you start

1. Open the correct Supabase project and confirm its project reference.
2. Take a database backup or use a staging project first.
3. Open **SQL Editor** and create a new query for each file.
4. Apply each file in the order below. Wait for a success message before moving on.
5. Do not paste service keys into SQL or commit them to the repository.

## Order

For a new project, apply:

1. `schema.sql`
2. `migrations/002_accounts_search_history.sql`
3. `migrations/003_youtube_quota_accounting.sql`
4. `migrations/004_creator_workspace.sql`
5. `migrations/005_creator_workspace_retention.sql`
6. `migrations/006_shared_api_rate_limits.sql`

For an existing project that has already applied migrations 002–004, apply only 005 and 006. Do not rerun earlier files to try to repair a failed migration.

Migrations 004 and 005 schedule `pg_cron` jobs. Supabase must support and have the `pg_cron` extension enabled. If the extension or the `cron` schema is unavailable, stop and enable the supported extension in the Supabase dashboard before retrying the failed migration.

Migration 004 contains the old cleanup function that deletes expired creator leads and cascades their user-created notes, evidence, and contacts. Migration 005 replaces that behavior: it clears only YouTube-sourced channel ID, URL, and name fields after 29 days. Apply migration 005 immediately after 004 and before using the creator workspace. If migration 004's scheduled job has already deleted records, this migration cannot restore them; use a database backup if recovery is required.

## Verify

Run these read-only checks in SQL Editor after applying the migrations:

```sql
select to_regclass('public.creator_leads') as creator_leads,
       to_regclass('public.api_rate_limit_windows') as api_rate_limit_windows,
       to_regclass('public.youtube_api_usage') as youtube_api_usage;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'take_youtube_api_slot',
    'take_user_youtube_api_slot',
    'save_creator_lead_profile',
    'purge_expired_creator_workspace',
    'take_api_rate_limit_slot'
  )
order by routine_name;

select jobname, schedule, command
from cron.job
where jobname in (
  'leadsense-purge-expired-creator-workspace',
  'leadsense-purge-api-rate-limits'
)
order by jobname;
```

The expected objects are present and both scheduled jobs appear. These checks confirm database definitions, not that the jobs have already run. The app's `/api/health` endpoint checks connectivity only; it does not prove every migration or cron job is correct.

## If a migration fails

- Read the first SQL error and identify the statement that failed.
- Do not run a destructive `drop`, broad `delete`, or table recreation to make the script pass.
- Most DDL statements use `if not exists` or `create or replace`, but not every statement is safely repeatable after partial execution. Check which statements succeeded before retrying.
- If a cron job was created before the failure, inspect `cron.job` and remove or update only the named LeadSense job after confirming it is the affected one.
- For production data or uncertain partial state, stop and use a staging clone or ask a database administrator to review the project.

## Ownership and retention

Tables are accessed by the Node server using its server-only Supabase key. Browser roles do not receive that key. User-owned rows are scoped by the authenticated user ID in API queries and by ownership constraints in creator child records. The `creator_leads` foreign keys intentionally cascade evidence and contact rows only when the parent lead itself is explicitly deleted (or its owning account is deleted). Expiry scrubs only fields sourced from YouTube.

YouTube usage and per-user quota counters reset on the Pacific calendar date. `api_rate_limit_windows` stores HMAC-hashed client buckets, not raw IP addresses, and the hourly cron job removes old buckets.
