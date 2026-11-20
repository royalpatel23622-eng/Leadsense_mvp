import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.YOUTUBE_API_KEY = 'test-youtube-key';
process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
process.env.YOUTUBE_DAILY_SEARCH_LIMIT = '40';
process.env.API_YOUTUBE_SEARCH_RATE_LIMIT = '100';

let scenario;
let server;
let baseUrl;
const originalFetch = globalThis.fetch;
const userId = '11111111-1111-4111-8111-111111111111';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}
function channel(id, subscribers, country = 'US') {
  return { id, snippet: { title: id, description: `${id} channel`, ...(country ? { country } : {}), customUrl: `@${id}` }, statistics: { ...(subscribers === undefined ? {} : { subscriberCount: String(subscribers) }), videoCount: '12', viewCount: '1000' } };
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname === 'supabase.test' && url.pathname === '/auth/v1/user') return jsonResponse({ id: userId, email: 'test@example.com' });
  if (url.hostname === 'supabase.test' && url.pathname.startsWith('/rest/v1/')) {
    const table = url.pathname.replace('/rest/v1/', '');
    if (table === 'app_users') return jsonResponse([{ id: userId, email: 'test@example.com', role: 'user', status: 'active', plan: 'free', search_limit_override: null }]);
    if (table === 'rpc/take_user_search_slot') return jsonResponse(1);
    if (table === 'rpc/take_user_youtube_api_slot') {
      scenario.userApiCalls += 1;
      if (scenario.userApiLimit != null && scenario.userApiCalls > scenario.userApiLimit) return jsonResponse({ message: 'USER_DAILY_YOUTUBE_API_LIMIT reached' }, 429);
      return jsonResponse(scenario.userApiCalls);
    }
    if (table === 'rpc/take_youtube_api_slot') {
      const { p_method: method } = JSON.parse(init.body);
      scenario.methodReservations[method] = (scenario.methodReservations[method] || 0) + 1;
      const otherReservations = Object.entries(scenario.methodReservations).filter(([name]) => name !== 'search.list').reduce((sum, [, count]) => sum + count, 0);
      if (method !== 'search.list' && scenario.otherQuotaAfter != null && otherReservations > scenario.otherQuotaAfter) return jsonResponse({ message: 'DAILY_YOUTUBE_QUOTA_LIMIT reached' }, 429);
      if (method === 'search.list') {
        scenario.searchReservations += 1;
        if (scenario.quotaAfter != null && scenario.searchReservations > scenario.quotaAfter) return jsonResponse({ message: 'DAILY_YOUTUBE_QUOTA_LIMIT reached' }, 429);
      }
      return jsonResponse({ calls: scenario.searchReservations, method, otherUnits: otherReservations });
    }
    if (table === 'youtube_api_usage') return jsonResponse([{ search_calls: scenario.searchReservations, other_units: Object.entries(scenario.methodReservations).filter(([name]) => name !== 'search.list').reduce((sum, [, count]) => sum + count, 0), channels_list_calls: scenario.methodReservations['channels.list'] || 0, videos_list_calls: scenario.methodReservations['videos.list'] || 0, playlists_list_calls: scenario.methodReservations['playlists.list'] || 0, playlist_items_list_calls: scenario.methodReservations['playlistItems.list'] || 0 }]);
    if (table === 'discovery_searches' && init.method === 'POST') return jsonResponse([{ id: '22222222-2222-4222-8222-222222222222' }]);
    if (table === 'discovery_searches' && init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      scenario.historyStatuses.push(body.status);
      return jsonResponse([]);
    }
    return jsonResponse([]);
  }
  if (url.hostname === 'www.googleapis.com') {
    const resource = url.pathname.split('/').pop();
    if (resource === 'search') {
      if (scenario.failSearchToken === url.searchParams.get('pageToken')) return jsonResponse({ error: { errors: [{ reason: 'backendError' }] } }, 500);
      scenario.queryRequests.push(Object.fromEntries(url.searchParams.entries()));
      const pageKey = url.searchParams.get('pageToken') || 'first';
      const page = scenario.pages[pageKey] || { items: [] };
      return jsonResponse({ nextPageToken: page.nextPageToken, items: page.items.map(id => ({ id: { channelId: id }, snippet: { channelId: id } })) });
    }
    if (resource === 'channels') {
      const ids = (url.searchParams.get('id') || '').split(',').filter(Boolean);
      scenario.detailBatches.push(ids);
      return jsonResponse({ items: ids.filter(id => scenario.channelData[id]).map(id => scenario.channelData[id]) });
    }
  }
  throw new Error(`Unexpected mocked fetch: ${url}`);
};

