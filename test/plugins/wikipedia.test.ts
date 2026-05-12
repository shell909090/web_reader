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
  httpGet: async () => ({
    status: 200,
    html: fixtureHtml,
    finalUrl: 'https://en.wikipedia.org/wiki/Portal:Current_events',
  }),
  log: makeLogger('info'),
};

describe('wikipedia plugin', () => {
  it('TC-WIKI1: list returns >= 8 items from fixture (2 days × categories)', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 8, `Expected >= 8 items, got ${items.length}`);
  });

  it('TC-WIKI2: all urls point to en.wikipedia.org/wiki/', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.startsWith('https://en.wikipedia.org/wiki/')),
      'Some items have unexpected URL',
    );
  });

  it('TC-WIKI3: notes contains Wikipedia and date and category', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length > 0);
    const first = items[0];
    assert.ok(first.notes.includes('Wikipedia'));
    assert.ok(first.notes.includes('May'));
  });

  it('TC-WIKI4: summary field is populated', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    const withSummary = items.filter((i) => i.summary && String(i.summary).length > 10);
    assert.ok(withSummary.length > 0, 'Expected at least some items to have a summary');
  });

  it('TC-WIKI5: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 3 });
    assert.ok(items.length <= 3, `Expected <= 3 items, got ${items.length}`);
  });
});
