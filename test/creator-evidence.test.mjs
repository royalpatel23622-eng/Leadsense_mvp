import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCreatorEvidence, evidenceFreshness } from '../lib/creator-evidence.mjs';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const evidence = (overrides = {}) => ({
  id: 'evidence-1',
  evidence_type: 'public_request',
  strength: 'strong',
  verification_status: 'manually_verified',
  published_at: '2026-11-01T12:00:00Z',
  discovered_at: '2026-11-02T12:00:00Z',
  last_checked_at: '2026-11-20T12:00:00Z',
  source_url: 'https://creator.example/hiring',
  ...overrides,
});

test('fresh manually verified explicit source is an explicit opportunity', () => {
  const result = classifyCreatorEvidence([evidence()], NOW);
  assert.equal(result.classification, 'explicit_opportunity');
  assert.match(result.reason, /manually checked/i);
  assert.equal(result.evidenceStates[0].status, 'fresh');
});

test('old publication evidence requires a fresh manual check', () => {
  const item = evidence({ published_at: '2026-06-01T12:00:00Z', last_checked_at: '2026-10-01T12:00:00Z' });
  assert.equal(evidenceFreshness(item, NOW).status, 'stale');
  const result = classifyCreatorEvidence([item], NOW);
  assert.equal(result.classification, 'insufficient_evidence');
  assert.match(result.reason, /stale/i);
});

test('a recent manual recheck can refresh old source evidence', () => {
  const item = evidence({ published_at: '2026-06-01T12:00:00Z' });
  assert.equal(evidenceFreshness(item, NOW).status, 'fresh');
  assert.equal(classifyCreatorEvidence([item], NOW).classification, 'explicit_opportunity');
});

test('old manual checks require a recheck before opportunity classification', () => {
  const item = evidence({ last_checked_at: '2026-10-01T12:00:00Z' });
  assert.equal(evidenceFreshness(item, NOW).status, 'stale');
  assert.equal(classifyCreatorEvidence([item], NOW).classification, 'insufficient_evidence');
});

test('unverified and unavailable sources are distinct and never become opportunities', () => {
  const unverified = evidence({ verification_status: 'unverified', last_checked_at: null, published_at: null, discovered_at: '2026-11-20T12:00:00Z' });
  const unavailable = evidence({ verification_status: 'no_longer_available' });
  assert.equal(evidenceFreshness(unverified, NOW).status, 'fresh');
  assert.equal(evidenceFreshness(unavailable, NOW).status, 'unavailable');
  assert.match(classifyCreatorEvidence([unverified], NOW).reason, /not manually checked/i);
  assert.match(classifyCreatorEvidence([unavailable], NOW).reason, /unavailable/i);
});

test('fresh weak context does not imply an opportunity', () => {
  const result = classifyCreatorEvidence([evidence({ evidence_type: 'context_note', strength: 'weak' })], NOW);
  assert.equal(result.classification, 'context_only');
  assert.match(result.reason, /does not show buying intent/i);
});

test('a current checked relevant statement without explicit buying intent is potential', () => {
  const result = classifyCreatorEvidence([evidence({ evidence_type: 'creator_statement', strength: 'moderate' })], NOW);
  assert.equal(result.classification, 'potential_opportunity');
  assert.match(result.reason, /not a confirmed explicit request/i);
});

test('undated evidence requires a source recheck', () => {
  const item = evidence({ published_at: null, discovered_at: null, last_checked_at: null });
  assert.equal(evidenceFreshness(item, NOW).status, 'unknown');
  assert.equal(evidenceFreshness(item, NOW).needsRecheck, true);
});
