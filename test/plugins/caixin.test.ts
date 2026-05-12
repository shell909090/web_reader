import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/caixin.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(new URL('../fixtures/caixin/list.html', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({ status: 200, html: fixtureHtml, finalUrl: 'https://www.caixin.com/' }),
  log: makeLogger('info'),
};

describe('caixin plugin', () => {
  it('TC-CX1: list returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 10, `Expected >= 10, got ${items.length}`);
  });

  it('TC-CX2: all urls contain caixin.com with date pattern', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => /caixin\.com\/\d{4}-\d{2}-\d{2}\//.test(i.url)));
  });

  it('TC-CX3: photo links are filtered out', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => !i.url.includes('photos.caixin.com')));
  });

  it('TC-CX4: notes contain date', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items[0].notes.includes('2026'));
  });

  it('TC-CX5: titles contain Chinese characters', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => /[一-鿿]/.test(i.title)));
  });

  it('TC-CX6: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5);
  });
});
