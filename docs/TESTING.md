# Testing and CI

## Local checks

Run from the repository root:

```powershell
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
git diff --check
```

`npm test` uses Node's test runner and mocks Supabase and YouTube responses. It does not spend live YouTube quota or change a Supabase database. Browser tests launch the local app and verify selected desktop/mobile flows; they do not cover every interaction at every viewport.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and pull requests targeting `main`. It installs locked dependencies, Chromium, syntax checks, integration/unit tests, Playwright tests, and a patch whitespace check. The normal CI job needs no service credentials because external APIs are mocked.

## Live staging verification checklist

Automated tests cannot prove these external behaviors. On a staging Supabase project and staging app, verify:

- Apply migration 007 after the previously applied migrations; confirm the signup trigger still exists and API roles cannot execute its SECURITY DEFINER function.
- Inspect the required database functions, RLS/ownership behavior, and `cron.job` entries on staging.
- Confirm an expired creator has only its YouTube fields scrubbed while notes, evidence, contacts, and custom label remain.
- Confirm two accounts cannot read or modify each other's creator records.
- Sign up, log in, refresh an expired session, log out, and confirm the old session is rejected by Supabase.
- Send repeated requests from two app instances and verify the shared limiter returns 429 consistently.
- Check CSP console errors and all primary flows in Chromium at 1440, 1280, 768, 390, and 360 CSS pixels.
- Run one authorized YouTube search and inspection, check the UI's partial/quota messaging, and verify app counters against Cloud Console. Do not infer Google's full quota use from the app counter.


Recent local coverage includes creator evidence freshness and classification, stale-source rechecks, resetting verification after source edits, missing Supabase quota-RPC diagnostics and failed search-history status, CSP script loading, and layout overflow at 360, 390, 768, 1280, and 1440 pixels. These tests use mocked services; they do not verify a live Supabase project or a deployed Render service.
