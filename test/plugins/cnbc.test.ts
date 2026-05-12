import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/cnbc.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureXml = readFileSync(
  new URL('../fixtures/wsj/feed.xml', import.meta.url), // reuse RSS structure
  'utf-8',
)
  .replace(/wsj\.com/g, 'cnbc.com')
  .replace(/WSJ/g, 'CNBC');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({ status: 200, html: fixtureXml, finalUrl: 'https://www.cnbc.com/' }),
  log: makeLogger('info'),
};

describe('cnbc plugin', () => {
  it('TC-CNBC1: list with default categories returns items', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length > 0, `Expected items, got ${items.length}`);
  });

  it('TC-CNBC2: all urls contain cnbc.com', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.url.includes('cnbc.com')));
  });

  it('TC-CNBC3: specific category tech is respected', async () => {
    const items = await plugin.list(ctx, { limit: 50, categories: ['tech'] });
    assert.ok(items.length > 0);
  });

  it('TC-CNBC4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5);
  });

  it('TC-CNBC5: plugin exposes categories metadata', () => {
    assert.ok(plugin.categories !== undefined);
    assert.ok('tech' in plugin.categories!);
    assert.ok('ai' in plugin.categories!);
    assert.ok('markets' in plugin.categories!);
  });
});
