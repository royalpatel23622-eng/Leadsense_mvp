import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';

let server;
let baseUrl;
test.before(async () => {
  server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test('health endpoint is available and sends security headers', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.database, 'string');
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('YouTube search requires an authenticated user', async () => {
  const response = await fetch(`${baseUrl}/api/youtube/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'gaming' }) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'AUTH_REQUIRED');
});

test('natural-language endpoint rejects malformed JSON with a safe client error', async () => {
  const response = await fetch(`${baseUrl}/api/search/interpret`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_JSON');
});

test('unknown static routes return a safe not-found response', async () => {
  const response = await fetch(`${baseUrl}/not-a-real-page`);
  assert.equal(response.status, 404);
  assert.equal(typeof (await response.json()).error.message, 'string');
});
