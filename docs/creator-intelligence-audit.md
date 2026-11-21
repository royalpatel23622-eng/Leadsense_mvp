# LeadSense creator intelligence audit

Audit date: 20 November 2026

This document records the current implementation, the reference project review, policy boundaries and the staged implementation plan. It does not mean every planned feature is implemented.

## Reference repository review

Reviewed `mattwright324/youtube-metadata` beyond its README: directory structure, build and license files, `youtube-metadata.js`, `youtube-metadata-bulk.js`, `youtube-metadata-search.js`, `youtube-api-v3.js`, `shared.js`, `translators.js`, and the examples. The project is an MIT-licensed browser tool. Its implementation covers YouTube video/channel/playlist metadata, bulk ID collection, pagination, raw JSON/CSV/ZIP export and import, translations, tag and location summaries, upload-time charts, and video search with channel enrichment.

Some reference features depend on browser-side API keys, third-party CORS/API proxies or external lookup services. Those patterns are not appropriate for LeadSense. Its video-search feature searches videos and then groups their channels; it is not equivalent to channel search. Bulk metadata work can consume substantial quota. Browser rendering also builds HTML from API data, so its UI code is not a safe component to copy directly.

The repository declares the MIT License, copyright Matthew Wright, 2020. No reference source code has been copied or adapted into LeadSense, so no MIT source attribution is required for the current implementation. Any future direct reuse must preserve the license and copyright notice and be documented.

## Feature comparison

| Feature | Reference repository | Current LeadSense | Required action |
|---|---|---|---|
| Channel metadata | Official API fields for title, description, IDs, country, thumbnails and statistics | Official API search and on-demand inspection return these fields | Keep the server-side API adapter; label unavailable fields honestly |
| Channel description | Read from channel snippet | Returned by inspection | Show source and retrieval time with the field |
| Recent uploads | Upload playlist pagination and video batches | Up to 10 upload entries, then one video batch | Sample count and collection time are labeled; pagination can be added with a bounded user action |
| Video metadata | Snippet, statistics, content details, category and related fields | Title, description, date, thumbnail, counts, duration, category ID and live fields with per-field provenance | Do not infer Shorts from duration alone |
| Playlist metadata | Public playlist details and playlist item collection | Up to 10 public playlists, first page only | Retain the cap and state that this is a partial public sample |
| External links | Some links surfaced from descriptions or external resolvers | Not returned by the official channel API; UI directs user to creator channel | Do not claim the API returns channel About links; consider user-entered/source-backed contact routes separately |
| Video duration | API ISO 8601 duration with local formatting | API ISO 8601 duration; short-duration candidate is explicitly not confirmed as a Short | Keep format caveat visible |
| Bulk metadata | Bulk channel/video/playlist inputs and exports | No dedicated bulk enrichment or import/export flow | Evaluate after single-profile provenance and quota controls |
| Data export | JSON/CSV/ZIP, including downloaded thumbnail copies | No export of YouTube API data | Do not add API-data export without checking current policy and retention rules |
| Metadata freshness | Per-request browser results; no persistent field-level freshness model | Per-field source, API method, retrieval time, and status are visible; API response snapshots are not stored | Keep API response provenance visible and avoid persistent snapshots |
| Translation | Bundled language, country and category labels | No translation layer | Optional later; use authoritative mappings and preserve raw values |
| Content categorization | Uses YouTube categories and also aggregates text metadata | Search results expose YouTube topic categories; no reliable niche classifier | Show only YouTube-returned categories by default; do not infer category from API data without policy approval |

## Current LeadSense findings

