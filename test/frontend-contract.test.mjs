import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, core, experience] = await Promise.all([
  readFile(new URL('../outputs/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../outputs/app-1.js', import.meta.url), 'utf8'),
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
  assert.match(core, /taskRecords\.slice\(0,preview\?3:taskRecords\.length\)/);
  assert.doesNotMatch(core, /taskRecords\.slice\(0,preview\?3:tasks\.length\)/);
});

test('page scripts are same-origin assets and no fictional account count is prefilled', () => {
  assert.match(html, /<script src="\/app-1\.js"><\/script>/);
  assert.match(html, /<script src="\/app-2\.js"><\/script>/);
  assert.doesNotMatch(html, /<script>(?!\s*<\/script>)/);
  assert.match(html, /id="crmCount">0<\/span>/);
});

test('creator country and search region remain separate controls', () => {
  assert.match(experience, /label for="countryFilter"/);
  assert.match(experience, /label for="regionFilter"/);
  assert.doesNotMatch(experience, /selectedCountry\.onchange\s*=\s*\(\)\s*=>\s*\{\s*if\s*\(selectedCountry\.value/);
});
