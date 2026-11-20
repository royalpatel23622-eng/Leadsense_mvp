import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, experience] = await Promise.all([
  readFile(new URL('../outputs/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../outputs/product-experience.js', import.meta.url), 'utf8'),
]);

test('discovery UI wires the frontend contract and requested-count control', () => {
  assert.match(html, /<script src="\/product-experience\.js"><\/script>/);
  assert.match(experience, /id="leadSearchForm"/);
  assert.match(experience, /id="requestedCountFilter"/);
  assert.match(experience, /requestedCount:\s*Number\(/);
  assert.match(experience, /pageSize:\s*50/);
  assert.match(experience, /Object\.assign\(payload, lastSearchPayload, \{ pageToken, excludeChannelIds: inspectedChannelIds/);
  assert.match(experience, /requestedCount: Math\.max\(1, \(lastSearchPayload/);
  assert.match(experience, /id="relatedCreatorGrid"/);
  assert.match(experience, /channels\.filter\(channel => !channel\.isRelated\)/);
});

test('task list renders from the task collection in preview and full modes', () => {
  assert.match(html, /taskRecords\.slice\(0,preview\?3:taskRecords\.length\)/);
  assert.doesNotMatch(html, /taskRecords\.slice\(0,preview\?3:tasks\.length\)/);
});

test('creator country and search region remain separate controls', () => {
  assert.match(experience, /label for="countryFilter"/);
  assert.match(experience, /label for="regionFilter"/);
  assert.doesNotMatch(experience, /selectedCountry\.onchange\s*=\s*\(\)\s*=>\s*\{\s*if\s*\(selectedCountry\.value/);
});
