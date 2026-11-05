# LeadSense MVP

LeadSense is a small, deployable app for public YouTube channel discovery and an independent business CRM. The app starts on **Find creators**. It has no sign-in yet, as requested.

The backend is a dependency-free Node.js web server. It serves the existing frontend, calls YouTube from the server, and stores independent CRM records in Supabase Postgres. This keeps the YouTube key out of the browser and avoids a build step.

## What works

- **YouTube discovery:** query channels through the official YouTube Data API v3, request channel details in one batch, show raw public channel fields, apply a country-declared filter, sort by subscriber count, and load another page.
- **Honest country labels:** country is shown only when the channel response declares it. `regionCode` changes the search viewing region; it does not identify where a creator lives. Declared India (`IN`) is excluded by default. Unknown remains unknown.
- **No YouTube data retention:** API search and channel responses are returned to the browser and not written to Postgres or cached. Search presets save query settings only.
- **Independent CRM:** add and update business prospects, change stages, make follow-ups, mark tasks done, and export prospects to CSV. These routes never accept YouTube channel IDs or API responses.
- **Demo mode:** without Supabase, the frontend remains usable with sample records. Local edits stay in this browser only. Without a YouTube key, live search shows a clear setup message and the sample results remain labeled as examples.
- **Deploy files:** `render.yaml` describes a Render web service. `schema.sql` creates the database tables and the daily search counter.

## Local setup

Requirements: Node.js 22 or newer. No npm packages are required.

1. Copy `.env.example` to `.env`.
2. Create a Supabase project and run the full contents of `schema.sql` in **SQL Editor**.
3. In Supabase **Settings → API Keys**, copy the project URL and a server-only **Secret key** into `.env`:

   ```env
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
   APP_URL=http://localhost:3000
   ```

   For older Supabase projects, the legacy `service_role` key is also accepted through `SUPABASE_SERVICE_ROLE_KEY`. Keep either key on the server. Supabase recommends secret keys for backend use; they bypass Row Level Security, so the app keeps the key out of the browser and exposes no direct database credentials. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

4. Start the app from this folder:

   ```sh
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000). Check `/api/health` to see whether the database and YouTube key are detected.

If you do not have a Supabase project yet, you can still run the app in demo mode. Prospect and task edits then stay in your browser’s local storage and are not shared with the server.

## Add YouTube search later

1. In [Google Cloud Console](https://console.cloud.google.com/), select or create a project.
2. Enable **YouTube Data API v3** and create an API key.
3. Restrict the key to the YouTube Data API v3. Keep it server-side.
4. Set `YOUTUBE_API_KEY` in `.env` locally or in the Render service environment, then restart/redeploy.
5. Search from the app. The app uses `search.list` for channel discovery, then one `channels.list` batch for channel details. A search can make two API requests, but only one `search.list` call. The Google documentation currently lists a default 100-call/day `search.list` bucket; quotas can change. LeadSense also has its own configurable daily search cap, default 40, stored as an app call count—not a reading of your whole Google Cloud quota. See [YouTube quota costs](https://developers.google.com/youtube/data/determine_quota_cost) and [search.list](https://developers.google.com/youtube/v3/docs/search/list).

The app does not scrape YouTube pages, collect contact information, estimate revenue, or create creator scores. The API key is never included in frontend HTML or requests from the browser.

## Deploy to Render

1. Push this project folder to a GitHub repository.
2. In Render, choose **New → Blueprint** and connect the repository. Render reads `render.yaml` and creates a Node web service.
3. Add these environment values in the Render service settings:

   - `SUPABASE_URL` — your project URL
   - `SUPABASE_SECRET_KEY` — your server-only Supabase secret key
   - `APP_URL` — the deployed `https://…onrender.com` URL
   - `YOUTUBE_API_KEY` — optional until live YouTube search is needed

4. Deploy. The app listens on Render’s `PORT` and uses `/api/health` as its health check.
5. Check `https://YOUR_APP/api/health`. It should show `database: "connected"`; after adding the YouTube key, it should show `youtube: "configured"`.

Render’s official guides cover [web services](https://render.com/docs/web-services), [environment variables](https://render.com/docs/configure-environment-variables), and [Node versions](https://render.com/docs/node-version).

## Database and data separation

| Table | Stores |
|---|---|
| `external_prospects` | Independently researched businesses, notes, service, stage, and next action |
| `opportunity_evidence` | Independent evidence notes with source, confidence, and dimension |
| `crm_tasks` | Follow-ups for independent prospects |
| `youtube_search_presets` | Search phrases and filter settings only |
| `youtube_api_usage` | This app’s daily `search.list` call count only |

## Server API

The browser calls only the same-origin app server:

| Route | Purpose |
|---|---|
| `GET /api/health` | Reports whether Supabase and YouTube are configured; never returns keys |
| `POST /api/youtube/search` | Searches public channels; returns the next page token and app-side usage count |
| `GET, POST /api/prospects` | List or create independent businesses |
| `PATCH, DELETE /api/prospects/:id` | Update or remove a business record |
| `GET, POST /api/tasks` | List or create follow-ups |
| `PATCH, DELETE /api/tasks/:id` | Mark a follow-up done or remove it |
| `GET, POST /api/search-presets` | List or save reusable query settings |
| `DELETE /api/search-presets/:id` | Remove a saved query |

Requests are size-limited, rate-limited in the Node process, and write requests check the browser origin. API errors are translated to short messages that do not include the YouTube key.

Row Level Security is enabled and browser roles have no table grants. The Node backend uses the server-only Supabase secret key. **YouTube channel data is not written to any of these tables.**

## No-login deployment limits

This is a **single shared workspace** until sign-in is added. Anyone who can open the deployed app can view or change the CRM, follow-ups, and saved search settings. Do not put private client details, personal contact data, or confidential notes in a publicly reachable deployment. The included request limit reduces accidental bursts; it is not a substitute for authentication or distributed abuse protection. Add user authentication, tenant scoping, and matching RLS policies before sharing this with other people.

## Current MVP boundaries

- Website scanning, admin controls, user accounts, email sending, and notifications are not included.
- Opportunity evidence can be stored in the schema, but the first usable CRM screen currently saves notes on the prospect; evidence editing and score administration need a follow-up build.
- API search cap and rate limiting are app-side safeguards, not a live Google quota dashboard.
- Real channel data stays in memory and in the browser response only. The sample records are clearly marked and can be used before credentials are set.
