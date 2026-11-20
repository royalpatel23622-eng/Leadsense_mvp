import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.YOUTUBE_API_KEY = 'test-youtube-key';
process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const userId = '11111111-1111-4111-8111-111111111111';
const channelId = 'UC1234567890123456789012';
const originalFetch = globalThis.fetch;
let server;
let baseUrl;
const requested = [];
let userApiCalls = 0;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

globalThis.fetch = async input => {
  const url = new URL(String(input));
  if (url.hostname === 'supabase.test' && url.pathname === '/auth/v1/user') return jsonResponse({ id: userId, email: 'test@example.com' });
  if (url.hostname === 'supabase.test' && url.pathname.startsWith('/rest/v1/')) {
    const table = url.pathname.replace('/rest/v1/', '');
    if (table === 'app_users') return jsonResponse([{ id: userId, email: 'test@example.com', role: 'member', status: 'active', plan: 'free', search_limit_override: null }]);
    if (table === 'rpc/take_user_analysis_slot') return jsonResponse(1);
    if (table === 'rpc/take_user_youtube_api_slot') return jsonResponse(++userApiCalls);
    if (table === 'rpc/take_youtube_api_slot') return jsonResponse({ calls: 1, otherUnits: 1 });
    return jsonResponse([]);
  }
  if (url.hostname === 'www.googleapis.com') {
    requested.push(url);
    switch (url.pathname.split('/').pop()) {
      case 'channels': return jsonResponse({ items: [{
        id: channelId,
        snippet: { title: 'Sample creator', description: 'Creator description', country: 'US', publishedAt: '2018-01-01T00:00:00Z', thumbnails: { medium: { url: 'https://img.test/channel.jpg' } } },
        statistics: { subscriberCount: '5400', viewCount: '12000', videoCount: '85' },
        contentDetails: { relatedPlaylists: { uploads: 'uploads-1' } },
        topicDetails: { topicCategories: ['https://en.wikipedia.org/wiki/Technology'] },
      }] });
      case 'playlists': return jsonResponse({ items: [{ id: 'playlist-1', snippet: { title: 'Public videos', description: '', publishedAt: '2020-01-01T00:00:00Z' }, contentDetails: { itemCount: 4 }, status: { privacyStatus: 'public' } }] });
      case 'playlistItems': return jsonResponse({ items: [{ contentDetails: { videoId: 'video-1' } }, { contentDetails: { videoId: 'video-2' } }] });
      case 'videos': return jsonResponse({ items: [
        { id: 'video-1', snippet: { title: 'First upload', description: 'Video description', publishedAt: '2025-01-01T00:00:00Z', categoryId: '28', thumbnails: { medium: { url: 'https://img.test/video.jpg' } } }, statistics: { viewCount: '340', likeCount: '10' }, contentDetails: { duration: 'PT4M' } },
        { id: 'video-2', snippet: { title: 'Second upload', publishedAt: '2025-01-02T00:00:00Z' }, statistics: {}, contentDetails: { duration: 'PT2M' } },
      ] });
      default: throw new Error(`Unexpected YouTube request: ${url}`);
    }
  }
  throw new Error(`Unexpected mocked fetch: ${url}`);
};

before(async () => {
  const { createAppServer } = await import('../server.mjs');
  server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  globalThis.fetch = originalFetch;
});

test('creator inspection maps official fields, preserves unavailable values, and labels sample provenance', async () => {
  const response = await new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}/api/youtube/inspect`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'leadsense_at=valid-token; leadsense_rt=refresh-token' } }, result => {
      const chunks = [];
      result.on('data', chunk => chunks.push(chunk));
      result.on('end', () => resolve({ status: result.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ channelId }));
  });

  assert.equal(response.status, 200);
  const data = response.body;
  assert.equal(data.channel.channelId, channelId);
  assert.equal(data.channel.publishedAt, '2018-01-01T00:00:00Z');
  assert.equal(data.channel.provenance.publishedAt.label, 'Channel creation date');
  assert.equal(data.channel.provenance.subscribers.sourceCategory, 'official_source');
  assert.equal(data.channel.provenance.subscribers.method, 'channels.list');
  assert.equal(data.channel.provenance.subscribers.verificationStatus, 'retrieved_from_official_api');
  assert.ok(data.channel.provenance.subscribers.retrievedAt);
  assert.equal(data.channel.provenance.customUrl.verificationStatus, 'not_publicly_available');
  assert.equal(data.inspectedVideoCount, 2);
  assert.equal(data.userApiUsage.calls, 4);
  assert.equal(data.sampleLimit, 10);
  assert.equal(data.videos[0].categoryId, '28');
  assert.equal(data.videos[0].provenance.categoryId.method, 'videos.list');
  assert.equal(data.videos[0].provenance.publishedAt.label, 'Video publication date');
  assert.equal(data.videos[1].likes, null);
  assert.equal(data.videos[1].provenance.likes.verificationStatus, 'not_publicly_available');
  assert.equal(data.playlists.length, 1);
  assert.equal(data.playlists[0].provenance.itemCount.sourceId, 'playlists.list:playlist-1');
  const videosRequest = requested.find(url => url.pathname.endsWith('/videos'));
  assert.match(videosRequest.searchParams.get('fields'), /categoryId/);
});
