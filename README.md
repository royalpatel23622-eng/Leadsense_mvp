# LeadSense MVP

LeadSense is a Node.js app for public YouTube channel discovery and a separate business CRM. This version adds Supabase account sign-in, per-user workspace data, a protected administrator API, search history, and an administrator screen. Apply the account migration before deploying this version; the original database schema does not include the new account tables.

The backend is a dependency-free Node.js web server. It serves the existing frontend, calls YouTube from the server, and stores independent CRM records in Supabase Postgres. This keeps the YouTube key out of the browser and avoids a build step.

## What works

- **YouTube discovery:** search by topic, creator-declared country, and subscriber range. The user selects a requested exact-result count; each request checks up to five channel pages (up to 50 channels each), subject to the app quota. Use **Load more** to continue. Exact filter matches appear first. Related topic channels stay separate and explain which filter they missed. A narrow search or exhausted YouTube results can still return fewer than requested; LeadSense never invents channels or silently changes your filters.
- **Channel investigation:** on request, load current public channel fields, YouTube topic categories when available, up to 10 recent uploads, and up to 10 public playlists. Each displayed field can be checked for source, API method, retrieval time and availability. The UI labels the upload sample size and does not imply it represents the whole channel. Video details include duration, category ID and livestream metadata when YouTube supplies them. Videos at or under three minutes are labeled as short-duration candidates only; the API response does not confirm Shorts format.
- **Creator links:** the official public channel resource does not provide a structured list of external channel links. LeadSense links to the channel so you can review links the creator chose to publish. It does not scrape pages or collect emails and phone numbers.
- **Saved creator workspace:** save a live channel to your private workspace, add your own notes, public evidence links and contact routes, and set a follow-up stage. New evidence and contacts remain unverified until you check them. Only a source-backed strong request that you manually mark as checked can show as an explicit opportunity. YouTube-sourced channel ID, name, and URL are cleared after 29 days; your own label, notes, evidence, contacts, and stage remain until you delete the lead. This requires migrations 005 and `pg_cron`.
- **Search filter draft:** paste a natural-language description and review a rule-based draft for service, search words, countries, subscriber range, and result count. The parser is not an AI model. Each field is editable before searching.
- **Account access:** Supabase Auth handles sign-up and sign-in. Session tokens use secure, HTTP-only cookies. CRM records and saved search settings are scoped to the signed-in user on the server.
- **Admin area:** server-side role checks protect admin routes. Admins can review accounts, usage, search status, errors, and service configuration; change roles/status/plans; and set per-user daily search limits. API secret values are never returned.
- **Search history:** records the user’s search phrase, filters, and completed/failed status. YouTube API result data is not saved.
- **Honest country labels:** country is shown only when the channel response declares it. `regionCode` changes the search viewing region; it does not identify where a creator lives. Country labels are used only when creator-declared; India is not secretly prioritized or excluded. Unknown remains unknown.
- **YouTube data retention:** search and inspection responses are returned to the browser and not cached. A saved creator workspace stores channel ID/name/URL for follow-up and clears those YouTube-sourced fields after 29 days. It does not save YouTube statistics or video metadata snapshots. User-authored records are retained until the user deletes them.
- **Quota accounting:** every YouTube API call reserves an atomic per-user slot and an app-wide slot before calling YouTube. `search.list` has its own counter; metadata methods are counted in a separate unit bucket and by method. Counters roll over at midnight Pacific Time. These app counters cannot see API requests made outside LeadSense.
- **Independent CRM:** add and update business prospects, change stages, make follow-ups, mark tasks done, and export prospects to CSV. These routes never accept YouTube channel IDs or API responses.
- **Local mode:** without Supabase, account-backed features are unavailable. CRM edits are unavailable and are not saved until Supabase is connected. Without a YouTube key, live search shows a clear setup message.
- **Deploy files:** `render.yaml` describes a Render web service. See the migration and deployment guides before setting up a live service.

## Local setup

Requirements: Node.js 22 or newer. The server has no runtime dependencies; Playwright is a development dependency for browser tests.

1. Copy `.env.example` to `.env`.
2. Create a Supabase project and follow [docs/DATABASE_MIGRATIONS.md](docs/DATABASE_MIGRATIONS.md) for the exact migration order and verification queries. For a new database this includes `schema.sql` and migrations 002–006. Make sure `pg_cron` is enabled; migration 005 protects user-created workspace data from the earlier cascading cleanup.
3. In Supabase **Settings → API Keys**, copy the project URL and a server-only **Secret key** into `.env`:

   ```env
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
   APP_URL=http://localhost:3000
   ```

   For older Supabase projects, the legacy `service_role` key is also accepted through `SUPABASE_SERVICE_ROLE_KEY`. Keep either key on the server. Secret keys bypass Row Level Security, so the app checks the signed-in user and record owner before each database action. The key never goes to the browser. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

