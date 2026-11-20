import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.APP_URL = '';
process.env.TRUST_PROXY = 'false';
process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '33333333-3333-4333-8333-333333333333';
const prospectId = '22222222-2222-4222-8222-222222222222';
const originalFetch = globalThis.fetch;
let server;
let baseUrl;
let createAppServer;
let securityHeadersFor;
let getClientIp;
let revocationFail = false;
let rows = [];
let taskRows = [];
let upstreamCalls = [];

function response(data, status = 200, headers = {}) {
  return new Response(data == null ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  upstreamCalls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined });
  if (url.hostname !== 'supabase.test') throw new Error(`Unexpected fetch ${url}`);
  if (url.pathname === '/auth/v1/signup') return response({ id: userId });
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') return response({ access_token: 'issued-access', refresh_token: 'issued-refresh', expires_in: 3600, user: { id: userId } });
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') return response({ access_token: 'renewed-access', refresh_token: 'renewed-refresh', expires_in: 3600, user: { id: userId, email: 'member@example.com' } });
  if (url.pathname === '/auth/v1/user') return init.headers?.Authorization === 'Bearer expired' ? response({ message: 'expired' }, 401) : response({ id: userId, email: 'member@example.com' });
  if (url.pathname.startsWith('/auth/v1/logout')) return revocationFail ? response({ message: 'failed' }, 503) : response(null, 204);
  if (!url.pathname.startsWith('/rest/v1/')) throw new Error(`Unexpected Supabase route ${url.pathname}`);
  const table = url.pathname.replace('/rest/v1/', '');
  if (table === 'app_users') return response([{ id: userId, email: 'member@example.com', role: 'member', status: 'active', plan: 'free' }]);
  if (table === 'external_prospects') {
    const owner = url.searchParams.get('user_id')?.replace(/^eq\./, '');
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (init.method === 'POST') {
      const created = { id: prospectId, ...JSON.parse(init.body) };
      rows.push(created);
      return response([created], 201);
    }
    if (init.method === 'PATCH') {
      const row = rows.find(item => item.id === id && item.user_id === owner);
      if (!row) return response([]);
      Object.assign(row, JSON.parse(init.body));
      return response([row]);
    }
    if (init.method === 'DELETE') {
      rows = rows.filter(item => !(item.id === id && item.user_id === owner));
      return response(null, 204);
    }
    return response(rows.filter(item => !owner || item.user_id === owner));
  }
  if (table === 'discovery_searches') return response([{ id: 'history-1', user_id: userId, query: 'design', status: 'completed' }]);
  if (table === 'crm_tasks') {
    const owner = url.searchParams.get('user_id')?.replace(/^eq\./, '');
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (init.method === 'POST') {
      const created = { id: '55555555-5555-4555-8555-555555555555', ...JSON.parse(init.body) };
      taskRows.push(created);
      return response([created], 201);
    }
    if (init.method === 'PATCH') {
      const row = taskRows.find(item => item.id === id && item.user_id === owner);
      if (!row) return response([]);
      Object.assign(row, JSON.parse(init.body));
      return response([row]);
    }
    if (init.method === 'DELETE') {
      taskRows = taskRows.filter(item => !(item.id === id && item.user_id === owner));
      return response(null, 204);
    }
    return response(taskRows.filter(item => !owner || item.user_id === owner));
  }
  return response([]);
};

before(async () => {
  ({ createAppServer, securityHeadersFor, getClientIp } = await import('../server.mjs'));
  server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  globalThis.fetch = originalFetch;
});

function reset() { rows = []; taskRows = []; upstreamCalls = []; revocationFail = false; }

test('signup validates its inputs and login sets secure server-managed session cookies', async () => {
  reset();
  const weak = await originalFetch(`${baseUrl}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'short' }) });
  assert.equal(weak.status, 400);
  assert.equal((await weak.json()).error.code, 'WEAK_PASSWORD');
  const signup = await originalFetch(`${baseUrl}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'Test@Example.com', password: 'long-password-123' }) });
  assert.equal(signup.status, 202);
  assert.equal(upstreamCalls.find(call => call.url.pathname === '/auth/v1/signup').body.email, 'test@example.com');
  const login = await originalFetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'member@example.com', password: 'long-password-123' }) });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.id, userId);
  const cookies = login.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every(cookie => cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax')));
  assert.ok(cookies[0].includes('issued-access'));
});

