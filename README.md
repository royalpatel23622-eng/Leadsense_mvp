# LeadSense MVP

LeadSense is a Node.js app for public YouTube channel discovery and a separate business CRM. This version adds Supabase account sign-in, per-user workspace data, a protected administrator API, search history, and an administrator screen. Apply the account migration before deploying this version; the original database schema does not include the new account tables.

The backend is a dependency-free Node.js web server. It serves the existing frontend, calls YouTube from the server, and stores independent CRM records in Supabase Postgres. This keeps the YouTube key out of the browser and avoids a build step.

## What works

- **YouTube discovery:** query channels through the official YouTube Data API v3, request channel details in one batch, show raw public channel fields, apply a country-declared filter, sort by subscriber count, and load another page.
- **Recent upload inspection:** load a channel’s current public details and up to 10 recent uploads when requested. Each video’s raw public view/like/comment counts are shown as returned; the data is not stored or turned into scores.
- **Search filter draft:** paste a natural-language description and review a rule-based draft for service, search words, countries, subscriber range, and result count. The parser is not an AI model. Each field is editable before searching.
- **Account access:** Supabase Auth handles sign-up and sign-in. Session tokens use secure, HTTP-only cookies. CRM records and saved search settings are scoped to the signed-in user on the server.
- **Admin area:** server-side role checks protect admin routes. Admins can review accounts, usage, search status, errors, and service configuration; change roles/status/plans; and set per-user daily search limits. API secret values are never returned.
- **Search history:** records the user’s search phrase, filters, and completed/failed status. YouTube API result data is not saved.
- **Honest country labels:** country is shown only when the channel response declares it. `regionCode` changes the search viewing region; it does not identify where a creator lives. Country labels are used only when creator-declared; India is not secretly prioritized or excluded. Unknown remains unknown.
- **No YouTube data retention:** API search, inspection, and channel responses are returned to the browser and not written to Postgres or cached. Search presets save query settings only.
- **Independent CRM:** add and update business prospects, change stages, make follow-ups, mark tasks done, and export prospects to CSV. These routes never accept YouTube channel IDs or API responses.
- **Demo mode:** without Supabase, the frontend can show clearly labeled sample records, but account routes require Supabase to be configured. Without a YouTube key, live search shows a clear setup message and examples remain labeled.
- **Deploy files:** `render.yaml` describes a Render web service. `schema.sql` creates the database tables and the daily search counter.

## Local setup

Requirements: Node.js 22 or newer. No npm packages are required.

1. Copy `.env.example` to `.env`.
2. Create a Supabase project and run `schema.sql` in **SQL Editor**. Then run `migrations/002_accounts_search_history.sql` in the same editor.
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

If you do not have a Supabase project yet, you can still run the app in demo mode. Prospect and task edits then stay in your browser’s local storage and are not shared with the server.

## Add YouTube search later