let createAppServer;
before(async () => {
  ({ createAppServer } = await import('../server.mjs'));
  server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  globalThis.fetch = originalFetch;
});

function reset(config) {
  scenario = { pages: {}, channelData: {}, searchReservations: 0, userApiCalls: 0, methodReservations: {}, detailBatches: [], historyStatuses: [], queryRequests: [], ...config };
}
async function postSearch(body) {
  return new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}/api/youtube/search`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'leadsense_at=valid-token; leadsense_rt=refresh-token' } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
}

test('continues across candidate pages until requested exact count, preserving filters', async () => {
  reset({
    pages: { first: { items: ['ok-a', 'small', 'too-large', 'other-country'], nextPageToken: 'p2' }, p2: { items: ['ok-b', 'ok-c'] } },
    channelData: { 'ok-a': channel('ok-a', 5000), small: channel('small', 4999), 'too-large': channel('too-large', 100001), 'other-country': channel('other-country', 8000, 'CA'), 'ok-b': channel('ok-b', 50000), 'ok-c': channel('ok-c', 100000) },
  });
  const response = await postSearch({ query: 'gaming', requestedCount: 3, pageSize: 50, minSubscribers: 5000, maxSubscribers: 100000, declaredCountries: ['US'], includeUnknown: false, includeUnknownSubscribers: false, regionCode: 'IN' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.items.map(item => item.channelId), ['ok-a', 'ok-b', 'ok-c']);
  assert.equal(response.body.searchPages, 2);
  assert.equal(response.body.exactMatchCount, 3);
  assert.equal(response.body.complete, true);
  assert.deepEqual(scenario.detailBatches, [['ok-a', 'small', 'too-large', 'other-country'], ['ok-b', 'ok-c']]);
  assert.equal(scenario.methodReservations['search.list'], 2);
  assert.equal(scenario.methodReservations['channels.list'], 2);
  assert.equal(response.body.usage.calls, 2);
  assert.equal(response.body.usage.otherUnits, 2);
  assert.equal(response.body.usage.resetTimeZone, 'America/Los_Angeles');
  assert.equal(response.body.userApiUsage.calls, 4);
  assert.equal(response.body.userApiUsage.limit, 120);
  assert.equal(scenario.historyStatuses.at(-1), 'completed');
});

test('treats hidden subscriber and country values as unknown according to selected filters', async () => {
  reset({ pages: { first: { items: ['hidden-count', 'hidden-country', 'boundary-low', 'boundary-high'] } }, channelData: {
    'hidden-count': channel('hidden-count', undefined), 'hidden-country': channel('hidden-country', 7000, null),
    'boundary-low': channel('boundary-low', 5000), 'boundary-high': channel('boundary-high', 100000),
  } });
  const excluded = await postSearch({ query: 'design', requestedCount: 5, minSubscribers: 5000, maxSubscribers: 100000, declaredCountries: ['US'], includeUnknown: false, includeUnknownSubscribers: false });
  assert.deepEqual(excluded.body.items.map(item => item.channelId), ['boundary-low', 'boundary-high']);
  assert.equal(excluded.body.relatedItems.length, 2);
  assert.ok(excluded.body.relatedItems.some(item => item.relatedReasons.includes('Subscriber count is not public')));
  reset({ pages: { first: { items: ['hidden-count', 'hidden-country', 'boundary-low', 'boundary-high'] } }, channelData: {
    'hidden-count': channel('hidden-count', undefined), 'hidden-country': channel('hidden-country', 7000, null),
    'boundary-low': channel('boundary-low', 5000), 'boundary-high': channel('boundary-high', 100000),
  } });
  const included = await postSearch({ query: 'design', requestedCount: 5, minSubscribers: 5000, maxSubscribers: 100000, declaredCountries: ['US'], includeUnknown: true, includeUnknownSubscribers: true });
  assert.deepEqual(included.body.items.map(item => item.channelId), ['hidden-count', 'hidden-country', 'boundary-low', 'boundary-high']);
  assert.equal(included.body.items[0].subscribers, null);
});

test('deduplicates channel IDs across YouTube pages', async () => {
  reset({ pages: { first: { items: ['a', 'b', 'c'], nextPageToken: 'p2' }, p2: { items: ['a', 'd', 'e'] } }, channelData: Object.fromEntries(['a','b','c','d','e'].map(id => [id, channel(id, 10000)])) });
  const response = await postSearch({ query: 'tech', requestedCount: 5, pageSize: 50, includeUnknownSubscribers: false });
  assert.equal(response.body.items.length, 5);
  assert.equal(new Set(response.body.items.map(item => item.channelId)).size, 5);
  assert.deepEqual(scenario.detailBatches[1], ['d', 'e']);
});

test('returns complete when YouTube has no next page even below requested count', async () => {
  reset({ pages: { first: { items: ['a', 'b', 'c'] } }, channelData: { a: channel('a', 10000), b: channel('b', 20000), c: channel('c', 30000) } });
  const response = await postSearch({ query: 'music', requestedCount: 5, includeUnknownSubscribers: false });
  assert.equal(response.body.complete, true);
  assert.equal(response.body.hasMore, false);
  assert.equal(scenario.historyStatuses.at(-1), 'completed');
});

test('records quota exhaustion after partial pages as partial', async () => {
  reset({ quotaAfter: 1, pages: { first: { items: ['a', 'b', 'c'], nextPageToken: 'p2' } }, channelData: { a: channel('a', 10000), b: channel('b', 20000), c: channel('c', 30000) } });
  const response = await postSearch({ query: 'science', requestedCount: 5, includeUnknownSubscribers: false });
  assert.equal(response.status, 200);
  assert.equal(response.body.complete, false);
  assert.equal(response.body.isPartial, true);
  assert.equal(response.body.hasMore, true);
  assert.equal(scenario.historyStatuses.at(-1), 'partial');
});

test('records quota exhaustion before any candidate page as failed', async () => {
  reset({ quotaAfter: 0, pages: { first: { items: ['a'] } }, channelData: { a: channel('a', 10000) } });
  const response = await postSearch({ query: 'animals', requestedCount: 5 });
  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, 'DAILY_YOUTUBE_QUOTA_LIMIT');
  assert.equal(scenario.historyStatuses.at(-1), 'failed');
});

test('records metadata-method quota exhaustion as a failed search before returning unverified channels', async () => {
  reset({ quotaAfter: null, otherQuotaAfter: 0, pages: { first: { items: ['a'] } }, channelData: { a: channel('a', 10000) } });
  const response = await postSearch({ query: 'animals', requestedCount: 1 });
  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, 'DAILY_YOUTUBE_QUOTA_LIMIT');
  assert.equal(scenario.methodReservations['search.list'], 1);
  assert.equal(scenario.methodReservations['channels.list'], 1);
  assert.equal(scenario.historyStatuses.at(-1), 'failed');
});

test('applies a persistent per-user API-call cap to every paginated request', async () => {
  reset({ userApiLimit: 1, pages: { first: { items: ['a'] } }, channelData: { a: channel('a', 10000) } });
  const response = await postSearch({ query: 'daily cap', requestedCount: 1 });
  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, 'USER_DAILY_YOUTUBE_API_LIMIT');
  assert.equal(scenario.userApiCalls, 2);
  assert.equal(scenario.historyStatuses.at(-1), 'failed');
});

test('Load More continues with the same filters and the returned page token', async () => {
  reset({ quotaAfter: 1, pages: { first: { items: ['a', 'b', 'c'], nextPageToken: 'p2' }, p2: { items: ['d', 'e', 'f'] } }, channelData: Object.fromEntries(['a','b','c','d','e','f'].map((id, index) => [id, channel(id, 5000 + index, index === 4 ? 'CA' : 'US')])) });
  const filters = { query: 'design', requestedCount: 5, pageSize: 50, minSubscribers: 5000, maxSubscribers: 100000, declaredCountries: ['US'], includeUnknown: false, includeUnknownSubscribers: false, regionCode: 'IN' };
  const first = await postSearch(filters);
  assert.equal(first.body.isPartial, true);
  const continuedScenario = scenario;
  continuedScenario.quotaAfter = null;
  const more = await postSearch({ ...filters, requestedCount: 2, pageToken: first.body.nextPageToken, excludeChannelIds: first.body.inspectedChannelIds });
  assert.equal(more.body.complete, true);
  assert.deepEqual(more.body.items.map(item => item.channelId), ['d', 'f']);
  const followup = continuedScenario.queryRequests.filter(request => request.type === 'channel').at(-1);
  assert.equal(followup.pageToken, 'p2');
  assert.equal(followup.q, filters.query);
  assert.equal(followup.regionCode, filters.regionCode);
  assert.equal(followup.type, 'channel');
  assert.deepEqual(more.body.filtersApplied.declaredCountries, ['US']);
  assert.equal(more.body.filtersApplied.minSubscribers, filters.minSubscribers);
  assert.equal(more.body.filtersApplied.maxSubscribers, filters.maxSubscribers);
  assert.equal(more.body.filterSummary.includeUnknownCountry, false);
  assert.equal(continuedScenario.historyStatuses.at(-1), 'completed');
});

test('records a recoverable YouTube API error after an exact page as partial', async () => {
  reset({ failSearchToken: 'p2', pages: { first: { items: ['a', 'b', 'c'], nextPageToken: 'p2' } }, channelData: { a: channel('a', 10000), b: channel('b', 20000), c: channel('c', 30000) } });
  const response = await postSearch({ query: 'history', requestedCount: 5, includeUnknownSubscribers: false });
  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 3);
  assert.equal(response.body.isPartial, true);
  assert.equal(scenario.historyStatuses.at(-1), 'partial');
});

test('records a first-page YouTube failure as failed', async () => {
  reset({ failSearchToken: null, pages: {}, channelData: {} });
  scenario.pages.first = { items: [] };
  scenario.failSearchToken = null;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'www.googleapis.com') return jsonResponse({ error: { errors: [{ reason: 'backendError' }] } }, 500);
    return previousFetch(input, init);
  };
  try {
    const response = await postSearch({ query: 'failure', requestedCount: 5 });
    assert.equal(response.status, 502);
    assert.equal(scenario.historyStatuses.at(-1), 'failed');
  } finally { globalThis.fetch = previousFetch; }
});

test('rejects malformed YouTube search payloads and records the failed outcome', async () => {
  reset({ pages: {}, channelData: {} });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'www.googleapis.com') return jsonResponse({ items: 'not-an-array' });
    return previousFetch(input, init);
  };
  try {
    const response = await postSearch({ query: 'malformed response', requestedCount: 5 });
    assert.equal(response.status, 502);
    assert.equal(response.body.error.code, 'YOUTUBE_INVALID_RESPONSE');
    assert.equal(scenario.historyStatuses.at(-1), 'failed');
  } finally { globalThis.fetch = previousFetch; }
});
