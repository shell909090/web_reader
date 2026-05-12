import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/xinhua.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(new URL('../fixtures/xinhua/feed.xml', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({ status: 200, html: fixtureHtml, finalUrl: 'https://www.news.cn/' }),
  log: makeLogger('info'),
};

describe('xinhua plugin', () => {
  it('TC-XH1: list returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 10, `Expected >= 10, got ${items.length}`);
  });

  it('TC-XH2: all urls contain news.cn with date pattern', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => /news\.cn\/.+\/\d{8}\//.test(i.url)));
  });

  it('TC-XH3: notes contain 新华社 and date', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.notes.startsWith('新华社')));
    assert.ok(items[0].notes.includes('2026'));
  });

  it('TC-XH4: nav links and short titles are filtered', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.title.length >= 6));
    assert.ok(items.every((i) => /\d{8}/.test(i.url)));
  });

  it('TC-XH5: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5);
  });
});
