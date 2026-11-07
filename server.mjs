import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { interpretSearchQuery } from './lib/search-query.mjs';
import { dedupeChannelsById, filterByDeclaredCountry, filterByPublicSubscribers, normalizeSubscriberRange } from './lib/search-filters.mjs';

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
const SUPABASE_AUTH_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_KEY;
const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY || '';
const SEARCH_LIMIT = Math.max(1, Math.min(1000, Number(process.env.YOUTUBE_DAILY_SEARCH_LIMIT || 40)));
const USER_DAILY_SEARCH_LIMIT = Math.max(1, Math.min(1000, Number(process.env.USER_DAILY_SEARCH_LIMIT || 10)));
const USER_DAILY_ANALYSIS_LIMIT = Math.max(1, Math.min(1000, Number(process.env.USER_DAILY_ANALYSIS_LIMIT || 20)));
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
    err.code = detail.includes('DAILY_SEARCH_LIMIT') ? 'DAILY_SEARCH_LIMIT' : detail.includes('USER_DAILY_SEARCH_LIMIT') ? 'USER_DAILY_SEARCH_LIMIT' : detail.includes('USER_DAILY_ANALYSIS_LIMIT') ? 'USER_DAILY_ANALYSIS_LIMIT' : 'DATABASE_ERROR';
    err.status = ['DAILY_SEARCH_LIMIT','USER_DAILY_SEARCH_LIMIT','USER_DAILY_ANALYSIS_LIMIT'].includes(err.code) ? 429 : response.status >= 500 ? 503 : 400;
    throw err;
  }
  return data;
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const split = cookie.trim().indexOf('=');
    if (split < 0 || cookie.slice(0, split).trim() !== name) continue;
    try { return decodeURIComponent(cookie.slice(split + 1)); } catch { return null; }
  }
  return null;
}

function sessionCookies(tokens, clear = false) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const attributes = `; HttpOnly; SameSite=Lax; Path=/${secure}`;
  if (clear) return [`leadsense_at=; Max-Age=0${attributes}`, `leadsense_rt=; Max-Age=0${attributes}`];
  const accessAge = Math.max(60, Math.min(86_400, Number(tokens.expires_in) || 3600));
  return [
    `leadsense_at=${encodeURIComponent(tokens.access_token)}; Max-Age=${accessAge}${attributes}`,
    `leadsense_rt=${encodeURIComponent(tokens.refresh_token)}; Max-Age=2592000${attributes}`,
  ];
}

