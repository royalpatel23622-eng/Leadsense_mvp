# Production readiness audit checklist

Audit date: 25 November 2026. Status combines repository review, local tests, Supabase project inspection, and the Render deployment record. It does not imply live authenticated YouTube workflow verification.

## Critical

- **Resolved in code:** migration 004's 29-day cleanup deleted saved creator leads and cascaded user-authored notes/evidence/contacts. Migration 005 replaces deletion with field-only scrubbing and preserves the parent workspace records.
- **Verified on connected Supabase project:** migrations 005 and 006 are recorded, and the two expected `pg_cron` jobs are active. This confirms their definitions and scheduling, not that retention has run successfully or preserved user data; verify behavior on staging. If migration 004 already deleted rows, only a backup can restore them.
- **Fixed and verified in Supabase:** migration 007 revokes API execution of the public `SECURITY DEFINER` signup-profile trigger function. The database still has the trigger and the function ACL was checked after migration.

## High

- **Implemented; staging check required:** production API rate limiting now uses atomic shared Supabase counters with HMAC-hashed buckets. Migration 006 is required; production requests fail closed if that store is unavailable.
- **Implemented:** client IP forwarding is ignored by default; Render config explicitly selects `cf-connecting-ip`. HSTS is production/HTTPS scoped.
- **Implemented:** YouTube requests have per-operation deadlines and response shape validation; search preserves partial results and warns when a page/deadline/other request fails.
- **Implemented:** GitHub Actions CI covers syntax, mocked tests, Playwright browser tests and whitespace checks. Render `autoDeploy` is enabled in `render.yaml`; Render reports commit `305944d` as the current live deploy.
- **Implemented locally:** frontend scripts are loaded from same-origin JS files and the CSP allows scripts only from `'self'`; existing inline styles remain allowed. Browser verification is required before release.

## Medium

- **Resolved:** old example-channel count/banner was removed from the discovery fallback; the empty state now says live results appear after a search.
- **Implemented:** creator profile refresh updates only API-sourced fields and does not overwrite user notes, stage, service, or display label.
- **Partially verified:** required quota functions and their names exist in Supabase. Full ownership, RPC grants, cron execution, and data retention need staging behavior tests. YouTube quota display is an app counter and not Google's complete project usage.
- **Implemented locally; external check outstanding:** Playwright now checks auth layout at five viewport widths and confirms there are no CSP console violations. Deployed browser testing remains outstanding.

## Low

- **Documented:** reference `mattwright324/youtube-metadata` was reviewed for features. No code was copied, so there is no adapted MIT source to attribute.
- **Documented:** free Render instances may sleep after inactivity; no artificial uptime pings are used.

## Release gate

Do not call this production-ready until the staged Supabase migrations, scheduled cleanup, logout revocation, trusted proxy behavior, live YouTube quota behavior, and deployed browser flows are verified. Current status: **Deployed and locally verified; external behavior remains partially verified.**