test('refreshing an expired access token replaces the session cookies', async () => {
  reset();
  const response = await originalFetch(`${baseUrl}/api/auth/session`, { headers: { cookie: 'leadsense_at=expired; leadsense_rt=refresh-me' } });
  assert.equal(response.status, 200);
  assert.equal((await response.clone().json()).authenticated, true, await response.clone().text());
  const refresh = upstreamCalls.find(call => call.url.pathname === '/auth/v1/token' && call.url.searchParams.get('grant_type') === 'refresh_token');
  assert.deepEqual(refresh.body, { refresh_token: 'refresh-me' });
  assert.ok(response.headers.getSetCookie().some(cookie => cookie.includes('renewed-access')));
});

test('logout revokes only the access token session and clears both session cookies', async () => {
  reset();
  const response = await originalFetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie: 'leadsense_at=current-access; leadsense_rt=current-refresh' } });
  const logout = upstreamCalls.find(call => call.url.pathname === '/auth/v1/logout');
  assert.equal(response.status, 200);
  assert.equal(logout.url.searchParams.get('scope'), 'local');
  assert.equal(logout.headers.Authorization, 'Bearer current-access');
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every(cookie => cookie.includes('Max-Age=0')));
});

test('logout reports failed server revocation while still clearing browser cookies', async () => {
  reset();
  revocationFail = true;
  const response = await originalFetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie: 'leadsense_at=current-access; leadsense_rt=current-refresh' } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'SESSION_REVOCATION_FAILED');
  assert.equal(response.headers.getSetCookie().length, 2);
});

test('logout refreshes and revokes the current session when only the refresh cookie remains', async () => {
  reset();
  const response = await originalFetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie: 'leadsense_rt=refresh-me' } });
  assert.equal(response.status, 200);
  const refresh = upstreamCalls.find(call => call.url.pathname === '/auth/v1/token' && call.url.searchParams.get('grant_type') === 'refresh_token');
  const logout = upstreamCalls.find(call => call.url.pathname === '/auth/v1/logout');
  assert.deepEqual(refresh.body, { refresh_token: 'refresh-me' });
  assert.equal(logout.headers.Authorization, 'Bearer renewed-access');
  assert.equal(logout.url.searchParams.get('scope'), 'local');
});

test('HSTS is sent only for production HTTPS, including HTTPS behind the configured proxy', async () => {
  const req = { headers: { 'x-forwarded-proto': 'https' }, socket: {} };
  process.env.NODE_ENV = 'development';
  process.env.TRUST_PROXY = 'true';
  assert.equal(securityHeadersFor(req)['Strict-Transport-Security'], undefined);
  process.env.NODE_ENV = 'production';
  process.env.TRUST_PROXY = 'false';
  assert.equal(securityHeadersFor(req)['Strict-Transport-Security'], undefined);
  process.env.TRUST_PROXY = 'true';
  assert.match(securityHeadersFor(req)['Strict-Transport-Security'], /max-age/);
  process.env.TRUST_PROXY = 'false';
  process.env.APP_URL = 'https://leadsense.example';
  assert.match(securityHeadersFor({ headers: {}, socket: {} })['Strict-Transport-Security'], /max-age/);
  process.env.NODE_ENV = 'test';
  process.env.APP_URL = '';
});

test('forwarded IP is ignored unless a trusted proxy is explicitly configured', () => {
  const req = { headers: { 'x-forwarded-for': '198.51.100.20, 10.0.0.4' }, socket: { remoteAddress: '127.0.0.1' } };
  process.env.TRUST_PROXY = 'false';
  assert.equal(getClientIp(req), '127.0.0.1');
  process.env.TRUST_PROXY = 'true';
  assert.equal(getClientIp(req), '198.51.100.20');
  process.env.TRUST_PROXY = 'false';
});

