import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/nytimes.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureXml = readFileSync(new URL('../fixtures/nytimes/feed.xml', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({ status: 200, html: fixtureXml, finalUrl: 'https://cn.nytimes.com/rss/' }),
  log: makeLogger('info'),
};

describe('nytimes plugin', () => {
  it('TC-NYT1: list returns >= 10 items from RSS fixture', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-NYT2: all urls point to cn.nytimes.com', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.every((i) => i.url.includes('cn.nytimes.com')));
  });

  it('TC-NYT3: titles contain Chinese characters', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length > 0);
    assert.ok(items.every((i) => /[一-鿿]/.test(i.title)));
  });

  it('TC-NYT4: notes include pubDate year', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items[0].notes.includes('纽约时报中文网'));
    assert.ok(items[0].notes.includes('2026'));
  });

  it('TC-NYT5: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5);
  });
});