- Discovery uses official YouTube `search.list` and `channels.list`; it paginates within a bound and separates exact results from related candidates.
- Search history stores query, filters and outcome. The returned YouTube channel/video response is not written to Supabase.
- On-demand inspection fetches channel metadata, up to 10 public playlists, up to 10 recent uploads and their available video fields. A failure in optional playlist discovery does not fail the core inspection.
- The UI reports likes/views as unavailable when hidden, and explicitly warns that a short duration is not proof that a video is a Short. It does not calculate retention, editing quality, upload trends or engagement scores.
- `opportunity_evidence` currently belongs to independent CRM businesses. It is not a creator evidence system and must not be repurposed without a separate ownership and source model.
- `scoreEvidence` exists in the server but is not part of the YouTube profile path. Do not use it to score YouTube creators.
- Contact details are not extracted from YouTube. The official channel resource has no general business email field; users are directed to creator-published contact routes on the channel.
- App quota counters are app-side request limits, not an authoritative view of Google Cloud project quota. They now reserve search calls separately from metadata methods, record counts by method, and use the Pacific quota date.
- Saved creator records, user-entered source evidence, and manually collected public contact routes now have separate account-owned tables. New entries are unverified by default; only a user-marked checked strong public request can be classified as explicit. Migration 005 changes the 29-day `pg_cron` cleanup to scrub YouTube-sourced channel ID/name/URL only; labels, notes, evidence, contacts, and stage remain until the user deletes them. Apply migrations 005 and 006 and verify them on staging before relying on this behavior.

## Policy and data boundaries

LeadSense uses the official API and does not need to reproduce the reference project's proxy or browser-key architecture. YouTube API data must be refreshed or deleted within the applicable 30-day limit, and must be shown as current data rather than silently presented as historical truth. The app does not persist response snapshots; a saved creator's YouTube ID/name/URL are scrubbed after 29 days. User-authored notes and records follow a separate retention policy and remain until user deletion.

YouTube's developer policies restrict combining API data with other data and restrict derived metrics. The separate derived-metrics policy describes a path for approved analytics use cases under an applicable policy amendment. LeadSense has no such approval documented. It therefore does not calculate YouTube-based upload-frequency, view-average, retention, thumbnail-quality, editing-quality, engagement, or opportunity scores. CRM evidence entered independently by the user remains separate from YouTube API fields. The product can show the original fields returned by YouTube and user-supplied or independently sourced evidence with clear provenance. AI does not remove these restrictions.

Authoritative references:

- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- [YouTube Data API quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)
- [YouTube `search.list` reference](https://developers.google.com/youtube/v3/docs/search/list)
- [YouTube `channels.list` reference](https://developers.google.com/youtube/v3/docs/channels/list)
- [YouTube `videos.list` reference](https://developers.google.com/youtube/v3/docs/videos/list)

## Remaining staged work

1. **Done locally:** add response-level field provenance and explicit sample labels for channel, playlist and video fields without storing YouTube API data.
2. **Done locally:** add mocked inspection/provenance tests and method quota coverage alongside existing discovery tests.
3. **Implemented locally, staging verification outstanding:** reserve quota slots atomically in Supabase by API method and per-user API call; count search requests separately from other API units; reset at midnight Pacific; show usage in the UI. Identical request deduplication and caching are still absent; API responses remain unpersisted.
4. **Implemented locally; migration verification outstanding:** add user-owned creator leads, manually entered evidence/contact routes, ownership checks, profile actions, and field-only 29-day YouTube data scrubbing. Automatic source crawling and link checking remain out of scope.
5. **Implemented locally:** show transparent evidence classifications; no YouTube-derived buying-intent claim or score is created.
6. **Implemented locally:** add saved creator controls to discovery and direct browser coverage for saving a profile, adding evidence/contact records, and checking the responsive workspace.
7. **Outstanding external verification:** run migrations against a staging Supabase project and confirm both quota RPCs and `pg_cron` execute correctly. The app reports the exact migration when the quota RPC is missing. Re-run all suites and inspect the diff before any release.

## Licensing and security note

The reviewed reference's MIT license allows reuse subject to preserving its notice, but no code has been copied. Do not place YouTube API keys or Supabase secret keys in browser code. Do not use untrusted proxies, browser automation, CAPTCHA workarounds, or page scraping to fill fields absent from the official API.