4. In Supabase **Authentication → Providers → Email**, enable sign-ups and choose whether new accounts need email confirmation. Users create accounts from the LeadSense sign-in screen.

5. Start the app from this folder:

   ```sh
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000). Create an account and confirm the email if required. Check `/api/health` to see whether the database, sign-in, and YouTube key are detected.

7. To assign the first administrator after creating and confirming the account, run this in Supabase SQL Editor with your email:

   ```sql
   update public.app_users set role = 'admin', updated_at = now()
   where email = 'you@example.com';
   ```

   Sign out and back in. Admin access is checked on the server. To keep old shared CRM records, run the three backfill statements at the end of the migration file after setting the first admin.

Supabase is required for accounts, saved searches, CRM records, tasks, and private creator notes. Without a database, the app shows setup status and does not pretend that changes were saved. Live YouTube discovery also requires a server-side API key.

## Add YouTube search later

1. In [Google Cloud Console](https://console.cloud.google.com/), select or create a project.
2. Enable **YouTube Data API v3** and create an API key.
3. Restrict the key to the YouTube Data API v3. Keep it server-side.
4. Set `YOUTUBE_API_KEY` in `.env` locally or in the Render service environment, then restart/redeploy.
5. Search from the app. Discovery checks up to five channel-search pages per request, each for up to 50 candidates, and fetches candidate channel details. It can also use one video-search page when channel discovery has too few candidates. **Load more** continues from the next token. The app-side defaults are 40 `search.list` calls per day and 9,000 quota units for other methods across the app, plus 120 YouTube API requests per account per day. These are app safeguards, not Google's live quota reading. Google Cloud may count other tools or services against the same project quota, so verify usage in Cloud Console. YouTube documents `search.list` in its separate 100-request daily bucket; each page is another request. Other API requests use the general quota. See [YouTube quota costs](https://developers.google.com/youtube/v3/determine_quota_cost) and [search.list](https://developers.google.com/youtube/v3/docs/search/list).

Opening **Review recent uploads** requests channel details, up to 10 public playlists, the uploads playlist, and up to 10 videos. These add YouTube API requests. Each account can inspect up to 20 channels per day by default; change that with `USER_DAILY_ANALYSIS_LIMIT`.

The app does not scrape YouTube pages, collect email addresses or phone numbers, estimate revenue, or create creator scores. Users can open a channel and check contact links that the creator chose to make public. The API key is never included in frontend HTML or requests from the browser. See [docs/youtube-metadata-review.md](docs/youtube-metadata-review.md) for the feature-by-feature source, availability, restrictions, retention, and implementation status.

## Deploy to Render

1. In Supabase SQL Editor, apply `schema.sql` for a new project, followed by migrations `002`, `003`, `004`, `005`, and `006` in order. For an existing project already at migration 004, apply 005 and 006. Enable `pg_cron` before migrations 004/005/006 if Supabase has not enabled it. Migration 005 replaces migration 004's old cascading-delete cleanup. Follow [docs/DATABASE_MIGRATIONS.md](docs/DATABASE_MIGRATIONS.md) and verify the objects before using production data.
2. Push this project folder to the intended GitHub repository and confirm CI passes.
3. In Render, create or open the service from **New → Blueprint** and connect the repository. Render reads `render.yaml`; automatic deploy on GitHub push is enabled for the connected branch (`autoDeploy: true`).
4. Add these environment values in the Render service settings:

   - `SUPABASE_URL` — your project URL
   - `SUPABASE_SECRET_KEY` — your server-only Supabase secret key
   - `APP_URL` — the deployed `https://…onrender.com` URL
   - `YOUTUBE_API_KEY` — optional until live YouTube search is needed

5. Set `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` as configured by the Blueprint. Keep `APP_URL` set to the service's public HTTPS URL.
6. Deploy manually from Render after reviewing the commit. The app listens on Render's `PORT` and uses `/api/health` as its health check.
7. Check `https://YOUR_APP/api/health`. It should show `database: "connected"`; after adding the YouTube key, it should show `youtube: "configured"`. This endpoint does not verify every migration or scheduled task.

