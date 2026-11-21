import { test, expect } from '@playwright/test';
import { createAppServer } from '../server.mjs';

let server;
let baseUrl;
test.beforeAll(async () => {
  server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test('same-origin CSP assets load and the login view fits common phone, tablet, and desktop widths', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { authenticated: false } });
    if (path === '/api/health') return route.fulfill({ json: { ok: true, database: 'not_configured', youtube: 'not_configured' } });
    return route.fulfill({ json: [] });
  });
  const cspErrors = [];
  page.on('console', message => { if (message.type() === 'error' && /content security policy|refused to/i.test(message.text())) cspErrors.push(message.text()); });
  const response = await page.goto(baseUrl);
  const policy = response.headers()['content-security-policy'];
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  await expect(page.locator('#authGate')).toBeVisible();
  await expect(page.locator('script:not([src])')).toHaveCount(0);
  await expect(page.locator('#authGate h1')).toHaveText('Welcome back');
  for (const [width, height] of [[360,800],[390,844],[768,1024],[1280,800],[1440,900]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('#authGate')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, page: document.documentElement.scrollWidth }));
    expect(dimensions.page, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
  expect(cspErrors).toEqual([]);
});

test('discovery explains how to fix a missing Supabase quota function', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { authenticated: true, user: { id: 'user-1', email: 'test@example.com', role: 'user' } } });
    if (path === '/api/health') return route.fulfill({ json: { ok: true, database: 'connected', youtube: 'configured' } });
    if (path === '/api/youtube/search') return route.fulfill({ status: 503, json: { error: { code: 'QUOTA_MIGRATION_REQUIRED', message: 'Supabase is missing the YouTube quota function. Apply migrations/003_youtube_quota_accounting.sql in the Supabase SQL Editor, then retry the search.' } } });
    return route.fulfill({ json: [] });
  });
  await page.goto(baseUrl);
  await page.locator('[data-view="discover"]').first().click();
  await page.locator('#creatorQuery').fill('design creators');
  await page.locator('#searchBtn').click();
  await expect(page.locator('#noResults')).toContainText('Apply migrations/003_youtube_quota_accounting.sql');
  await expect(page.locator('#creatorGrid')).toBeEmpty();
});

