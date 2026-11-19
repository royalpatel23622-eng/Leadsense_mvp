import test from 'node:test';
import assert from 'node:assert/strict';
import { durationSeconds, isShortDurationCandidate } from '../lib/youtube-metadata.mjs';

test('reads YouTube ISO 8601 video durations', () => {
  assert.equal(durationSeconds('PT1M30S'), 90);
  assert.equal(durationSeconds('PT2H3M4S'), 7384);
  assert.equal(durationSeconds('P1DT1S'), 86401);
  assert.equal(durationSeconds('PT'), null);
  assert.equal(durationSeconds('not-a-duration'), null);
});

test('only marks short-duration candidates and leaves Shorts format unconfirmed', () => {
  assert.equal(isShortDurationCandidate('PT3M'), true);
  assert.equal(isShortDurationCandidate('PT3M1S'), false);
  assert.equal(isShortDurationCandidate('P1D'), false);
  assert.equal(isShortDurationCandidate(null), false);
});
