import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/reddit.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureXml = readFileSync(new URL('../fixtures/reddit/feed.xml', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({ status: 200, html: fixtureXml, finalUrl: 'https://www.reddit.com/' }),
  log: makeLogger('info'),
};

describe('reddit plugin', () => {
  it('TC-RD1: list returns items (megathreads filtered)', async () => {
    const items = await plugin.list(ctx, { limit: 50, categories: ['ml'] });
    assert.ok(items.length >= 8, `Expected >= 8, got ${items.length}`);
    assert.ok(items.every((i) => !/^daily/i.test(i.title)));
  });

  it('TC-RD2: all urls point to reddit.com/r/', async () => {
    const items = await plugin.list(ctx, { limit: 50, categories: ['ml'] });
    assert.ok(items.every((i) => i.url.includes('reddit.com/r/')));
  });

  it('TC-RD3: notes contain subreddit and date', async () => {
    const items = await plugin.list(ctx, { limit: 50, categories: ['ml'] });
    assert.ok(items[0].notes.startsWith('r/'));
    assert.ok(items[0].notes.includes('2026'));
  });

  it('TC-RD4: categories metadata is exposed', () => {
    assert.ok(plugin.categories !== undefined);
    assert.ok('ml' in plugin.categories!);
    assert.ok('llm' in plugin.categories!);
    assert.ok('worldnews' in plugin.categories!);
  });

  it('TC-RD5: search returns items', async () => {
    const items = await plugin.search!(ctx, 'transformer', 10);
    assert.ok(items.length >= 5);
    assert.ok(items.every((i) => i.url.includes('reddit.com/r/')));
  });

  it('TC-RD6: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 3, categories: ['ml'] });
    assert.ok(items.length <= 3);
  });
});
