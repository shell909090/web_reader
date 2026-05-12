import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/wikipedia.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(
  new URL('../fixtures/wikipedia/main.html', import.meta.url),
  'utf-8',
);

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: fixtureHtml,
    finalUrl: 'https://en.wikipedia.org/wiki/Main_Page',
  }),
  log: makeLogger('info'),
};

describe('wikipedia plugin', () => {
  it('TC-WIKI1: list returns >= 5 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 5, `Expected >= 5 items, got ${items.length}`);
  });

  it('TC-WIKI2: all items have url containing en.wikipedia.org', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.includes('en.wikipedia.org')),
      'Some items have URL not containing en.wikipedia.org',
    );
  });

  it('TC-WIKI3: all items have non-empty title', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length > 0, 'No items returned');
    assert.ok(
      items.every((i) => i.title.length > 0),
      'Some items have empty title',
    );
  });

  it('TC-WIKI4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 3 });
    assert.ok(items.length <= 3, `Expected <= 3 items, got ${items.length}`);
  });
});
