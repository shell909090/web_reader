import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/cnbc-ai.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(
  new URL('../fixtures/cnbc-ai/list.html', import.meta.url),
  'utf-8',
);

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({
    status: 200,
    html: fixtureHtml,
    finalUrl: 'https://www.cnbc.com/ai-artificial-intelligence/',
  }),
  log: makeLogger('info'),
};

describe('cnbc-ai plugin', () => {
  it('TC-CB1: list fixture returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-CB2: all urls contain cnbc.com', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.every((i) => i.url.includes('cnbc.com')));
  });

  it('TC-CB3: title is non-empty for all items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.every((i) => i.title.length > 0));
  });

  it('TC-CB4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5);
  });
});
