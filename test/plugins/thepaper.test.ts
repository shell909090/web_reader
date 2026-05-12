import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/thepaper.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(
  new URL('../fixtures/thepaper/list.html', import.meta.url),
  'utf-8',
);

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({
    status: 200,
    html: fixtureHtml,
    finalUrl: 'https://www.thepaper.cn/list_25428',
  }),
  log: makeLogger('info'),
};

describe('thepaper plugin', () => {
  it('TC-TP1: list returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 10, `Expected >= 10, got ${items.length}`);
  });

  it('TC-TP2: all urls contain thepaper.cn/newsDetail', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.url.includes('thepaper.cn/newsDetail_forward_')));
  });

  it('TC-TP3: short titles and non-article links are filtered', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.title.length >= 6));
    assert.ok(items.every((i) => !i.url.includes('channel')));
  });

  it('TC-TP4: titles contain Chinese characters', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => /[一-鿿]/.test(i.title)));
  });

  it('TC-TP5: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5);
  });
});