test('prospect CRUD scopes every operation to the signed-in owner and ignores forged ownership', async () => {
  reset();
  const cookie = { cookie: 'leadsense_at=valid-access' };
  const createdResponse = await originalFetch(`${baseUrl}/api/prospects`, { method: 'POST', headers: { ...cookie, 'content-type': 'application/json' }, body: JSON.stringify({ business_name: 'Studio Alpha', user_id: otherUserId, notes: 'hello' }) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.user_id, userId);
  const list = await originalFetch(`${baseUrl}/api/prospects`, { headers: cookie });
  assert.equal((await list.json()).length, 1);
  const update = await originalFetch(`${baseUrl}/api/prospects/${prospectId}`, { method: 'PATCH', headers: { ...cookie, 'content-type': 'application/json' }, body: JSON.stringify({ notes: 'updated' }) });
  assert.equal(update.status, 200);
  const patchCall = upstreamCalls.find(call => call.url.pathname.endsWith('/external_prospects') && call.method === 'PATCH');
  assert.equal(patchCall.url.searchParams.get('user_id'), `eq.${userId}`);
  const deleteResponse = await originalFetch(`${baseUrl}/api/prospects/${prospectId}`, { method: 'DELETE', headers: cookie });
  assert.equal(deleteResponse.status, 200);
  const deleteCall = upstreamCalls.find(call => call.url.pathname.endsWith('/external_prospects') && call.method === 'DELETE');
  assert.equal(deleteCall.url.searchParams.get('user_id'), `eq.${userId}`);
});

test('cross-owner prospect update returns not found and leaves the other owner record unchanged', async () => {
  reset();
  rows = [{ id: prospectId, user_id: otherUserId, business_name: 'Private record', notes: '' }];
  const response = await originalFetch(`${baseUrl}/api/prospects/${prospectId}`, { method: 'PATCH', headers: { cookie: 'leadsense_at=valid-access', 'content-type': 'application/json' }, body: JSON.stringify({ notes: 'steal' }) });
  assert.equal(response.status, 404);
  assert.equal(rows[0].notes, '');
});

test('task create, update and delete are scoped to the signed-in user', async () => {
  reset();
  const cookie = { cookie: 'leadsense_at=valid-access', 'content-type': 'application/json' };
  const created = await originalFetch(`${baseUrl}/api/tasks`, { method: 'POST', headers: cookie, body: JSON.stringify({ title: 'Review creator website', user_id: otherUserId }) });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).user_id, userId);
  const id = '55555555-5555-4555-8555-555555555555';
  const changed = await originalFetch(`${baseUrl}/api/tasks/${id}`, { method: 'PATCH', headers: cookie, body: JSON.stringify({ done: true }) });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).done, true);
  const patch = upstreamCalls.find(call => call.url.pathname.endsWith('/crm_tasks') && call.method === 'PATCH');
  assert.equal(patch.url.searchParams.get('user_id'), `eq.${userId}`);
  const deleted = await originalFetch(`${baseUrl}/api/tasks/${id}`, { method: 'DELETE', headers: { cookie: cookie.cookie } });
  assert.equal(deleted.status, 200);
  const remove = upstreamCalls.find(call => call.url.pathname.endsWith('/crm_tasks') && call.method === 'DELETE');
  assert.equal(remove.url.searchParams.get('user_id'), `eq.${userId}`);
});

test('search history reads only the signed-in user records', async () => {
  reset();
  const response = await originalFetch(`${baseUrl}/api/searches`, { headers: { cookie: 'leadsense_at=valid-access' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].user_id, userId);
  const query = upstreamCalls.find(call => call.url.pathname.endsWith('/discovery_searches'));
  assert.equal(query.url.searchParams.get('user_id'), `eq.${userId}`);
});

test('workspace API rejects unauthenticated reads and writes', async () => {
  const read = await originalFetch(`${baseUrl}/api/prospects`);
  const write = await originalFetch(`${baseUrl}/api/prospects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ business_name: 'Unauthenticated' }) });
  assert.equal(read.status, 401);
  assert.equal(write.status, 401);
});
