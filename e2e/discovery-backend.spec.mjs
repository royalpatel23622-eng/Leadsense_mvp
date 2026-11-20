import { test, expect } from '@playwright/test';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
process.env.YOUTUBE_API_KEY = 'mock-youtube-key';
process.env.YOUTUBE_MAX_CANDIDATE_PAGES = '1';

let server;
let baseUrl;
let appUserSearchCount = 0;
let appSearchCalls = 0;
let appOtherUnits = 0;
let appUserApiCalls = 0;
const appMethodCalls = {};
const ytSearchRequests = [];
const creatorRows = [];
const evidenceRows = [];
const contactRows = [];
const userId = '11111111-1111-4111-8111-111111111111';
const channelLabels = new Map();
const exactId = id => {
  const value = `UC${id.replace(/[^a-zA-Z0-9]/g, '').padEnd(22, 'x').slice(0, 22)}`;
  channelLabels.set(value, id);
  return value;
};
const originalFetch = globalThis.fetch;

function json(payload, status = 200) {
  return new Response(payload == null ? null : JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname === 'supabase.test' && url.pathname === '/auth/v1/user') return json({ id: userId, email: 'creator@example.com' });
  if (url.hostname === 'supabase.test' && url.pathname.startsWith('/rest/v1/')) {
    const table = url.pathname.replace('/rest/v1/', '');
    if (table === 'app_users') return json([{ id: userId, email: 'creator@example.com', role: 'member', status: 'active', plan: 'free', search_limit_override: null }]);
    if (table === 'rpc/take_user_search_slot') return json(++appUserSearchCount);
    if (table === 'rpc/take_user_youtube_api_slot') return json(++appUserApiCalls);
    if (table === 'rpc/take_youtube_api_slot') {
      const method = JSON.parse(init.body).p_method;
      appMethodCalls[method] = (appMethodCalls[method] || 0) + 1;
      if (method === 'search.list') appSearchCalls += 1;
      else appOtherUnits += 1;
      return json({ calls: appSearchCalls, method, otherUnits: appOtherUnits });
    }
    if (table === 'youtube_api_usage') return json([{ search_calls: appSearchCalls, other_units: appOtherUnits, channels_list_calls: appMethodCalls['channels.list'] || 0, videos_list_calls: 0, playlists_list_calls: 0, playlist_items_list_calls: 0 }]);
    if (table === 'discovery_searches' && init.method === 'POST') return json([{ id: '44444444-4444-4444-8444-444444444444' }], 201);
    if (table === 'discovery_searches' && init.method === 'PATCH') return json([]);
    if (table === 'creator_leads') {
      const query = url.searchParams;
      const matching = creatorRows.filter(row => (!query.has('user_id') || row.user_id === query.get('user_id').slice(3)) && (!query.has('channel_id') || row.channel_id === query.get('channel_id').slice(3)) && (!query.has('id') || row.id === query.get('id').slice(3)));
      if (init.method === 'POST') {
        const body = JSON.parse(init.body);
        const row = { ...body, id: '33333333-3333-4333-8333-333333333333', user_id: userId, expires_at: new Date(Date.now() + 29 * 86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        creatorRows.push(row);
        return json([row], 201);
      }
      if (init.method === 'PATCH') { const body = JSON.parse(init.body); matching.forEach(row => Object.assign(row, body)); return json(matching); }
      if (init.method === 'DELETE') { matching.forEach(row => creatorRows.splice(creatorRows.indexOf(row), 1)); return json([]); }
      return json(matching.map(row => ({ ...row, evidence: evidenceRows.filter(item => item.creator_lead_id === row.id), contacts: contactRows.filter(item => item.creator_lead_id === row.id) })));
    }
    if (table === 'creator_evidence' || table === 'creator_contacts') {
      const rows = table === 'creator_evidence' ? evidenceRows : contactRows;
      const query = url.searchParams;
      const matching = rows.filter(row => (!query.has('user_id') || row.user_id === query.get('user_id').slice(3)) && (!query.has('id') || row.id === query.get('id').slice(3)));
      if (init.method === 'POST') {
        const body = JSON.parse(init.body);
        const row = { ...body, id: table === 'creator_evidence' ? '44444444-4444-4444-8444-444444444444' : '55555555-5555-4555-8555-555555555555', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        rows.push(row);
        return json([row], 201);
      }
      if (init.method === 'PATCH') { const body = JSON.parse(init.body); matching.forEach(row => Object.assign(row, body)); return json(matching); }
      if (init.method === 'DELETE') { matching.forEach(row => rows.splice(rows.indexOf(row), 1)); return json([]); }
      return json(matching);
    }
    return json([]);
  }
  if (url.hostname === 'www.googleapis.com') {
    const resource = url.pathname.split('/').pop();
    if (resource === 'search') {
      ytSearchRequests.push(Object.fromEntries(url.searchParams.entries()));
      const continuation = url.searchParams.get('pageToken') === 'page-2';
      const ids = continuation ? ['exact-2', 'exact-3', 'exact-4', 'exact-5'] : ['exact-1', 'related-1'];
      return json({ nextPageToken: continuation ? undefined : 'page-2', items: ids.map(id => ({ id: { channelId: exactId(id) }, snippet: { channelId: exactId(id) } })) });
    }
    if (resource === 'channels') {
      const ids = (url.searchParams.get('id') || '').split(',').filter(Boolean);
      return json({ items: ids.map(id => {
        const related = id === exactId('related-1');
        return {
          id,
          snippet: { title: related ? 'Related Canada Creator' : `Exact ${channelLabels.get(id) || id.slice(2)}`, description: 'Gaming videos and creator tips', country: related ? 'CA' : 'US', customUrl: `@${channelLabels.get(id) || id.slice(2)}`, thumbnails: {} },
          statistics: { subscriberCount: related ? '12000' : '5000', videoCount: '18', viewCount: '40000' },
          topicDetails: { topicCategories: [] },
        };
      }) });
    }
  }
  throw new Error(`Unexpected server fetch ${url}`);
};

test.beforeAll(async () => {
  const { createAppServer } = await import('../server.mjs');
  server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  globalThis.fetch = originalFetch;
});

test('real browser search uses the app discovery route, preserves filters on continuation, and shows exact and related separately', async ({ page }) => {
  await page.context().addCookies([{ name: 'leadsense_at', value: 'active-test-session', url: baseUrl }]);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl);
  await page.locator('[data-view="discover"]').first().click();
  await page.locator('#creatorQuery').fill('gaming creators');
  await page.locator('#countryFilter').selectOption('US');
  await page.locator('#regionFilter').selectOption('IN');
  await page.locator('#minSubscriberFilter').fill('5000');
  await page.locator('#maxSubscriberFilter').fill('100000');
  await page.locator('#requestedCountFilter').selectOption('5');
  await page.locator('#searchBtn').click();

  await expect(page.locator('#creatorGrid')).toContainText('Exact exact-1');
  await expect(page.locator('#creatorGrid')).not.toContainText('Related Canada Creator');
  await expect(page.locator('#relatedCreatorGrid')).toContainText('Related Canada Creator');
  await expect(page.locator('#searchProgress')).toContainText('Partial search');
  await page.locator('[data-action="loadMore"]').click();
  for (const id of ['exact-2', 'exact-3', 'exact-4', 'exact-5']) await expect(page.locator('#creatorGrid')).toContainText(`Exact ${id}`);

  expect(ytSearchRequests).toHaveLength(2);
  expect(ytSearchRequests[0]).toMatchObject({ q: 'gaming creators', regionCode: 'IN', maxResults: '50' });
  expect(ytSearchRequests[1]).toMatchObject({ pageToken: 'page-2', q: 'gaming creators', regionCode: 'IN', maxResults: '50' });
  expect(ytSearchRequests[1].channelId).toBeUndefined();
  expect(appUserSearchCount).toBe(2);
  expect(appSearchCalls).toBe(2);
  expect(appMethodCalls['channels.list']).toBe(2);
  expect(errors).toEqual([]);
});

test('creator profile saves to the private workspace and supports evidence and contact review on mobile', async ({ page }) => {
  appUserSearchCount = 0;
  appSearchCalls = 0;
  appOtherUnits = 0;
  appUserApiCalls = 0;
  for (const rows of [creatorRows, evidenceRows, contactRows, ytSearchRequests]) rows.length = 0;
  await page.context().addCookies([{ name: 'leadsense_at', value: 'active-test-session', url: baseUrl }]);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(baseUrl);
  await page.locator('#creatorQuery').fill('design tools');
  await page.locator('#countryFilter').selectOption('all');
  await page.locator('#searchBtn').click();
  await expect(page.locator('#creatorGrid .lead-result').first()).toBeVisible();
  await page.locator('#creatorGrid [data-action="saveCreator"]').first().click();
  await expect(page.locator('#creatorWorkspaceGrid')).toContainText('Exact exact-1');
  await page.locator('#creatorWorkspaceGrid [data-action="addCreatorEvidence"]').click();
  await page.locator('#modalForm [name="service_category"]').fill('Video editing');
  await page.locator('#modalForm [name="source_url"]').fill('https://creator.example/hiring');
  await page.locator('#modalForm [name="excerpt"]').fill('I am looking for a video editor for my weekly uploads.');
  await page.locator('#modalForm button.primary-btn').click();
  await expect.poll(() => evidenceRows.length).toBe(1);
  await expect(page.locator('#creatorWorkspaceGrid')).toContainText('I am looking for a video editor');
  await expect(page.locator('#creatorWorkspaceGrid')).toContainText('No verified need evidence');
  await page.locator('#creatorWorkspaceGrid details summary').first().click();
  await page.locator('#creatorWorkspaceGrid [data-action="verifyCreatorEvidence"]').click();
  await expect(page.locator('#creatorWorkspaceGrid')).toContainText('Explicit public request');
  await page.locator('#creatorWorkspaceGrid [data-action="addCreatorContact"]').click();
  await page.locator('#modalForm [name="contact_value"]').fill('business@creator.example');
  await page.locator('#modalForm [name="source_url"]').fill('https://creator.example/contact');
  await page.locator('#modalForm button.primary-btn').click();
  await expect(page.locator('#creatorWorkspaceGrid')).toContainText('business@creator.example');
  await page.setViewportSize({ width: 390, height: 844 });
  const workspace = await page.locator('#creatorWorkspaceGrid').boundingBox();
  expect(workspace.width).toBeLessThanOrEqual(390);
  expect(pageErrors).toEqual([]);
});
