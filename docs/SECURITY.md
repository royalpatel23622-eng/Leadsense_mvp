# Security notes

## Secrets and data access

- Supabase secret/service-role and YouTube API keys are read only by `server.mjs`; do not expose them in browser assets.
- Database tables are used through the server. RLS is enabled, browser roles have no direct grants to server-owned workspace tables, and server queries scope user records by authenticated ID.
- Creator evidence and contact routes are user-entered. LeadSense does not crawl or verify external pages.
- API errors are returned as short messages; secrets and session tokens must not be added to logs.

## Sessions and writes

Auth sessions use HttpOnly cookies, and logout calls Supabase's local logout endpoint with the current access token before clearing both cookies. Production write requests must have an origin matching `APP_URL`. Login and signup are separately rate limited.

## HTTP headers and proxy trust

The app sets CSP, frame, content-type, referrer, and permissions policies. The current frontend contains inline scripts/styles and style attributes, so CSP permits `'unsafe-inline'` for scripts and styles. This is a known hardening limitation; removing it requires migrating those inline blocks to external assets or adding nonces/hashes and validating the real app in a browser. Do not tighten it blindly.

HSTS is set only in production when the app has a configured HTTPS `APP_URL`, a direct TLS socket, or a trusted proxy reports HTTPS. The proxy protocol is considered only when `TRUSTED_CLIENT_IP_HEADER` is configured.

Forwarded client IP headers are ignored by default. The operator may configure one of the supported headers (`cf-connecting-ip`, `x-real-ip`, or `x-forwarded-for`) only when a trusted proxy overwrites/sanitizes that header. Only a single valid IP is accepted. Render's Blueprint selects `cf-connecting-ip`; verify this against the current Render edge configuration before changing it.

## Shared rate limiting

Production API rate limits use the atomic `take_api_rate_limit_slot` Supabase RPC. Each bucket key is HMAC-hashed with a server secret before storage. If the shared rate-limit store is unavailable, production API requests fail closed (health remains available). Development/test can use a bounded process-local fallback, which is not suitable for a multi-instance deployment.

## Review before release

Run `npm run check`, `npm test`, and `npm run test:browser`; inspect the CSP/browser console and verify the database migrations on staging. Automated tests do not replace live session revocation, trusted proxy, Supabase ownership, or scheduled cleanup checks.
