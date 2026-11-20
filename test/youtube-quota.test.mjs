import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaDatePacific } from '../server.mjs';

test('YouTube quota day rolls over at midnight Pacific Time', () => {
  assert.equal(quotaDatePacific(new Date('2026-11-20T07:59:59.000Z')), '2026-11-19');
  assert.equal(quotaDatePacific(new Date('2026-11-20T08:00:00.000Z')), '2026-11-20');
});