async function supabaseAuth(pathname, { method = 'GET', body, accessToken } = {}) {
  if (!SUPABASE_URL || !SUPABASE_AUTH_KEY) throw Object.assign(new Error('Sign-in is not configured. Add your Supabase project URL and API key to the server settings.'), { status: 503, code: 'AUTH_NOT_CONFIGURED' });
  const headers = { apikey: SUPABASE_AUTH_KEY, Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${SUPABASE_URL}/auth/v1${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 400 || response.status === 422 ? (data?.msg || data?.message || data?.error_description || 'Check your email and password, then try again.') : 'Supabase sign-in is temporarily unavailable.';
    throw Object.assign(new Error(message), { status: response.status >= 500 ? 503 : response.status, code: response.status === 400 ? 'AUTH_INVALID_CREDENTIALS' : 'AUTH_PROVIDER_ERROR' });
  }
  return data;
}

async function currentUser(req, res) {
  let accessToken = cookieValue(req, 'leadsense_at');
  if (!accessToken) return null;
  let authUser;
  try { authUser = await supabaseAuth('/user', { accessToken }); }
  catch (error) {
    const refreshToken = cookieValue(req, 'leadsense_rt');
    if (!refreshToken || error.status !== 401) return null;
    const tokens = await supabaseAuth('/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } });
    res.setHeader('Set-Cookie', sessionCookies(tokens));
    accessToken = tokens.access_token;
    authUser = tokens.user;
  }
  const rows = await dbRequest('app_users', { query: new URLSearchParams({ select: 'id,email,role,status,plan,search_limit_override,created_at', id: `eq.${authUser.id}`, limit: '1' }).toString() });
  const profile = rows?.[0];
  if (!profile || profile.status !== 'active') return null;
  return { id: profile.id, email: profile.email || authUser.email || '', role: profile.role, plan: profile.plan, search_limit_override: profile.search_limit_override, created_at: profile.created_at };
}

async function adminAudit(adminId, action, targetId = null, details = {}) {
  await dbRequest('admin_audit_logs', { method: 'POST', body: { admin_user_id: adminId, action, target_user_id: targetId, details }, prefer: 'return=minimal' });
}

async function requireAdmin(req, res) {
  const user = await currentUser(req, res);
  if (!user) { safeError(res, 401, 'AUTH_REQUIRED', 'Sign in with an active account to continue.'); return null; }
  if (user.role !== 'admin') { safeError(res, 403, 'ADMIN_REQUIRED', 'This area is only available to an administrator.'); return null; }
  return user;
}

async function dbCount(table, filter = '') {
  const headers = { apikey: SUPABASE_KEY, Prefer: 'count=exact', Range: '0-0' };
  if (!SUPABASE_KEY.startsWith('sb_secret_')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter ? `${filter}&` : ''}select=id`, { method: 'HEAD', headers, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw Object.assign(new Error(`Could not read ${table} totals.`), { status: 503, code: 'DATABASE_ERROR' });
  const match = response.headers.get('content-range')?.match(/\/(\d+)$/);
  return Number(match?.[1] || 0);
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

async function reserveUserSearch(userId, limit = USER_DAILY_SEARCH_LIMIT) {
  const count = await dbRequest('rpc/take_user_search_slot', { method: 'POST', body: { p_user_id: userId, p_daily_limit: limit } });
  return Number(count);
}

async function reserveUserAnalysis(userId) {
  const count = await dbRequest('rpc/take_user_analysis_slot', { method: 'POST', body: { p_user_id: userId, p_daily_limit: USER_DAILY_ANALYSIS_LIMIT } });
  return Number(count);
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
  const { min: minSubscribers, max: maxSubscribers } = normalizeSubscriberRange(body.minSubscribers, body.maxSubscribers);
  const regionCode = optionalText(body.regionCode, 2)?.toUpperCase();
  if (regionCode && !/^[A-Z]{2}$/.test(regionCode)) throw Object.assign(new Error('Choose a valid two-letter country code.'), { status: 400, code: 'INVALID_REGION' });
  const relevanceLanguage = optionalText(body.language, 2)?.toLowerCase();
  if (relevanceLanguage && !/^[a-z]{2}$/.test(relevanceLanguage)) throw Object.assign(new Error('Choose a valid two-letter language code.'), { status: 400, code: 'INVALID_LANGUAGE' });
  const pageToken = optionalText(body.pageToken, 300);

  const usage = await reserveSearchCall();
  const search = await googleGet('search', {
    key: YOUTUBE_KEY, part: 'snippet', type: 'channel', q: query, maxResults,
    regionCode, relevanceLanguage, pageToken,
    fields: 'nextPageToken,items(id(channelId),snippet(title,description,channelId))',
  });
  const ids = dedupeChannelsById((search.items || []).map(item => ({ channelId: item.id?.channelId || item.snippet?.channelId })).filter(item => item.channelId)).map(item => item.channelId);
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
  const declaredCountries = Array.isArray(body.declaredCountries) ? body.declaredCountries.slice(0, 20) : [];
  if (declaredCountries.some(code => typeof code !== 'string' || !/^[A-Z]{2}$/.test(code))) throw Object.assign(new Error('Use two-letter country codes for creator-country filters.'), { status: 400, code: 'INVALID_COUNTRY_FILTER' });
  const includeUnknown = body.includeUnknown !== false;
  const unknownCountryOnly = body.unknownCountryOnly === true;
  const excludeIndia = body.excludeIndia === true;
  const countryFiltered = filterByDeclaredCountry(items.filter(item => !(excludeIndia && item.countryCode === 'IN')), declaredCountries, includeUnknown, unknownCountryOnly);
  const subscriberFiltered = filterByPublicSubscribers(countryFiltered, { min: minSubscribers, max: maxSubscribers }, body.includeUnknownSubscribers !== false);
  return { items: subscriberFiltered, nextPageToken: search.nextPageToken || null, filtersApplied: { query, minSubscribers, maxSubscribers, declaredCountries, unknownCountryOnly, excludeIndia }, usage: { calls: usage, limit: SEARCH_LIMIT, source: 'this app only' } };
}

async function youtubeChannelInspection(body) {
  if (!YOUTUBE_KEY) throw Object.assign(new Error('Live YouTube search is not set up yet. Add YOUTUBE_API_KEY on the server, then restart the app.'), { status: 503, code: 'YOUTUBE_NOT_CONFIGURED' });
  const channelId = requireText(body.channelId, 'Channel ID', 64);
  if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) throw Object.assign(new Error('That YouTube channel ID is not valid. Open a live search result and try again.'), { status: 400, code: 'INVALID_CHANNEL_ID' });
  const channelResponse = await googleGet('channels', { key: YOUTUBE_KEY, part: 'snippet,statistics,contentDetails', id: channelId, fields: 'items(id,snippet(title,description,customUrl,country,publishedAt,thumbnails(default,medium,high)),statistics(subscriberCount,viewCount,videoCount),contentDetails(relatedPlaylists(uploads)))' });
  const channel = channelResponse.items?.[0];
  if (!channel) throw Object.assign(new Error('YouTube could not find that public channel.'), { status: 404, code: 'CHANNEL_NOT_FOUND' });
  const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) return { channel: { channelId, name: channel.snippet?.title || 'Untitled channel', description: channel.snippet?.description || '', countryCode: channel.snippet?.country || null, publishedAt: channel.snippet?.publishedAt || null, subscribers: channel.statistics?.subscriberCount ?? null, totalViews: channel.statistics?.viewCount ?? null, videoCount: channel.statistics?.videoCount ?? null }, videos: [], fetchedAt: new Date().toISOString(), source: 'YouTube Data API' };
  const playlist = await googleGet('playlistItems', { key: YOUTUBE_KEY, part: 'snippet,contentDetails', playlistId: uploadsPlaylist, maxResults: 10, fields: 'items(contentDetails(videoId,videoPublishedAt),snippet(title,description,publishedAt,thumbnails(default,medium,high)))' });
  const videoIds = [...new Set((playlist.items || []).map(item => item.contentDetails?.videoId).filter(Boolean))];
  const videoResponse = videoIds.length ? await googleGet('videos', { key: YOUTUBE_KEY, part: 'snippet,statistics', id: videoIds.join(','), fields: 'items(id,snippet(title,description,publishedAt,thumbnails(default,medium,high)),statistics(viewCount,likeCount,commentCount))' }) : { items: [] };
  const videosById = new Map((videoResponse.items || []).map(video => [video.id, video]));
  const videos = videoIds.map(id => videosById.get(id)).filter(Boolean).map(video => ({
    videoId: video.id,
    title: video.snippet?.title || 'Untitled video',
    description: video.snippet?.description || '',
    publishedAt: video.snippet?.publishedAt || null,
    thumbnail: video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || null,
    views: video.statistics?.viewCount ?? null,
    likes: video.statistics?.likeCount ?? null,
    comments: video.statistics?.commentCount ?? null,
    videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
  }));
  return {
    channel: { channelId, name: channel.snippet?.title || 'Untitled channel', description: channel.snippet?.description || '', customUrl: channel.snippet?.customUrl || null, countryCode: channel.snippet?.country || null, publishedAt: channel.snippet?.publishedAt || null, subscribers: channel.statistics?.subscriberCount ?? null, totalViews: channel.statistics?.viewCount ?? null, videoCount: channel.statistics?.videoCount ?? null, channelUrl: `https://www.youtube.com/channel/${encodeURIComponent(channelId)}` },
    videos,
    fetchedAt: new Date().toISOString(),
    source: 'YouTube Data API',
  };
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

function savedSearchFilters(input) {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Search filters must be an object.'), { status: 400, code: 'INVALID_FILTERS' });
  const { min, max } = normalizeSubscriberRange(input.minSubscribers, input.maxSubscribers);
  const service = optionalText(input.service, 100);
  const searchTerms = optionalText(input.searchTerms, 120);
  const declaredCountries = Array.isArray(input.declaredCountries) ? input.declaredCountries.slice(0, 20) : [];
  if (declaredCountries.some(code => typeof code !== 'string' || !/^[A-Z]{2}$/.test(code))) throw Object.assign(new Error('Use two-letter country codes in the saved filter.'), { status: 400, code: 'INVALID_FILTERS' });
  const requestedCount = input.requestedCount == null ? 20 : Number(input.requestedCount);
  if (!Number.isSafeInteger(requestedCount) || requestedCount < 1 || requestedCount > 50) throw Object.assign(new Error('Choose from 1 to 50 channels per search.'), { status: 400, code: 'INVALID_FILTERS' });
  return { service, searchTerms, minSubscribers: min, maxSubscribers: max, declaredCountries: [...new Set(declaredCountries)], requestedCount, includeUnknownSubscribers: input.includeUnknownSubscribers !== false };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method || 'GET';
  if (!withinRateLimit(req, res)) return;
  if (['POST','PATCH','DELETE'].includes(method) && !isSameOrigin(req)) return safeError(res, 403, 'ORIGIN_CHECK_FAILED', 'This request did not come from this app. Refresh the page and try again.');

  if (pathname === '/api/auth/signup' && method === 'POST') {
    const body = await readJson(req, 8_000);
    const email = requireText(body.email, 'Email', 254).toLowerCase();
    const password = requireText(body.password, 'Password', 256);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400, code: 'INVALID_EMAIL' });
    if (password.length < 12) throw Object.assign(new Error('Use a password with at least 12 characters.'), { status: 400, code: 'WEAK_PASSWORD' });
    const data = await supabaseAuth('/signup', { method: 'POST', body: { email, password } });
    return send(res, 202, { ok: true, confirmationRequired: !data?.access_token, message: data?.access_token ? 'Account created. You can now sign in.' : 'Account created. Check your email to confirm it, then sign in.' });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await readJson(req, 8_000);
    const email = requireText(body.email, 'Email', 254).toLowerCase();
    const password = requireText(body.password, 'Password', 256);
    const tokens = await supabaseAuth('/token?grant_type=password', { method: 'POST', body: { email, password } });
    const rows = await dbRequest('app_users', { query: new URLSearchParams({ select: 'id,email,role,status,plan,search_limit_override,created_at', id: `eq.${tokens.user.id}`, limit: '1' }).toString() });
    const profile = rows?.[0];
    if (!profile) throw Object.assign(new Error('Account tables are not ready. Apply migrations/002_accounts_search_history.sql in Supabase, then sign in again.'), { status: 503, code: 'PROFILE_SCHEMA_NOT_READY' });
    if (profile.status !== 'active') throw Object.assign(new Error('This account is currently paused. Contact the workspace administrator.'), { status: 403, code: 'ACCOUNT_SUSPENDED' });
    res.setHeader('Set-Cookie', sessionCookies(tokens));
    return send(res, 200, { authenticated: true, user: { id: profile.id, email: profile.email || email, role: profile.role, plan: profile.plan } });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    res.setHeader('Set-Cookie', sessionCookies(null, true));
    return send(res, 200, { authenticated: false });
  }

  if (pathname === '/api/auth/session' && method === 'GET') {
    const user = await currentUser(req, res);
    return send(res, 200, { authenticated: Boolean(user), user });
  }

  if (pathname === '/api/health' && method === 'GET') {
    let database = databaseConfigured() ? 'configured' : 'not_configured';
    let usage = null;
    if (databaseConfigured()) {
      try { usage = await currentUsage(); database = 'connected'; }
      catch { database = 'unavailable'; }
    }
    return send(res, 200, { ok: true, database, youtube: YOUTUBE_KEY ? 'configured' : 'not_configured', auth: SUPABASE_URL && SUPABASE_AUTH_KEY ? 'configured' : 'not_configured', searchUsage: usage, noLogin: false });
  }

  if (pathname === '/api/search/interpret' && method === 'POST') {
    const body = await readJson(req, 4_000);
    const result = interpretSearchQuery(body.query);
    return send(res, 200, result);
  }

  if (pathname === '/api/youtube/search' && method === 'POST') {
    const user = await currentUser(req, res);
    if (!user) return safeError(res, 401, 'AUTH_REQUIRED', 'Sign in to start a channel search.');
    const body = await readJson(req);
    const userLimit = Number(user.search_limit_override) || USER_DAILY_SEARCH_LIMIT;
    const userCalls = await reserveUserSearch(user.id, userLimit);
    const record = { user_id: user.id, query: requireText(body.query, 'Search phrase', 120), filters: { regionCode: body.regionCode || null, minSubscribers: body.minSubscribers ?? null, maxSubscribers: body.maxSubscribers ?? null, includeUnknownSubscribers: body.includeUnknownSubscribers !== false, declaredCountries: body.declaredCountries || [], service: body.service || null, maxResults: body.maxResults || 20 }, status: 'running', started_at: new Date().toISOString() };
    const created = await dbRequest('discovery_searches', { method: 'POST', body: record, prefer: 'return=representation' });
    const searchId = created?.[0]?.id;
    let result;
    try { result = await youtubeSearch(body); }
    catch (error) {
      if (searchId) await dbRequest('discovery_searches', { method: 'PATCH', query: new URLSearchParams({ id: `eq.${searchId}`, user_id: `eq.${user.id}` }).toString(), body: { status: 'failed', error_code: error.code || 'SEARCH_FAILED', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() } }).catch(() => {});
      throw error;
    }
    if (searchId) await dbRequest('discovery_searches', { method: 'PATCH', query: new URLSearchParams({ id: `eq.${searchId}`, user_id: `eq.${user.id}` }).toString(), body: { status: 'completed', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() } });
    result.userUsage = { calls: userCalls, limit: userLimit };
    return send(res, 200, result);
  }

  if (pathname === '/api/youtube/inspect' && method === 'POST') {
    const user = await currentUser(req, res);
    if (!user) return safeError(res, 401, 'AUTH_REQUIRED', 'Sign in to inspect recent public uploads.');
    const body = await readJson(req, 4_000);
    const analysisCalls = await reserveUserAnalysis(user.id);
    const data = await youtubeChannelInspection(body);
    data.usage = { analysesToday: analysisCalls, dailyLimit: USER_DAILY_ANALYSIS_LIMIT };
    return send(res, 200, data);
  }

  if (pathname.startsWith('/api/admin/')) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (pathname === '/api/admin/overview' && method === 'GET') {
      const [users, activeUsers, searches, completedSearches, errors, dailyUsage] = await Promise.all([
        dbCount('app_users'), dbCount('app_users', 'status=eq.active'), dbCount('discovery_searches'), dbCount('discovery_searches', 'status=eq.completed'), dbCount('api_error_logs'),
        dbRequest('youtube_api_usage', { query: new URLSearchParams({ select: 'search_calls', usage_date: `eq.${new Date().toISOString().slice(0, 10)}`, limit: '1' }).toString() }),
      ]);
      return send(res, 200, { users, activeUsers, searches, discoveredChannels: null, analyzedLeads: null, apiCallsToday: Number(dailyUsage?.[0]?.search_calls || 0), apiErrors: errors, searchSuccessRate: searches ? Math.round(completedSearches / searches * 100) : null, system: { database: 'connected', youtube: YOUTUBE_KEY ? 'configured' : 'not_configured', auth: 'configured', ai: process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY ? 'configured' : 'not_configured', billing: 'not_configured' } });
    }
    if (pathname === '/api/admin/users' && method === 'GET') {
      const search = optionalText(url.searchParams.get('q'), 120);
      const query = new URLSearchParams({ select: 'id,email,role,status,plan,search_limit_override,created_at', order: 'created_at.desc', limit: '200' });
      if (search) { const needle = search.replace(/[^\w.@+-]/g, ''); if (needle) query.set('or', `(email.ilike.*${needle}*,id.eq.${needle})`); }
      const [users, usageRows] = await Promise.all([
        dbRequest('app_users', { query: query.toString() }),
        dbRequest('user_daily_usage', { query: new URLSearchParams({ select: 'user_id,search_requests,analysis_requests', usage_date: `eq.${new Date().toISOString().slice(0, 10)}`, limit: '5000' }).toString() }),
      ]);
      const usage = new Map(usageRows.map(row => [row.user_id, row]));
      return send(res, 200, users.map(user => ({ ...user, searches_today: usage.get(user.id)?.search_requests || 0, analyses_today: usage.get(user.id)?.analysis_requests || 0, default_search_limit: USER_DAILY_SEARCH_LIMIT, default_analysis_limit: USER_DAILY_ANALYSIS_LIMIT })));
    }
    if (pathname === '/api/admin/searches' && method === 'GET') {
      return send(res, 200, await dbRequest('discovery_searches', { query: new URLSearchParams({ select: 'id,user_id,query,filters,status,error_code,created_at,started_at,finished_at', order: 'created_at.desc', limit: '300' }).toString() }));
    }
    if (pathname === '/api/admin/errors' && method === 'GET') {
      return send(res, 200, await dbRequest('api_error_logs', { query: new URLSearchParams({ select: 'id,code,message,path,status,created_at', order: 'created_at.desc', limit: '200' }).toString() }));
    }
    if (pathname === '/api/admin/config' && method === 'GET') {
      return send(res, 200, { youtube: { configured: Boolean(YOUTUBE_KEY), secret: 'stored in server environment' }, database: { configured: databaseConfigured() }, auth: { configured: Boolean(SUPABASE_AUTH_KEY) }, ai: { configured: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY), status: 'not used until an approved provider is selected' }, limits: { youtubeSearchCallsPerDay: SEARCH_LIMIT, userSearchesPerDay: USER_DAILY_SEARCH_LIMIT, userChannelInspectionsPerDay: USER_DAILY_ANALYSIS_LIMIT, apiRequestsPerMinute: RATE_LIMIT }, subscriptions: { configured: false } });
    }
    const userMatch = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/i);
    if (userMatch && method === 'PATCH') {
      const body = await readJson(req);
      const changes = {};
      if (body.role !== undefined) { if (!['member','admin'].includes(body.role)) throw Object.assign(new Error('Choose a valid account role.'), { status: 400, code: 'INVALID_ROLE' }); changes.role = body.role; }
      if (body.status !== undefined) { if (!['active','suspended'].includes(body.status)) throw Object.assign(new Error('Choose a valid account status.'), { status: 400, code: 'INVALID_STATUS' }); changes.status = body.status; }
      if (body.plan !== undefined) { if (!['free','starter','pro','agency'].includes(body.plan)) throw Object.assign(new Error('Choose a valid plan.'), { status: 400, code: 'INVALID_PLAN' }); changes.plan = body.plan; }
      if (body.search_limit_override !== undefined) {
        if (body.search_limit_override !== null && (!Number.isSafeInteger(body.search_limit_override) || body.search_limit_override < 1 || body.search_limit_override > 1000)) throw Object.assign(new Error('Set the account search limit from 1 to 1,000 per day, or clear the override.'), { status: 400, code: 'INVALID_USAGE_LIMIT' });
        changes.search_limit_override = body.search_limit_override;
      }
      if (!Object.keys(changes).length) throw Object.assign(new Error('Choose an account setting to update.'), { status: 400, code: 'NO_CHANGES' });
      if (userMatch[1] === admin.id && (changes.role === 'member' || changes.status === 'suspended')) throw Object.assign(new Error('You cannot remove your own admin access or pause your account.'), { status: 400, code: 'SELF_ADMIN_CHANGE' });
      if (changes.role === 'member' || changes.status === 'suspended') {
        const targetRows = await dbRequest('app_users', { query: new URLSearchParams({ select: 'role,status', id: `eq.${userMatch[1]}`, limit: '1' }).toString() });
        if (targetRows?.[0]?.role === 'admin' && targetRows[0].status === 'active') {
          const admins = await dbRequest('app_users', { query: new URLSearchParams({ select: 'id', role: 'eq.admin', status: 'eq.active', limit: '2' }).toString() });
          if (admins.length <= 1) throw Object.assign(new Error('Keep at least one active administrator.'), { status: 400, code: 'LAST_ADMIN' });
        }
      }
      changes.updated_at = new Date().toISOString();
      const updated = await dbRequest('app_users', { method: 'PATCH', query: new URLSearchParams({ id: `eq.${userMatch[1]}`, select: 'id,email,role,status,plan,search_limit_override,created_at' }).toString(), body: changes, prefer: 'return=representation' });
      if (!updated?.length) return safeError(res, 404, 'NOT_FOUND', 'That account could not be found.');
      await adminAudit(admin.id, 'user.updated', userMatch[1], changes);
      return send(res, 200, updated[0]);
    }
    return safeError(res, 404, 'NOT_FOUND', 'This admin route does not exist.');
  }

  const actor = await currentUser(req, res);
  if (!actor) return safeError(res, 401, 'AUTH_REQUIRED', 'Sign in to access your workspace.');

  if (pathname === '/api/searches' && method === 'GET') {
    const rows = await dbRequest('discovery_searches', { query: new URLSearchParams({ select: 'id,query,filters,status,error_code,created_at,started_at,finished_at', user_id: `eq.${actor.id}`, order: 'created_at.desc', limit: '200' }).toString() });
    return send(res, 200, rows);
  }

  if (pathname === '/api/prospects' && method === 'GET') {
    const rows = await dbRequest('external_prospects', { query: new URLSearchParams({ select: '*', user_id: `eq.${actor.id}`, order: 'updated_at.desc', limit: '250' }).toString() });
    return send(res, 200, rows);
  }
  if (pathname === '/api/prospects' && method === 'POST') {
    const body = await readJson(req);
    const row = prospectInput(body);
    row.user_id = actor.id;
    const rows = await dbRequest('external_prospects', { method: 'POST', body: row, prefer: 'return=representation' });
    return send(res, 201, rows?.[0] || null);
  }
  const prospectMatch = pathname.match(/^\/api\/prospects\/([0-9a-f-]{36})$/i);
  if (prospectMatch && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(prospectMatch[1])) return safeError(res, 400, 'INVALID_ID', 'That record id is not valid.');
  if (prospectMatch && method === 'PATCH') {
    const body = await readJson(req);
    const changes = prospectInput(body, true);
    changes.updated_at = new Date().toISOString();
    const query = new URLSearchParams({ id: `eq.${prospectMatch[1]}`, user_id: `eq.${actor.id}`, select: '*' }).toString();
    const rows = await dbRequest('external_prospects', { method: 'PATCH', query, body: changes, prefer: 'return=representation' });
    return rows?.length ? send(res, 200, rows[0]) : safeError(res, 404, 'NOT_FOUND', 'This prospect could not be found.');
  }
  if (prospectMatch && method === 'DELETE') {
    await dbRequest('external_prospects', { method: 'DELETE', query: new URLSearchParams({ id: `eq.${prospectMatch[1]}`, user_id: `eq.${actor.id}` }).toString() });
    return send(res, 200, { deleted: true });
  }

  if (pathname === '/api/tasks' && method === 'GET') {
    const rows = await dbRequest('crm_tasks', { query: new URLSearchParams({ select: '*,external_prospects(business_name)', user_id: `eq.${actor.id}`, order: 'due_at.asc.nullslast,created_at.desc', limit: '500' }).toString() });
    return send(res, 200, rows);
  }
  if (pathname === '/api/tasks' && method === 'POST') {
    const body = await readJson(req);
    const title = requireText(body.title, 'Reminder', 240);
    const row = { title, prospect_id: optionalText(body.prospect_id, 36), due_at: optionalText(body.due_at, 10), done: false, user_id: actor.id };
    if (row.prospect_id && !/^[0-9a-f-]{36}$/i.test(row.prospect_id)) throw Object.assign(new Error('Choose a valid business.'), { status: 400, code: 'INVALID_ID' });
    if (row.prospect_id) {
      const owned = await dbRequest('external_prospects', { query: new URLSearchParams({ select: 'id', id: `eq.${row.prospect_id}`, user_id: `eq.${actor.id}`, limit: '1' }).toString() });
      if (!owned?.length) throw Object.assign(new Error('Choose one of your own businesses.'), { status: 400, code: 'INVALID_PROSPECT' });
    }
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
    const rows = await dbRequest('crm_tasks', { method: 'PATCH', query: new URLSearchParams({ id: `eq.${taskMatch[1]}`, user_id: `eq.${actor.id}`, select: '*' }).toString(), body: changes, prefer: 'return=representation' });
    return rows?.length ? send(res, 200, rows[0]) : safeError(res, 404, 'NOT_FOUND', 'This reminder could not be found.');
  }
  if (taskMatch && method === 'DELETE') {
    await dbRequest('crm_tasks', { method: 'DELETE', query: new URLSearchParams({ id: `eq.${taskMatch[1]}`, user_id: `eq.${actor.id}` }).toString() });
    return send(res, 200, { deleted: true });
  }

  if (pathname === '/api/search-presets' && method === 'GET') {
    const rows = await dbRequest('youtube_search_presets', { query: new URLSearchParams({ select: '*', user_id: `eq.${actor.id}`, order: 'created_at.desc', limit: '100' }).toString() });
    return send(res, 200, rows);
  }
  if (pathname === '/api/search-presets' && method === 'POST') {
    const body = await readJson(req);
    const row = {
      user_id: actor.id,
      name: requireText(body.name, 'Search name', 120),
      query: requireText(body.query, 'Search phrase', 200),
      filters: savedSearchFilters(body.filters),
      region_code: optionalText(body.region_code, 2)?.toUpperCase() || 'US',
      declared_country_code: optionalText(body.declared_country_code, 2)?.toUpperCase() || null,
      country_unknown_only: body.country_unknown_only === true,
      topic: optionalText(body.topic, 100),
      include_unknown: body.include_unknown !== false,
      exclude_declared_india: body.exclude_declared_india === true,
    };
    if (!/^[A-Z]{2}$/.test(row.region_code) || (row.declared_country_code && !/^[A-Z]{2}$/.test(row.declared_country_code))) throw Object.assign(new Error('Choose a valid country.'), { status: 400, code: 'INVALID_REGION' });
    const rows = await dbRequest('youtube_search_presets', { method: 'POST', body: row, prefer: 'return=representation' });
    return send(res, 201, rows?.[0] || null);
  }
  const presetMatch = pathname.match(/^\/api\/search-presets\/([0-9a-f-]{36})$/i);
  if (presetMatch && method === 'DELETE') {
    await dbRequest('youtube_search_presets', { method: 'DELETE', query: new URLSearchParams({ id: `eq.${presetMatch[1]}`, user_id: `eq.${actor.id}` }).toString() });
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
    const type = requested.endsWith('.html') ? 'text/html; charset=utf-8' : requested.endsWith('.css') ? 'text/css; charset=utf-8' : requested.endsWith('.js') || requested.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { ...securityHeaders, 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': bytes.length });
    if (req.method === 'HEAD') return res.end();
    return res.end(bytes);
  } catch (error) {
    const status = Number(error?.status) || 500;
    const code = error?.code || 'SERVER_ERROR';
    const message = status >= 500 && code === 'DATABASE_ERROR' ? 'The database is not responding. Check the Supabase setup and try again.' : (error?.message || 'Something went wrong. Try again.');
    if (status >= 500) {
      console.error(`[api] ${code}: ${message}`);
      if (url?.pathname.startsWith('/api/') && databaseConfigured()) await dbRequest('api_error_logs', { method: 'POST', body: { code: String(code).slice(0, 100), message: String(message).slice(0, 1000), path: url.pathname.slice(0, 200), status }, prefer: 'return=minimal' }).catch(() => {});
    }
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