1. In [Google Cloud Console](https://console.cloud.google.com/), select or create a project.
2. Enable **YouTube Data API v3** and create an API key.
3. Restrict the key to the YouTube Data API v3. Keep it server-side.
4. Set `YOUTUBE_API_KEY` in `.env` locally or in the Render service environment, then restart/redeploy.
5. Search from the app. The app uses `search.list` for channel discovery, then one `channels.list` batch for channel details. A search can make two API requests, but only one `search.list` call. The Google documentation currently lists a default 100-call/day `search.list` bucket; quotas can change. LeadSense also has its own configurable daily search cap, default 40, stored as an app call count—not a reading of your whole Google Cloud quota. See [YouTube quota costs](https://developers.google.com/youtube/data/determine_quota_cost) and [search.list](https://developers.google.com/youtube/v3/docs/search/list).

Opening **Review recent uploads** requests channel details, its uploads playlist, and up to 10 videos. These add YouTube API requests. Each account can inspect up to 20 channels per day by default; change that with `USER_DAILY_ANALYSIS_LIMIT`.

The app does not scrape YouTube pages, collect contact information, estimate revenue, or create creator scores. The API key is never included in frontend HTML or requests from the browser.

## Deploy to Render

1. In Supabase SQL Editor, apply `schema.sql` if this is a new project, then apply `migrations/002_accounts_search_history.sql`. This migration is required before the new version starts accepting sign-ins and searches.
2. Push this project folder to a GitHub repository.
3. In Render, choose **New → Blueprint** and connect the repository. Render reads `render.yaml` and creates a Node web service.
4. Add these environment values in the Render service settings:

   - `SUPABASE_URL` — your project URL
   - `SUPABASE_SECRET_KEY` — your server-only Supabase secret key
   - `APP_URL` — the deployed `https://…onrender.com` URL
   - `YOUTUBE_API_KEY` — optional until live YouTube search is needed

5. Deploy. The app listens on Render’s `PORT` and uses `/api/health` as its health check.
6. Check `https://YOUR_APP/api/health`. It should show `database: "connected"`; after adding the YouTube key, it should show `youtube: "configured"`.

Render’s official guides cover [web services](https://render.com/docs/web-services), [environment variables](https://render.com/docs/configure-environment-variables), and [Node versions](https://render.com/docs/node-version).

## Database and data separation

| Table | Stores |
|---|---|
| `app_users` | Supabase Auth account role, status, plan, and optional search limit |
| `external_prospects` | User-owned, independently researched businesses, notes, service, stage, and next action |
| `opportunity_evidence` | Independent evidence notes with source, confidence, and dimension |
| `crm_tasks` | Follow-ups for independent prospects |
| `youtube_search_presets` | Search phrases and filter settings only |
| `youtube_api_usage` | This app’s daily `search.list` call count only |
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
| `GET /api/admin/*` | Server-checked administrator overview, accounts, searches, errors, and configuration status |
| `GET /api/searches` | User-owned search history |
| `GET, POST /api/prospects` | List or create independent businesses |
| `PATCH, DELETE /api/prospects/:id` | Update or remove a business record |
| `GET, POST /api/tasks` | List or create follow-ups |
| `PATCH, DELETE /api/tasks/:id` | Mark a follow-up done or remove it |
| `GET, POST /api/search-presets` | List or save reusable query settings |
| `DELETE /api/search-presets/:id` | Remove a saved query |

Requests are size-limited, rate-limited in the Node process, and write requests check the browser origin. API errors are translated to short messages that do not include the YouTube key.

Row Level Security is enabled and browser roles have no direct table grants. The Node backend uses the server-only Supabase secret key. **YouTube channel data is not written to any of these tables.**

## YouTube data limits and product boundaries

YouTube’s developer policy prohibits using API data to create new or derived metrics, including calculating a score from likes and views. That conflicts with the requested 100-point opportunity score and calculated engagement/view trends. LeadSense displays original public fields from YouTube but does not score or rank channels using those fields. The search text helper is deterministic, not an AI model. See [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies#E._Refreshing,_Storing,_and_Displaying_API_Data).

The app stores search phrases, filters, app request counts, user-created CRM notes, and sanitized errors. It does not store returned YouTube channel or video data. Contact discovery from About pages, websites, and social profiles is not implemented; an empty contact section must not be treated as evidence that a creator has no contact method.

## Current MVP boundaries

- Recent public video inspection is implemented on demand. Historical trend analysis, evidence notes linked to channels, contact discovery/verification, background workers, billing, email sending, and notifications are not implemented.
- AI-backed natural-language interpretation is not connected. The current helper is rule-based and asks the user to review the draft.
- YouTube-derived opportunity scores are intentionally not implemented because of the developer policy restriction above.
- The admin area shows actual application records. Channel totals, analyzed leads, revenue, and Google Cloud quota are shown as unavailable where this app does not collect those values.
- App-side limits reduce bursts but do not report Google Cloud’s complete quota use.
- Real channel data stays in memory and in the browser response only. Sample records are clearly marked as examples.

## Tests

Run `npm test` to check the natural-language filter parser. The project uses Node’s built-in test runner without extra packages.
