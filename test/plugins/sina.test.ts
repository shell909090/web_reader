import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/sina.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: readFileSync(new URL('../fixtures/sina/list.html', import.meta.url), 'utf-8'),
    finalUrl: 'https://news.sina.com.cn/',
  }),
  log: makeLogger('info'),
};

/** Returns true if the string contains at least one CJK character. */
function hasChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

describe('sina plugin', () => {
  it('TC-SN1: list fixture returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-SN2: all urls contain sina.com.cn', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.includes('sina.com.cn')),
      'Some items have URL not containing sina.com.cn',
    );
  });

  it('TC-SN3: titles contain Chinese characters', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => hasChinese(i.title)),
      'Some items have title without Chinese characters',
    );
  });

  it('TC-SN4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});
