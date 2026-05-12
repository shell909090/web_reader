import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/oschina.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: readFileSync(new URL('../fixtures/oschina/news.html', import.meta.url), 'utf-8'),
    finalUrl: 'https://www.oschina.net/news',
  }),
  log: makeLogger('info'),
};

describe('oschina plugin', () => {
  it('TC-OS1: list returns >= 10 items from fixture', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-OS2: all items have title with length >= 8', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.title.length >= 8),
      'Some items have title shorter than 8 characters',
    );
  });

  it('TC-OS3: all items have URL matching oschina.net/news/digits pattern', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    const re = /oschina\.net\/news\/\d/;
    assert.ok(
      items.every((i) => re.test(i.url)),
      'Some items have URLs not matching oschina.net/news/<digits> pattern',
    );
  });

  it('TC-OS4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});
