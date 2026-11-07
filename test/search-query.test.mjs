import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretSearchQuery } from '../lib/search-query.mjs';

test('interprets an example service, niche, subscriber range, and countries', () => {
  const result = interpretSearchQuery('I am a video editor. Find gaming channels in the USA, UK, Canada and Australia with 5,000 to 100,000 subscribers.');
  assert.equal(result.method, 'rule_based_preview');
  assert.equal(result.needsReview, true);
  assert.equal(result.filters.service, 'Video editing');
  assert.equal(result.filters.searchTerms, 'gaming');
  assert.deepEqual(result.filters.declaredCountries, ['US', 'GB', 'CA', 'AU']);
  assert.equal(result.filters.minSubscribers, 5000);
  assert.equal(result.filters.maxSubscribers, 100000);
});

test('parses shorthand ranges and one-sided bounds', () => {
  assert.equal(interpretSearchQuery('gaming creators with 5k to 1.2m subscribers').filters.minSubscribers, 5000);
  assert.equal(interpretSearchQuery('gaming creators with 5k to 1.2m subscribers').filters.maxSubscribers, 1200000);
  assert.equal(interpretSearchQuery('gaming channels over 10k subscribers').filters.minSubscribers, 10000);
  assert.equal(interpretSearchQuery('gaming channels under 80,000 subscribers').filters.maxSubscribers, 80000);
});

test('does not mistake the preposition “in” for India', () => {
  assert.deepEqual(interpretSearchQuery('Find gaming channels in USA and Canada').filters.declaredCountries, ['US', 'CA']);
  assert.deepEqual(interpretSearchQuery('Gaming channels in the US and UK').filters.declaredCountries, ['US', 'GB']);
});

test('identifies a requested result count and other service types', () => {
  const result = interpretSearchQuery('I do thumbnail design. Show me 12 design channels in the UK.');
  assert.equal(result.filters.service, 'Thumbnail design');
  assert.equal(result.filters.requestedCount, 12);
  assert.deepEqual(result.filters.declaredCountries, ['GB']);
});

test('rejects empty and oversized input', () => {
  assert.throws(() => interpretSearchQuery('  '), { code: 'INVALID_QUERY' });
  assert.throws(() => interpretSearchQuery('x'.repeat(1001)), { code: 'INVALID_QUERY' });
});
