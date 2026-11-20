# Production readiness audit checklist

Audit date: 20 November 2026. Status reflects repository inspection and automated local tests only; it does not imply live service verification.

## Critical

- **Resolved in code:** migration 004's 29-day cleanup deleted saved creator leads and cascaded user-authored notes/evidence/contacts. Migration 005 replaces deletion with field-only scrubbing and preserves the parent workspace records.
- **Outstanding external check:** apply migration 005 before using a project that has migration 004, then verify the two scheduled jobs and retention behavior on staging. If 004 already deleted rows, only a backup can restore them.

## High

- **Implemented; staging check required:** production API rate limiting now uses atomic shared Supabase counters with HMAC-hashed buckets. Migration 006 is required; production requests fail closed if that store is unavailable.
- **Implemented:** client IP forwarding is ignored by default; Render config explicitly selects `cf-connecting-ip`. HSTS is production/HTTPS scoped.
- **Implemented:** YouTube requests have per-operation deadlines and response shape validation; search preserves partial results and warns when a page/deadline/other request fails.
- **Implemented locally:** GitHub Actions CI covers syntax, mocked tests, Playwright browser tests and whitespace checks. Render `autoDeploy` is disabled to keep GitHub push separate from deployment.
- **Known hardening limit:** CSP allows inline scripts/styles for the existing page structure. Tighten only after moving inline code or adding nonces/hashes and browser-verifying all flows.

## Medium

- **Resolved:** old example-channel count/banner was removed from the discovery fallback; the empty state now says live results appear after a search.
- **Implemented:** creator profile refresh updates only API-sourced fields and does not overwrite user notes, stage, service, or display label.
- **Outstanding:** quota counters and RLS/ownership RPC permissions need real Supabase staging verification. YouTube quota display is an app counter and not Google's complete project usage.
- **Outstanding:** responsive and CSP checks need broad live-app validation beyond the current Playwright suite.

## Low

- **Documented:** reference `mattwright324/youtube-metadata` was reviewed for features. No code was copied, so there is no adapted MIT source to attribute.
- **Documented:** free Render instances may sleep after inactivity; no artificial uptime pings are used.

## Release gate

Do not call this production-ready until the staged Supabase migrations, scheduled cleanup, logout revocation, trusted proxy behavior, live YouTube quota behavior, and deployed browser flows are verified. Current intended status after local test review: **Ready for staging verification**, provided all local CI checks pass.
