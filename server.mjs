import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(ROOT, 'outputs');

// Load a local .env without a third-party package. Render uses its Environment tab.
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const raw of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY || '';
const SEARCH_LIMIT = Math.max(1, Math.min(1000, Number(process.env.YOUTUBE_DAILY_SEARCH_LIMIT || 40)));
const RATE_LIMIT = Math.max(10, Math.min(1000, Number(process.env.API_RATE_LIMIT_PER_MINUTE || 60)));
const LIMIT_WINDOW_MS = 60_000;
const ipBuckets = new Map();
let localSearchDate = '';
let localSearchCalls = 0;

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function send(res, status, body, extra = {}) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': bytes.length, ...extra });
  res.end(bytes);
}

function safeError(res, status, code, message) {
  send(res, status, { error: { code, message } });
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}

function withinRateLimit(req, res) {
  const now = Date.now();
  const ip = getClientIp(req);
  const bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= LIMIT_WINDOW_MS) {
    ipBuckets.set(ip, { startedAt: now, count: 1 });
    if (ipBuckets.size > 5000) {
      for (const [key, value] of ipBuckets) if (now - value.startedAt > LIMIT_WINDOW_MS * 2) ipBuckets.delete(key);
    }
    return true;
  }
  bucket.count += 1;
  if (bucket.count <= RATE_LIMIT) return true;
  res.setHeader('Retry-After', '60');
  safeError(res, 429, 'RATE_LIMITED', 'Too many requests. Wait a minute and try again.');
  return false;
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    return new URL(origin).origin === expected;
  } catch { return false; }
}

async function readJson(req, maxBytes = 64_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request is too large.'), { status: 413, code: 'BODY_TOO_LARGE' });
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Please send valid JSON.'), { status: 400, code: 'INVALID_JSON' }); }
}

function requireText(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw Object.assign(new Error(`${label} is required and must be under ${max} characters.`), { status: 400, code: 'INVALID_INPUT' });
  }
  return value.trim();
}

function optionalText(value, max = 2000) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw Object.assign(new Error('One of the text fields is too long.'), { status: 400, code: 'INVALID_INPUT' });
  return value.trim();
}

