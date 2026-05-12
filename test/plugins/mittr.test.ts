import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/mittr.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureXml = readFileSync(new URL('../fixtures/mittr/feed.xml', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({
    status: 200,
    html: fixtureXml,
    finalUrl: 'https://www.technologyreview.com/feed/',
  }),
  log: makeLogger('info'),
};

describe('mittr plugin', () => {
  it('TC-MITTR1: list returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 10, `Expected >= 10, got ${items.length}`);
  });

  it('TC-MITTR2: all urls point to technologyreview.com', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.url.includes('technologyreview.com')));
  });

  it('TC-MITTR3: notes include MIT TR and pubDate', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items[0].notes.startsWith('MIT TR'));
    assert.ok(items[0].notes.includes('2026'));
  });

  it('TC-MITTR4: summary field is populated', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.some((i) => i.summary && String(i.summary).length > 10));
  });

  it('TC-MITTR5: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 3 });
    assert.ok(items.length <= 3);
  });
});
