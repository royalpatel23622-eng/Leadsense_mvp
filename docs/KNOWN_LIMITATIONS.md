# Known limitations

## External verification still required

- Supabase migrations 003–006, RPC permissions, RLS behavior, and `pg_cron` execution require staging/live Supabase verification. This repository cannot claim that your project has those objects.
- YouTube integration is tested with mocked API responses. A live authorized search and comparison against Google Cloud quota reporting remain outstanding.
- Render deployment, proxy headers, HSTS at the edge, and multi-instance behavior have not been live-verified.

## Product scope

- YouTube discovery and on-demand inspection use the official YouTube Data API. Exact matches and related candidates are separate; YouTube search order does not guarantee lead quality.
- Subscriber counts can be hidden. Country is shown only when declared by the channel and is distinct from the search region.
- LeadSense cannot determine retention, editing quality, thumbnail quality, willingness to hire, revenue, or a reliable service gap from the available fields. It does not fabricate these scores or contact details.
- Channel contact routes, evidence, and notes are manually entered. Automated email discovery, page crawling, link verification, background refresh, and AI analysis are not implemented.
- The rule-based query helper is not an AI model. Billing, subscriptions, email sending, and notifications are not implemented.
- Discovery responses are not cached or stored as API snapshots. Saved creator YouTube ID, URL, and name are scrubbed after 29 days; user-authored labels, notes, evidence, contacts, and stages stay until the user deletes the lead or account.
- Search and quota safeguards are app-side limits, not Google's complete quota usage. Each search results page is a separate request; `search.list` has a separate daily quota bucket. Check the current Google documentation and Cloud Console before setting limits.
- The app shell and UI scripts load from same-origin files, and CSP limits scripts to `'self'`. Inline style attributes remain allowed for existing component styling. Auth animation CSS is injected locally by the auth module, so `style-src` still allows inline styles.
- Render free instances may sleep while idle. The first request after sleep can take longer.
