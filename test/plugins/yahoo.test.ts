import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/yahoo.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureXml = readFileSync(new URL('../fixtures/yahoo/feed.xml', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({
    status: 200,
    html: fixtureXml,
    finalUrl: 'https://finance.yahoo.com/news/rssindex',
  }),
  log: makeLogger('info'),
};

describe('yahoo plugin', () => {
  it('TC-YF1: list returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 10, `Expected >= 10, got ${items.length}`);
  });

  it('TC-YF2: all urls contain finance.yahoo.com', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.url.includes('finance.yahoo.com')));
  });

  it('TC-YF3: notes include Yahoo Finance and date', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items[0].notes.startsWith('Yahoo Finance'));
    assert.ok(items[0].notes.includes('2026'));
  });

  it('TC-YF4: summary field is populated', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.some((i) => i.summary && String(i.summary).length > 10));
  });

  it('TC-YF5: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5);
  });
});
