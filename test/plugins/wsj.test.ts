import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/wsj.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureXml = readFileSync(new URL('../fixtures/wsj/feed.xml', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({ status: 200, html: fixtureXml, finalUrl: 'https://feeds.a.dj.com/rss/' }),
  log: makeLogger('info'),
};

describe('wsj plugin', () => {
  it('TC-WSJ1: list with default categories returns items', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-WSJ2: all urls contain wsj.com', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.url.includes('wsj.com')));
  });

  it('TC-WSJ3: single category markets returns items', async () => {
    const items = await plugin.list(ctx, { limit: 50, categories: ['markets'] });
    assert.ok(items.length > 0);
  });

  it('TC-WSJ4: notes include WSJ and pubDate', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items[0].notes.startsWith('WSJ'));
    assert.ok(items[0].notes.includes('2026'));
  });

  it('TC-WSJ5: summary field is populated', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.filter((i) => i.summary).length > 0);
  });

  it('TC-WSJ6: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5);
  });

  it('TC-WSJ7: plugin exposes categories metadata', () => {
    assert.ok(plugin.categories !== undefined);
    assert.ok('markets' in plugin.categories!);
    assert.ok('world' in plugin.categories!);
  });
});