function validWebsite(value) {
  const text = optionalText(value, 500);
  if (!text) return null;
  let url;
  try { url = new URL(text); } catch { throw Object.assign(new Error('Enter a full website address, such as https://example.com.'), { status: 400, code: 'INVALID_URL' }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Object.assign(new Error('Use a public http or https website address.'), { status: 400, code: 'INVALID_URL' });
  return url.toString();
}

function databaseConfigured() { return Boolean(SUPABASE_URL && SUPABASE_KEY); }

async function dbRequest(tableOrRpc, { method = 'GET', query = '', body, prefer } = {}) {
  if (!databaseConfigured()) throw Object.assign(new Error('Add SUPABASE_URL and SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) to connect the database.'), { status: 503, code: 'DATABASE_NOT_CONFIGURED' });
  const url = `${SUPABASE_URL}/rest/v1/${tableOrRpc}${query ? `?${query}` : ''}`;
  const headers = { apikey: SUPABASE_KEY, Accept: 'application/json' };
  // New sb_secret keys belong in apikey; legacy JWT service_role keys also work as a bearer token.
  if (!SUPABASE_KEY.startsWith('sb_secret_')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!response.ok) {
    const detail = typeof data?.message === 'string' ? data.message : '';
    const err = new Error(detail || `Database request failed (${response.status}).`);
    err.code = detail.includes('DAILY_SEARCH_LIMIT') ? 'DAILY_SEARCH_LIMIT' : 'DATABASE_ERROR';
    err.status = err.code === 'DAILY_SEARCH_LIMIT' ? 429 : response.status >= 500 ? 503 : 400;
    throw err;
  }
  return data;
}

async function currentUsage() {
  if (!databaseConfigured()) return { calls: 0, limit: SEARCH_LIMIT, source: 'unavailable' };
  const date = new Date().toISOString().slice(0, 10);
  const rows = await dbRequest('youtube_api_usage', { query: new URLSearchParams({ select: 'search_calls', usage_date: `eq.${date}`, limit: '1' }).toString() });
  return { calls: Number(rows?.[0]?.search_calls || 0), limit: SEARCH_LIMIT, source: 'this app only' };
}

async function reserveSearchCall() {
  if (databaseConfigured()) {
    const count = await dbRequest('rpc/take_youtube_search_slot', { method: 'POST', body: { p_daily_limit: SEARCH_LIMIT } });
    return Number(count);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (today !== localSearchDate) { localSearchDate = today; localSearchCalls = 0; }
  if (localSearchCalls >= SEARCH_LIMIT) throw Object.assign(new Error('This app has reached its daily search limit. Try again tomorrow.'), { status: 429, code: 'DAILY_SEARCH_LIMIT' });
  localSearchCalls += 1;
  return localSearchCalls;
}

function parseGoogleError(status, payload) {
  const reason = payload?.error?.errors?.[0]?.reason || '';
  if (status === 403 && /quota|dailyLimit|rateLimit/i.test(reason)) return Object.assign(new Error('YouTube search quota is used up for now. Try again later or check your Google Cloud quota.'), { status: 429, code: 'YOUTUBE_QUOTA' });
  if (status === 403) return Object.assign(new Error('YouTube did not accept the API key. Check that YouTube Data API v3 is enabled for the key.'), { status: 503, code: 'YOUTUBE_SETUP' });
  if (status === 400) return Object.assign(new Error('YouTube could not use those search settings. Change the search and try again.'), { status: 400, code: 'YOUTUBE_BAD_REQUEST' });
  return Object.assign(new Error('YouTube is temporarily unavailable. Try again shortly.'), { status: 502, code: 'YOUTUBE_UNAVAILABLE' });
}

async function googleGet(resource, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw parseGoogleError(response.status, payload);
  return payload;
}

async function youtubeSearch(body) {
  if (!YOUTUBE_KEY) throw Object.assign(new Error('Live YouTube search is not set up yet. Add YOUTUBE_API_KEY on the server, then restart the app.'), { status: 503, code: 'YOUTUBE_NOT_CONFIGURED' });
  const query = requireText(body.query, 'Search phrase', 120);
  const maxResults = Math.max(1, Math.min(50, Number(body.maxResults) || 20));
  const regionCode = optionalText(body.regionCode, 2)?.toUpperCase();
  if (regionCode && !/^[A-Z]{2}$/.test(regionCode)) throw Object.assign(new Error('Choose a valid two-letter country code.'), { status: 400, code: 'INVALID_REGION' });
  const relevanceLanguage = optionalText(body.language, 2)?.toLowerCase();
  if (relevanceLanguage && !/^[a-z]{2}$/.test(relevanceLanguage)) throw Object.assign(new Error('Choose a valid two-letter language code.'), { status: 400, code: 'INVALID_LANGUAGE' });

  const usage = await reserveSearchCall();
  const search = await googleGet('search', {
    key: YOUTUBE_KEY, part: 'snippet', type: 'channel', q: query, maxResults,
    regionCode, relevanceLanguage, pageToken: optionalText(body.pageToken, 300),
    fields: 'nextPageToken,items(id(channelId),snippet(title,description,channelId))',
  });
  const ids = [...new Set((search.items || []).map(item => item.id?.channelId || item.snippet?.channelId).filter(Boolean))];
  if (ids.length === 0) return { items: [], nextPageToken: search.nextPageToken || null, usage: { calls: usage, limit: SEARCH_LIMIT, source: 'this app only' } };

  const details = await googleGet('channels', {
    key: YOUTUBE_KEY, part: 'snippet,statistics', id: ids.join(','),
    fields: 'items(id,snippet(title,description,customUrl,country,publishedAt,thumbnails(default,medium,high)),statistics(subscriberCount,viewCount,videoCount))',
  });
  const detailsById = new Map((details.items || []).map(channel => [channel.id, channel]));
  const items = ids.map(id => detailsById.get(id)).filter(Boolean).map(channel => ({
    channelId: channel.id,
    name: channel.snippet?.title || 'Untitled channel',
    description: channel.snippet?.description || '',
    customUrl: channel.snippet?.customUrl || null,
    countryCode: channel.snippet?.country || null,
    publishedAt: channel.snippet?.publishedAt || null,
    thumbnail: channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || null,
    subscribers: channel.statistics?.subscriberCount ?? null,
    totalViews: channel.statistics?.viewCount ?? null,
    videoCount: channel.statistics?.videoCount ?? null,
    channelUrl: `https://www.youtube.com/channel/${encodeURIComponent(channel.id)}`,
    fetchedAt: new Date().toISOString(),
    source: 'YouTube Data API',
  }));
  const declaredCountries = Array.isArray(body.declaredCountries) ? body.declaredCountries.filter(x => typeof x === 'string' && /^[A-Z]{2}$/.test(x)).slice(0, 20) : [];
  const includeUnknown = body.includeUnknown !== false;
  const excludeIndia = body.excludeIndia !== false;
  const filtered = items.filter(item => {
    if (excludeIndia && item.countryCode === 'IN') return false;
    if (declaredCountries.length && item.countryCode && !declaredCountries.includes(item.countryCode)) return false;
    if (declaredCountries.length && !item.countryCode && !includeUnknown) return false;
    return true;
  });
  return { items: filtered, nextPageToken: search.nextPageToken || null, usage: { calls: usage, limit: SEARCH_LIMIT, source: 'this app only' } };
}

function scoreEvidence(evidence) {
  const weights = { service_relevance: 25, verified_gaps: 25, buying_intent: 20, operational_readiness: 15, contact_route: 10, freshness: 5 };
  const groups = Object.fromEntries(Object.keys(weights).map(key => [key, []]));
  for (const item of evidence) if (item.verified && groups[item.dimension]) groups[item.dimension].push(item);
  let observedWeight = 0;
  let earnedPoints = 0;
  const breakdown = {};
  for (const [dimension, weight] of Object.entries(weights)) {
    if (!groups[dimension].length) { breakdown[dimension] = null; continue; }
    const strength = groups[dimension].reduce((sum, item) => sum + Number(item.strength), 0) / groups[dimension].length;
    observedWeight += weight;
    const points = Math.round(strength * weight * 10) / 10;
    earnedPoints += points;
    breakdown[dimension] = { points, weight };
  }
  const coverage = Math.round(observedWeight);
  if (coverage < 60) return { status: 'insufficient_evidence', score: null, coverage, confidence: 'low', breakdown };
  const score = Math.round((earnedPoints / observedWeight) * 100);
  const verified = evidence.filter(item => item.verified);
  const confidence = coverage >= 80 && verified.length >= 4 && verified.every(item => item.confidence === 'high') ? 'high' : coverage >= 60 ? 'medium' : 'low';
  return { status: 'scored', score, coverage, confidence, breakdown };
}

function prospectInput(body, partial = false) {
  const out = {};
  if (!partial || body.business_name !== undefined) out.business_name = requireText(body.business_name, 'Business name', 160);
  for (const [input, column, max] of [['category','category',100],['target_service','target_service',100],['target_market','target_market',100],['notes','notes',5000],['next_action','next_action',300],['stage','stage',40]]) {
    if (body[input] !== undefined) out[column] = optionalText(body[input], max) ?? (input === 'notes' ? '' : null);
    else if (!partial && input === 'notes') out.notes = '';
  }
  if (body.website !== undefined) out.website = validWebsite(body.website);
  else if (!partial) out.website = null;
  return out;
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method || 'GET';
  if (!withinRateLimit(req, res)) return;
  if (['POST','PATCH','DELETE'].includes(method) && !isSameOrigin(req)) return safeError(res, 403, 'ORIGIN_CHECK_FAILED', 'This request did not come from this app. Refresh the page and try again.');

  if (pathname === '/api/health' && method === 'GET') {
    let database = databaseConfigured() ? 'configured' : 'not_configured';
    let usage = null;
    if (databaseConfigured()) {
      try { usage = await currentUsage(); database = 'connected'; }
      catch { database = 'unavailable'; }
    }
    return send(res, 200, { ok: true, database, youtube: YOUTUBE_KEY ? 'configured' : 'not_configured', searchUsage: usage, noLogin: true });
  }

  if (pathname === '/api/youtube/search' && method === 'POST') {
    const body = await readJson(req);
    const result = await youtubeSearch(body);
    return send(res, 200, result);
  }

  if (pathname === '/api/prospects' && method === 'GET') {
    const rows = await dbRequest('external_prospects', { query: new URLSearchParams({ select: '*', order: 'updated_at.desc', limit: '250' }).toString() });
    return send(res, 200, rows);
  }
  if (pathname === '/api/prospects' && method === 'POST') {
    const body = await readJson(req);
    const row = prospectInput(body);
    const rows = await dbRequest('external_prospects', { method: 'POST', body: row, prefer: 'return=representation' });
    return send(res, 201, rows?.[0] || null);
  }
  const prospectMatch = pathname.match(/^\/api\/prospects\/([0-9a-f-]{36})$/i);
  if (prospectMatch && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(prospectMatch[1])) return safeError(res, 400, 'INVALID_ID', 'That record id is not valid.');
  if (prospectMatch && method === 'PATCH') {
    const body = await readJson(req);
    const changes = prospectInput(body, true);
    changes.updated_at = new Date().toISOString();
    const query = new URLSearchParams({ id: `eq.${prospectMatch[1]}`, select: '*' }).toString();
    const rows = await dbRequest('external_prospects', { method: 'PATCH', query, body: changes, prefer: 'return=representation' });
    return rows?.length ? send(res, 200, rows[0]) : safeError(res, 404, 'NOT_FOUND', 'This prospect could not be found.');
  }
  if (prospectMatch && method === 'DELETE') {
    await dbRequest('external_prospects', { method: 'DELETE', query: new URLSearchParams({ id: `eq.${prospectMatch[1]}` }).toString() });
    return send(res, 200, { deleted: true });
  }

  if (pathname === '/api/tasks' && method === 'GET') {
    const rows = await dbRequest('crm_tasks', { query: new URLSearchParams({ select: '*,external_prospects(business_name)', order: 'due_at.asc.nullslast,created_at.desc', limit: '500' }).toString() });
    return send(res, 200, rows);
  }
  if (pathname === '/api/tasks' && method === 'POST') {
    const body = await readJson(req);
    const title = requireText(body.title, 'Reminder', 240);
    const row = { title, prospect_id: optionalText(body.prospect_id, 36), due_at: optionalText(body.due_at, 10), done: false };
    if (row.prospect_id && !/^[0-9a-f-]{36}$/i.test(row.prospect_id)) throw Object.assign(new Error('Choose a valid business.'), { status: 400, code: 'INVALID_ID' });
    const rows = await dbRequest('crm_tasks', { method: 'POST', body: row, prefer: 'return=representation' });
    return send(res, 201, rows?.[0] || null);
  }
  const taskMatch = pathname.match(/^\/api\/tasks\/([0-9a-f-]{36})$/i);
  if (taskMatch && method === 'PATCH') {
    const body = await readJson(req);
    const changes = {};
    if (body.title !== undefined) changes.title = requireText(body.title, 'Reminder', 240);
    if (body.done !== undefined) changes.done = Boolean(body.done);
    if (body.due_at !== undefined) changes.due_at = optionalText(body.due_at, 10);
    changes.updated_at = new Date().toISOString();
    const rows = await dbRequest('crm_tasks', { method: 'PATCH', query: new URLSearchParams({ id: `eq.${taskMatch[1]}`, select: '*' }).toString(), body: changes, prefer: 'return=representation' });
    return rows?.length ? send(res, 200, rows[0]) : safeError(res, 404, 'NOT_FOUND', 'This reminder could not be found.');
  }
  if (taskMatch && method === 'DELETE') {
    await dbRequest('crm_tasks', { method: 'DELETE', query: new URLSearchParams({ id: `eq.${taskMatch[1]}` }).toString() });
    return send(res, 200, { deleted: true });
  }

  if (pathname === '/api/search-presets' && method === 'GET') {
    const rows = await dbRequest('youtube_search_presets', { query: new URLSearchParams({ select: '*', order: 'created_at.desc', limit: '100' }).toString() });
    return send(res, 200, rows);
  }
  if (pathname === '/api/search-presets' && method === 'POST') {
    const body = await readJson(req);
    const row = {
      name: requireText(body.name, 'Search name', 120),
      query: requireText(body.query, 'Search phrase', 200),
      region_code: optionalText(body.region_code, 2)?.toUpperCase() || 'US',
      declared_country_code: optionalText(body.declared_country_code, 2)?.toUpperCase() || null,
      country_unknown_only: body.country_unknown_only === true,
      topic: optionalText(body.topic, 100),
      include_unknown: body.include_unknown !== false,
      exclude_declared_india: body.exclude_declared_india !== false,
    };
    if (!/^[A-Z]{2}$/.test(row.region_code) || (row.declared_country_code && !/^[A-Z]{2}$/.test(row.declared_country_code))) throw Object.assign(new Error('Choose a valid country.'), { status: 400, code: 'INVALID_REGION' });
    const rows = await dbRequest('youtube_search_presets', { method: 'POST', body: row, prefer: 'return=representation' });
    return send(res, 201, rows?.[0] || null);
  }
  const presetMatch = pathname.match(/^\/api\/search-presets\/([0-9a-f-]{36})$/i);
  if (presetMatch && method === 'DELETE') {
    await dbRequest('youtube_search_presets', { method: 'DELETE', query: new URLSearchParams({ id: `eq.${presetMatch[1]}` }).toString() });
    return send(res, 200, { deleted: true });
  }

  return safeError(res, 404, 'NOT_FOUND', 'This API route does not exist.');
}

async function handle(req, res) {
  const host = req.headers.host || 'localhost';
  let url;
  try { url = new URL(req.url || '/', `http://${host}`); }
  catch { return safeError(res, 400, 'BAD_URL', 'That request URL is not valid.'); }
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return safeError(res, 405, 'METHOD_NOT_ALLOWED', 'This page only accepts GET requests.');
    const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (requested.includes('..') || requested.includes('\\') || requested.includes('/')) return safeError(res, 404, 'NOT_FOUND', 'This file was not found.');
    const filePath = path.join(WEB_ROOT, requested);
    let bytes;
    try { bytes = await readFile(filePath); }
    catch { return safeError(res, 404, 'NOT_FOUND', 'This page was not found.'); }
    const type = requested.endsWith('.html') ? 'text/html; charset=utf-8' : requested.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { ...securityHeaders, 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': bytes.length });
    if (req.method === 'HEAD') return res.end();
    return res.end(bytes);
  } catch (error) {
    const status = Number(error?.status) || 500;
    const code = error?.code || 'SERVER_ERROR';
    const message = status >= 500 && code === 'DATABASE_ERROR' ? 'The database is not responding. Check the Supabase setup and try again.' : (error?.message || 'Something went wrong. Try again.');
    if (status >= 500) console.error(`[api] ${code}: ${message}`);
    if (!res.headersSent) return safeError(res, status, code, message);
    return res.end();
  }
}

const server = http.createServer(handle);
server.headersTimeout = 15_000;
server.requestTimeout = 20_000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`LeadSense listening on port ${PORT}. Database: ${databaseConfigured() ? 'configured' : 'not configured'}. YouTube: ${YOUTUBE_KEY ? 'configured' : 'not configured'}.`);
});