test('discovery form submits exact filters, separates related candidates, and preserves them on Load More', async ({ page }) => {
  const submissions = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, user: { id: 'user-1', email: 'test@example.com', role: 'user' } } });
    if (url.pathname === '/api/health') return route.fulfill({ json: { ok: true, database: 'connected', youtube: 'configured', searchUsage: { calls: 0, limit: 40 } } });
    if (url.pathname === '/api/prospects' || url.pathname === '/api/tasks' || url.pathname === '/api/search-presets' || url.pathname === '/api/searches') return route.fulfill({ json: [] });
    if (url.pathname === '/api/youtube/search' && request.method() === 'POST') {
      const body = request.postDataJSON();
      submissions.push(body);
      if (submissions.length === 1) return route.fulfill({ json: {
        items: [{ channelId: 'UCexact1', name: 'Exact Creator', description: 'Gaming channel', countryCode: 'US', subscribers: 5000, videoCount: 8, channelUrl: 'https://www.youtube.com/channel/UCexact1', topicCategories: [] }],
        relatedItems: [{ channelId: 'UCrelated1', name: 'Related Creator', description: 'Related gaming channel', countryCode: 'CA', subscribers: 5000, videoCount: 8, channelUrl: 'https://www.youtube.com/channel/UCrelated1', relatedReasons: ['Declared country is outside your selection'] }],
        requestedCount: 2, exactMatchCount: 1, candidateCount: 2, inspectedCount: 2, inspectedChannelIds: ['UCexact1', 'UCrelated1'], excludedCount: 1, searchPages: 1, complete: false, isPartial: true, hasMore: true, nextPageToken: 'next-token', searchWarning: 'Page limit reached', usage: { calls: 1, limit: 40 },
      } });
      return route.fulfill({ json: {
        items: [{ channelId: 'UCexact2', name: 'Second Exact Creator', description: 'Gaming channel', countryCode: 'US', subscribers: 100000, videoCount: 10, channelUrl: 'https://www.youtube.com/channel/UCexact2', topicCategories: [] }],
        relatedItems: [], requestedCount: 1, exactMatchCount: 1, candidateCount: 1, inspectedCount: 1, inspectedChannelIds: ['UCexact2'], excludedCount: 0, searchPages: 1, complete: true, isPartial: false, hasMore: false, nextPageToken: null, usage: { calls: 2, limit: 40 },
      } });
    }
    return route.fulfill({ status: 404, json: { error: { message: `Unexpected API route ${url.pathname}` } } });
  });

  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /content security policy|refused to/i.test(message.text())) errors.push(message.text()); });
  await page.goto(baseUrl);
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(246, 245, 241)');
  await expect(page.locator('script[src="/product-experience.js"]')).toHaveJSProperty('isConnected', true);
  await page.locator('[data-view="discover"]').first().click();
  await page.locator('#creatorQuery').fill('gaming creators');
  await page.locator('#countryFilter').selectOption('US');
  await page.locator('#regionFilter').selectOption('IN');
  await page.locator('#minSubscriberFilter').fill('5000');
  await page.locator('#maxSubscriberFilter').fill('100000');
  await page.locator('#requestedCountFilter').selectOption('5');
  await page.locator('#searchBtn').click();
  await expect(page.locator('#creatorGrid')).toContainText('Exact Creator');
  await expect(page.locator('#creatorGrid')).not.toContainText('Related Creator');
  await expect(page.locator('#relatedCreatorGrid')).toContainText('Related Creator');
  await expect(page.locator('#searchProgress')).toContainText('Partial search');
  await page.locator('[data-action="loadMore"]').click();
  await expect(page.locator('#creatorGrid')).toContainText('Second Exact Creator');
  expect(submissions).toHaveLength(2);
  expect(submissions[1]).toMatchObject({ query: 'gaming creators', pageToken: 'next-token', pageSize: 50, requestedCount: 4, regionCode: 'IN', minSubscribers: 5000, maxSubscribers: 100000, declaredCountries: ['US'], includeUnknown: false, includeUnknownSubscribers: false, excludeChannelIds: ['UCexact1', 'UCrelated1'] });
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.width && (rect.right > innerWidth + 1 || rect.left < -1) && getComputedStyle(element).position !== 'fixed';
  }).map(element => ({ tag: element.tagName, id: element.id, className: String(element.className).slice(0, 80), left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right) })).slice(0, 10));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), JSON.stringify(overflow)).toBe(true);
});

test('mobile login gate works under CSP and uses the animated single-column layout', async ({ page }) => {
  let loggedIn = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/session') return route.fulfill({ json: loggedIn ? { authenticated: true, user: { id: 'user-1', email: 'test@example.com', role: 'member' } } : { authenticated: false, user: null } });
    if (url.pathname === '/api/auth/login') { loggedIn = true; return route.fulfill({ json: { authenticated: true, user: { id: 'user-1', email: 'test@example.com' } } }); }
    if (url.pathname === '/api/health') return route.fulfill({ json: { ok: true, database: 'connected', youtube: 'configured', searchUsage: { calls: 0, limit: 40 } } });
    if (['/api/prospects', '/api/tasks', '/api/search-presets', '/api/searches'].includes(url.pathname)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: { message: `Unexpected API route ${url.pathname}` } } });
  });
  const cspErrors = [];
  page.on('console', message => { if (message.type() === 'error' && /content security policy|refused to/i.test(message.text())) cspErrors.push(message.text()); });
  await page.goto(baseUrl);
  await expect(page.locator('#authGate')).toBeVisible();
  expect(await page.locator('.auth-art-ring').evaluate(element => getComputedStyle(element).animationName)).toBe('auth-spin');
  expect(await page.locator('.auth-layout').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
  await page.locator('input[name="email"]').fill('test@example.com');
  await page.locator('input[name="password"]').fill('correct-horse-battery');
  await page.locator('#authForm button[type="submit"]').click();
  await expect(page.locator('#authGate')).toHaveCount(0);
  await expect(page.locator('#signOutButton')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(cspErrors).toEqual([]);
});