Render’s official guides cover [web services](https://render.com/docs/web-services), [environment variables](https://render.com/docs/configure-environment-variables), and [Node versions](https://render.com/docs/node-version).

## Database and data separation

| Table | Stores |
|---|---|
| `app_users` | Supabase Auth account role, status, plan, and optional search limit |
| `external_prospects` | User-owned, independently researched businesses, notes, service, stage, and next action |
| `opportunity_evidence` | Independent evidence notes with source, confidence, and dimension |
| `crm_tasks` | Follow-ups for independent prospects |
| `youtube_search_presets` | Search phrases and filter settings only |
| `youtube_api_usage` | This app’s Pacific-day `search.list` count and per-method metadata request counts |
| `creator_leads`, `creator_evidence`, `creator_contacts` | Private creator follow-up data, user-provided evidence and public contact routes; only YouTube profile fields expire after 29 days, child records cascade only on intentional parent/account deletion |
| `discovery_searches` | User-owned search phrase, filters, timestamps, and completion/error status; no channel response data |
| `user_daily_usage` | Per-user app search request counts |
| `admin_audit_logs`, `api_error_logs` | Administrator changes and sanitized server errors |

## Server API

The browser calls only the same-origin app server:

| Route | Purpose |
|---|---|
| `GET /api/health` | Reports whether Supabase and YouTube are configured; never returns keys |
| `POST /api/search/interpret` | Creates a reviewable, rule-based filter draft from a text description |
| `POST /api/auth/signup`, `/login`, `/logout`; `GET /api/auth/session` | Creates accounts and manages server-set sessions |
| `POST /api/youtube/search` | Searches public channels; returns the next page token and app-side usage count |
| `POST /api/youtube/inspect` | Fetches a channel’s current public fields and up to 10 recent uploads; does not save the response |
| `GET, POST /api/creator-leads` | List or save account-owned creator follow-ups; YouTube profile fields are refreshed or cleared within 29 days |
| `PATCH, DELETE /api/creator-leads/:id` | Update or remove an owned creator record |
| `POST /api/creator-leads/:id/evidence`; `PATCH, DELETE /api/creator-evidence/:id` | Add, manually verify, or remove source-backed evidence notes |
| `POST /api/creator-leads/:id/contacts`; `PATCH, DELETE /api/creator-contacts/:id` | Add, check, or remove manually collected public contact routes |
| `GET /api/admin/*` | Server-checked administrator overview, accounts, searches, errors, and configuration status |
| `GET /api/searches` | User-owned search history |
| `GET, POST /api/prospects` | List or create independent businesses |
| `PATCH, DELETE /api/prospects/:id` | Update or remove a business record |
| `GET, POST /api/tasks` | List or create follow-ups |
| `PATCH, DELETE /api/tasks/:id` | Mark a follow-up done or remove it |
| `GET, POST /api/search-presets` | List or save reusable query settings |
| `DELETE /api/search-presets/:id` | Remove a saved query |

Requests are size-limited, rate-limited using shared Supabase counters in production (migration 006), and write requests check the browser origin. API errors are translated to short messages that do not include the YouTube key. In development/test, rate limits use process-local memory.

Row Level Security is enabled and browser roles have no direct table grants. The Node backend uses the server-only Supabase secret key. **YouTube channel data is not written to any of these tables.**

## YouTube data limits and product boundaries

The developer policies restrict mixing YouTube API data with other data and derived metrics. The derived-metrics policy provides a path for approved analytics uses under an applicable amendment. LeadSense has no such approval documented; it therefore shows original public API fields and does not calculate YouTube-based scores or trends. Independently gathered CRM evidence remains separate. The search text helper is deterministic, not an AI model. See [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies), the [derived-metrics policy](https://developers.google.com/youtube/terms/derived-metrics-policy), and [quota costs](https://developers.google.com/youtube/v3/determine_quota_cost). Additional metrics require the applicable analytics use case and policy amendment; LeadSense has no approval documented. Until then, it uses original API fields only and keeps independently gathered CRM evidence separate.

The app stores search phrases, filters, app request counts, creator follow-up notes, source URLs, and manually entered contact details. Saved YouTube profile fields clear within 29 days; user-created records remain until deletion. LeadSense does not crawl creator pages or claim that a missing contact entry means no contact method exists.

## Current MVP boundaries

- Recent public video inspection is implemented on demand. Evidence and contact details are user-entered and source-backed; automatic discovery, link checking, background enrichment, billing, email sending, and notifications are not implemented.
- AI-backed natural-language interpretation is not connected. The current helper is rule-based and asks the user to review the draft.
- YouTube-derived opportunity scores are intentionally not implemented because of the developer policy restriction above.
- The admin area shows actual application records. Channel totals, analyzed leads, revenue, and Google Cloud quota are shown as unavailable where this app does not collect those values.
- App-side limits reduce bursts but do not report Google Cloud’s complete quota use.
- YouTube response data stays in memory and in the browser response only. The app does not seed fictional channels, prospects, or tasks into a real account.

## Tests

Run `npm run check` for syntax validation, `npm test` for discovery, quota boundaries, provenance mapping, API behavior, auth, ownership and frontend contracts, and `npm run test:browser` for Playwright desktop/mobile workflows (install Chromium with `npx playwright install chromium` the first time). See [docs/TESTING.md](docs/TESTING.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md), and [docs/AUDIT_CHECKLIST.md](docs/AUDIT_CHECKLIST.md).
