import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/gnews.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureXml = readFileSync(new URL('../fixtures/gnews/feed.xml', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({ status: 200, html: fixtureXml, finalUrl: 'https://news.google.com/' }),
  log: makeLogger('warn'),
};

describe('gnews plugin', () => {
  it('TC-GN1: list returns >= 10 items with required fields', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 10, `Expected >= 10, got ${items.length}`);
    for (const item of items) {
      assert.strictEqual(item.source, 'gnews', `source should be 'gnews', got '${item.source}'`);
      assert.ok(item.title && item.title.length > 0, 'title should be non-empty');
      assert.ok(item.url && item.url.length > 0, 'url should be non-empty');
      assert.ok(item.notes && item.notes.length > 0, 'notes should be non-empty');
    }
  });

  it('TC-GN2: title has publisher suffix stripped', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length > 0, 'Expected at least one item');
    // First fixture item raw title is "OpenAI unveils GPT-5 with major capability improvements - The Verge"
    assert.ok(!items[0].title.endsWith('The Verge'), 'title should not end with publisher name');
    // Confirm none of the items end with a known publisher name
    const knownPublishers = ['The Verge', 'Reuters', 'TechCrunch', 'BBC News', 'Ars Technica', 'CNBC'];
    for (const item of items) {
      for (const pub of knownPublishers) {
        assert.ok(!item.title.endsWith(pub), `title "${item.title}" should not end with "${pub}"`);
      }
    }
  });

  it('TC-GN3: all urls start with https://news.google.com/', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    for (const item of items) {
      assert.ok(
        item.url.startsWith('https://news.google.com/'),
        `url "${item.url}" should start with https://news.google.com/`,
      );
    }
  });

  it('TC-GN4: search returns results with valid fields', async () => {
    const items = await plugin.search!(ctx, 'AI chip', 10);
    assert.ok(items.length > 0, 'search should return at least one item');
    for (const item of items) {
      assert.strictEqual(item.source, 'gnews', `source should be 'gnews', got '${item.source}'`);
      assert.ok(item.url && item.url.length > 0, 'url should be non-empty');
      assert.ok(item.notes && item.notes.length > 0, 'notes should be non-empty');
    }
  });

  it('TC-GN5: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });

  it('TC-GN6: categories metadata exists and contains required keys', () => {
    assert.ok(plugin.categories !== undefined, 'categories should be defined');
    assert.ok('tech' in plugin.categories!, "categories should contain 'tech'");
    assert.ok('business' in plugin.categories!, "categories should contain 'business'");
    assert.ok('science' in plugin.categories!, "categories should contain 'science'");
  });

  it('TC-GN7: list with categories deduplicates across feeds', async () => {
    // Two category calls each return the same 15-item fixture; dedup by URL → still 15
    const items = await plugin.list(ctx, { limit: 50, categories: ['tech', 'business'] });
    assert.ok(items.length > 0, 'should return items for valid categories');
    assert.ok(items.length <= 15, 'duplicate URLs should be removed across category feeds');
    for (const item of items) {
      assert.strictEqual(item.source, 'gnews');
    }
  });
});
