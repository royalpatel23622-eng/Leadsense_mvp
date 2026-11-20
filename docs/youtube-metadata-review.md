# YouTube metadata capabilities and source review

Reviewed for LeadSense on 2026-11-19. The product uses the official YouTube Data API from the Node server. API responses are returned for the current request and are not stored in the CRM or database.

## Reference repository

Reference A: [mattwright324/youtube-metadata](https://github.com/mattwright324/youtube-metadata). The repository identifies an MIT license. Its stated strengths include API-backed channel/video/playlist metadata, interpretation of fields, code normalization, and exports. LeadSense already uses the official API and an existing metadata adapter, so no repository code was copied; the useful concepts were independently implemented only where they fit the current server architecture. Its archive/export and OSINT features are not adopted because LeadSense does not retain YouTube API responses or investigate private/deleted/unlisted content.

Reference: [automata-lab `yt-channel`](https://github.com/danieltonad/automata-lab/tree/820ab72952c089f3551c8115969829c46d99295c/yt-channel), reviewed at commit `820ab72952c089f3551c8115969829c46d99295c` (`yt_channel.py` and `README.md`). The reviewed tree has no `LICENSE` file. No source code was copied into LeadSense and no permission to use that code was assumed. Only feature ideas were considered.

The reference is a Python Playwright scraper that launches Chromium and reads YouTube page markup. Its README describes channel details, external links, videos, Shorts, playlists, livestreams, and podcasts. These are ideas to evaluate, not guarantees of complete or correct data. Page selectors and page layouts can change. During review, the Shorts and podcast collection routines appeared to return within their first batch loop, and the live-video routine referenced a `views` name not defined in that function. The scraper also returns empty lists after some failures, which can hide incomplete collection. These are more reasons to avoid treating scraped output as authoritative.

## Capability review

| Capability | Permitted source and method | What is available | Restrictions and limits | Retention in LeadSense | Status |
|---|---|---|---|---|---|
| Duration parsing and normalized display | Independent implementation based on documented YouTube ISO 8601 `contentDetails.duration` | Converts API duration strings into seconds and human-readable labels | Duration alone cannot certify Shorts format | Request only; not saved | Implemented in `lib/youtube-metadata.mjs`; existing code retained instead of copying the reference |
| Channel metadata | YouTube Data API `channels.list`, `snippet`, `statistics`, `contentDetails` | Public title, description, custom URL, declared country, creation time, public counts, and uploads playlist ID when returned | Some values are missing or hidden. Subscriber counts are rounded. A search region is not a creator location. | Request only; not saved | Implemented in discovery and inspection |
| Channel content categories | `channels.list` with `topicDetails.topicCategories` | YouTube may return topic category URLs for a channel | Optional and not a complete or guaranteed classification; LeadSense does not invent categories when missing | Request only; not saved | Implemented in inspection; also returned with search results |
| Videos | `playlistItems.list` for the uploads playlist, followed by `videos.list` | Up to 10 recent public video titles, descriptions, publish dates, durations, thumbnails, and public statistics when available | This is a recent sample, not every upload or a full channel audit. Counts may be hidden. Thumbnails are displayed from YouTube URLs and are not downloaded or archived by LeadSense. | Request only; not saved | Implemented in channel inspection |
| Shorts | `videos.list` `contentDetails.duration` | Duration is available. A video of 180 seconds or less can be surfaced as a short-duration candidate. | The public API fields used here do not confirm whether YouTube classifies that video as a Short. Duration alone can mislabel regular videos. | Request only; not saved | Implemented as “Under 3 min · format not confirmed”; never asserted to be a Short |
| Livestreams | `videos.list` `snippet.liveBroadcastContent` and `liveStreamingDetails` | Upcoming/live state and scheduled or actual broadcast timing/viewer fields may be returned for broadcasts | Fields are optional, state can change, and concurrent viewers may be hidden. Past broadcasts are only identifiable when returned details support it. | Request only; not saved | Implemented for returned recent uploads |
| Playlists | YouTube Data API `playlists.list` with `channelId`; public entries only, capped at 10 | Public playlist title, description, publish date, item count, and playlist URL | The API does not expose every channel tab or promise the list is exhaustive. | Request only; not saved | Implemented in channel inspection |
| Podcast discovery | No reliable public podcast-tab or podcast-type field is used in this integration | A public playlist may have a creator-chosen title that mentions a podcast | A playlist title is not a reliable format classification. LeadSense does not claim to find all podcasts or label one automatically. | Not collected | Not implemented; no reliable public API classification identified |
| Creator-provided external links | Public channel `snippet` fields in `channels.list` | Channel title, description, and custom URL are available; the structured external links shown on channel pages are not a field in the public channel resource used here | Do not scrape channel tabs, parse description/contact data for email or phone, or claim there are no links when the API omits them. The user can open YouTube to inspect links the creator chose to publish. | Not collected | Direct channel link provided; external-link extraction is not implemented |
| Thumbnail, editing, or retention quality | No public channel-search field provides these judgments | Public video pages can be opened by the user for manual review | Retention and click-through metrics are private creator analytics. LeadSense must not infer poor retention, bad editing, or “bad thumbnails” from public counts. | No inferred scores stored | Manual review only; no automated quality score |
| Independent business evidence | User-entered website/business evidence, separate from YouTube API responses | CRM can hold independently researched prospects and notes | Keep this evidence separate from YouTube data; do not present it as sourced from YouTube | Stored in the user's CRM by design | Existing independent CRM; not populated from YouTube metadata |

## Search behavior

Discovery uses `search.list(type=channel)` and a batched `channels.list` lookup. A request can inspect up to five candidate pages (up to 250 candidates at a page size of 50) or stop when the requested number of exact matches is reached. The requested match count is separate from the API page size. If fewer exact matches are available, exact results appear first and other topic candidates are labeled **Related topic**, with the missed filter explained. Malformed or unavailable subscriber/country values are treated as unknown. It never changes the user's filters silently. **Load more** continues using the same filter payload. The number of exact matches cannot be guaranteed for every phrase or filter combination.

The app's daily search counter tracks calls made by this app, not the full Google Cloud quota. Each `search.list` page consumes YouTube quota; loading more consumes additional quota. Channel, playlist, playlist-item, and video details also make API requests. The quota page in Google Cloud is authoritative for actual project use.

## Data handling and policy notes

- YouTube API data is fetched when requested and returned to the current browser session. The application does not cache or write these channel, video, playlist, category, or statistic responses to Supabase.
- CRM prospects and notes are user-entered independent business records. They are not joined to YouTube API data automatically.
- YouTube developer policies generally require temporary stored API data to be deleted or refreshed within 30 calendar days. Some statistics have additional restrictions when they are not authorized by the channel owner. LeadSense avoids the storage question by not persisting API responses.
- The app does not download video or audio, archive thumbnails, run browser automation, or use unofficial scraping.
- Recheck YouTube's current [Developer Policies](https://developers.google.com/youtube/terms/developer-policies), [API Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service), and [quota documentation](https://developers.google.com/youtube/data/determine_quota_cost) before launch, especially if adding caching, sharing, or derived analysis.

## Official API references

- [`channels.list`](https://developers.google.com/youtube/v3/docs/channels/list) and [channel resource](https://developers.google.com/youtube/v3/docs/channels)
- [`videos.list`](https://developers.google.com/youtube/v3/docs/videos/list) and [video resource](https://developers.google.com/youtube/v3/docs/videos)
- [`playlists.list`](https://developers.google.com/youtube/v3/docs/playlists/list)
- [`playlistItems.list`](https://developers.google.com/youtube/v3/docs/playlistItems/list)
- [`search.list`](https://developers.google.com/youtube/v3/docs/search/list)
