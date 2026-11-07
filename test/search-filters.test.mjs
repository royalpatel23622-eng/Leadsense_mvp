import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeChannelsById, filterByDeclaredCountry, filterByPublicSubscribers, normalizeSubscriberRange } from '../lib/search-filters.mjs';

test('validates inclusive subscriber bounds', () => {
  assert.deepEqual(normalizeSubscriberRange('5000', '100000'), { min: 5000, max: 100000 });
  assert.deepEqual(normalizeSubscriberRange('', null), { min: null, max: null });
  assert.throws(() => normalizeSubscriberRange(-1, 50), { code: 'INVALID_SUBSCRIBER_RANGE' });
  assert.throws(() => normalizeSubscriberRange(10.5, 50), { code: 'INVALID_SUBSCRIBER_RANGE' });
  assert.throws(() => normalizeSubscriberRange(101, 100), { code: 'INVALID_SUBSCRIBER_RANGE' });
});

test('filters only on the original public subscriber count and preserves unknowns by choice', () => {
  const channels = [{ channelId: 'a', subscribers: 5000 }, { channelId: 'b', subscribers: 100000 }, { channelId: 'c', subscribers: 2000 }, { channelId: 'd', subscribers: null }];
  assert.deepEqual(filterByPublicSubscribers(channels, { min: 5000, max: 100000 }).map(x => x.channelId), ['a', 'b', 'd']);
  assert.deepEqual(filterByPublicSubscribers(channels, { min: 5000, max: 100000 }, false).map(x => x.channelId), ['a', 'b']);
});

test('removes duplicate IDs without changing the first YouTube record', () => {
  const channels = [{ channelId: 'a', name: 'First' }, { channelId: 'a', name: 'Duplicate' }, { channelId: 'b', name: 'Second' }, { name: 'No ID' }];
  assert.deepEqual(dedupeChannelsById(channels), [{ channelId: 'a', name: 'First' }, { channelId: 'b', name: 'Second' }]);
});

test('filters creator-declared country separately from the YouTube search region', () => {
  const channels = [{ channelId: 'us', countryCode: 'US' }, { channelId: 'ca', countryCode: 'CA' }, { channelId: 'unknown', countryCode: null }];
  assert.deepEqual(filterByDeclaredCountry(channels, ['CA'], false).map(x => x.channelId), ['ca']);
  assert.deepEqual(filterByDeclaredCountry(channels, [], true, true).map(x => x.channelId), ['unknown']);
  assert.deepEqual(filterByDeclaredCountry(channels, [], false).map(x => x.channelId), ['us', 'ca']);
});
