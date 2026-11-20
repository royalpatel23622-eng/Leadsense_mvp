# Deployment guide

LeadSense is a Node.js web service with a static HTML/JavaScript frontend. Render deployment is configured in `render.yaml`. GitHub pushes do not deploy automatically because `autoDeploy` is disabled; review and deploy from Render when you are ready. This guide does not claim that the current Supabase or Render services have been live-verified.

## Required services

- A Supabase project with the migrations in [DATABASE_MIGRATIONS.md](DATABASE_MIGRATIONS.md) applied.
- A server that runs the Node app and can reach Supabase and Google's YouTube Data API.
- A YouTube Data API key for live channel discovery and inspection. Without it, the app reports that live search is not configured.

## Deploy to Render

1. Confirm the intended commit is on GitHub and CI passes.
2. In Render, open the LeadSense web service or create it from the repository's Blueprint (`render.yaml`).
3. Set the required environment variables in the service's **Environment** page. Keep secrets in Render's secret fields; do not put them in `render.yaml` or browser code.
4. Set `APP_URL` to the exact public HTTPS origin, without a path, for example `https://your-service.onrender.com`.
5. Keep `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` only when deployed behind Render's documented proxy path. Do not trust arbitrary `X-Forwarded-For` values.
6. Run the build command `npm ci && npm run check && npm test`. The service starts with `npm start` and binds to Render's supplied `PORT`.
7. Deploy manually from Render after reviewing the diff. Then open `/api/health` and confirm `ok`, database connectivity, and YouTube configuration as applicable.
8. Test signup, login, logout, search, saved creator notes, and phone-sized layouts on the deployed service. Use a staging Supabase project for database changes first.

## Environment variables

### Required for production app data and accounts

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key; legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted |
| `APP_URL` | Public HTTPS origin used for write-origin checks and HSTS configuration |
| `PORT` | Supplied by Render; local default is 3000 |

### Required for live YouTube discovery

| Variable | Purpose |
|---|---|
| `YOUTUBE_API_KEY` | Server-only key for the official YouTube Data API |

### Optional safeguards and proxy settings

See `.env.example` for defaults and bounds: `TRUSTED_CLIENT_IP_HEADER`, `YOUTUBE_DAILY_SEARCH_LIMIT`, `YOUTUBE_DAILY_OTHER_UNITS_LIMIT`, `USER_DAILY_SEARCH_LIMIT`, `USER_DAILY_ANALYSIS_LIMIT`, `USER_DAILY_API_CALL_LIMIT`, `API_RATE_LIMIT_PER_MINUTE`, `API_AUTH_LOGIN_RATE_LIMIT`, `API_AUTH_SIGNUP_RATE_LIMIT`, `API_YOUTUBE_SEARCH_RATE_LIMIT`, `API_YOUTUBE_INSPECT_RATE_LIMIT`, and `YOUTUBE_OPERATION_TIMEOUT_MS`.

The API key should have only the required YouTube Data API access. Never use a browser-exposed key or commit `.env`.

## Render free plan

The free web service can sleep after inactivity and may take time to wake for the next request. This is a hosting-plan limitation, not an application health check failure. Do not add artificial uptime pings to hide it.

## Rollback

Render can deploy a prior application commit, but database migrations may not be reversible. Back up or stage the database first. Do not roll back schema changes by dropping user tables. If a release fails after a migration, keep the compatible database schema and deploy a code fix unless an administrator has reviewed a safe rollback plan.
