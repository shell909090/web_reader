import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/bsky.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const authorFeedJson = readFileSync(
  new URL('../fixtures/bsky/author-feed.json', import.meta.url),
  'utf-8',
);
const searchJson = readFileSync(
  new URL('../fixtures/bsky/search.json', import.meta.url),
  'utf-8',
);

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (url: string) => ({
    status: 200,
    html: url.includes('searchPosts') ? searchJson : authorFeedJson,
    finalUrl: url,
  }),
  log: makeLogger('warn'),
};

describe('bsky plugin', () => {
  it('TC-BS1: list returns >= 5 items with all required fields', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 5, `Expected >= 5 items, got ${items.length}`);
    for (const item of items) {
      assert.strictEqual(item.source, 'bsky', `source should be 'bsky', got '${item.source}'`);
      assert.ok(item.title && item.title.length > 0, 'title should be non-empty');
      assert.ok(item.url && item.url.length > 0, 'url should be non-empty');
      assert.ok(item.notes && item.notes.length > 0, 'notes should be non-empty');
    }
  });

  it('TC-BS2: posts with external embed use the external article URL', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    // fixture has 5 out of 6 posts with external embed; those should point to the original article
    const externalItems = items.filter((i) => !i.url.includes('bsky.app'));
    assert.ok(
      externalItems.length > 0,
      'Expected at least one item with a non-bsky.app URL (from external embed)',
    );
    for (const item of externalItems) {
      assert.ok(
        item.url.startsWith('https://'),
        `external url "${item.url}" should start with https://`,
      );
    }
  });

  it('TC-BS3: text-only posts (no embed) use a bsky.app permalink', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    // fixture has exactly 1 text-only post (arstechnica.com / post006)
    const bskyItems = items.filter((i) => i.url.includes('bsky.app'));
    assert.ok(
      bskyItems.length >= 1,
      'Expected at least one item with a bsky.app URL (text-only post)',
    );
    for (const item of bskyItems) {
      // format: https://bsky.app/profile/{handle}/post/{rkey}
      assert.match(
        item.url,
        /^https:\/\/bsky\.app\/profile\/[^/]+\/post\/[^/]+$/,
        `bsky.app url "${item.url}" does not match expected permalink format`,
      );
    }
  });

  it('TC-BS4: search returns results with valid fields', async () => {
    const items = await plugin.search!(ctx, 'Middle East', 10);
    assert.ok(items.length > 0, 'search should return at least one item');
    for (const item of items) {
      assert.strictEqual(item.source, 'bsky', `source should be 'bsky', got '${item.source}'`);
      assert.ok(item.url && item.url.length > 0, 'url should be non-empty');
      assert.ok(item.notes && item.notes.length > 0, 'notes should be non-empty');
    }
  });

  it('TC-BS5: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 3 });
    assert.ok(items.length <= 3, `Expected <= 3 items, got ${items.length}`);
  });

  it('TC-BS6: categories metadata includes news and tech', () => {
    assert.ok(plugin.categories !== undefined, 'categories should be defined');
    assert.ok('news' in plugin.categories!, "categories should contain 'news'");
    assert.ok('tech' in plugin.categories!, "categories should contain 'tech'");
  });

  it('TC-BS7: categories filter for news returns deduplicated results from news accounts', async () => {
    const items = await plugin.list(ctx, { limit: 50, categories: ['news'] });
    assert.ok(items.length > 0, 'news category should return at least one item');
    for (const item of items) {
      assert.strictEqual(item.source, 'bsky', `source should be 'bsky', got '${item.source}'`);
    }
    // All URLs should be unique (deduplication applied across accounts)
    const urls = items.map((i) => i.url);
    const uniqueUrls = new Set(urls);
    assert.strictEqual(urls.length, uniqueUrls.size, 'items should be deduplicated by URL');
    // With fixture returning 6 posts per account (all same fixture), dedup yields <= 6 unique items
    // Upper bound: news accounts count * 6 posts, but dedup collapses duplicates
    assert.ok(items.length <= 24, `Expected <= 24 items after dedup, got ${items.length}`);
  });
});
