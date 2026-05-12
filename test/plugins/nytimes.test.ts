import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/nytimes.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(
  new URL('../fixtures/nytimes/list.html', import.meta.url),
  'utf-8',
);

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: fixtureHtml,
    finalUrl: 'https://cn.nytimes.com/',
  }),
  log: makeLogger('info'),
};

describe('nytimes plugin', () => {
  it('TC-NYT1: list returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-NYT2: all items have url containing cn.nytimes.com', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.includes('cn.nytimes.com')),
      'Some items have URL not containing cn.nytimes.com',
    );
  });

  it('TC-NYT3: all items have Chinese title (at least one CJK character)', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length > 0, 'No items returned');
    const CJK_RE = /[一-鿿]/;
    assert.ok(
      items.every((i) => CJK_RE.test(i.title)),
      'Some items have title without Chinese characters',
    );
  });

  it('TC-NYT4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});
