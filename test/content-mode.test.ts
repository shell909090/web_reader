import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { contentMode, fallbackReason } from '../src/content-mode.ts';

test('Explicit modes and legacy booleans resolve consistently', () => {
  assert.equal(contentMode(true), 'article');
  assert.equal(contentMode(false), 'full');
  assert.equal(contentMode('auto'), 'auto');
});

test('Retention checks detect missing list items without penalizing intact content', () => {
  const region = new JSDOM(
    '<main>' +
      Array.from(
        { length: 6 },
        (_, i) => `<li>Documentation section ${i} with useful details</li>`,
      ).join('') +
      '</main>',
  ).window.document.body;
  assert.equal(fallbackReason(region, region), undefined);
  const empty = new JSDOM('<p>Unrelated content</p>').window.document.body;
  assert.match(fallbackReason(region, empty) ?? '', /text blocks/);
});
