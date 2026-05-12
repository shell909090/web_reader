import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/cnbc-tech.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: readFileSync(new URL('../fixtures/cnbc-tech/list.html', import.meta.url), 'utf-8'),
    finalUrl: 'https://www.cnbc.com/technology/',
  }),
  log: makeLogger('info'),
};

describe('cnbc-tech plugin', () => {
  it('TC-CT1: list returns >= 10 items from fixture', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-CT2: all items have title with length >= 15', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.title.length >= 15),
      'Some items have title shorter than 15 characters',
    );
  });

  it('TC-CT3: all items have absolute URL matching cnbc.com date path pattern', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    const re = /cnbc\.com\/\d{4}\/\d{2}\/\d{2}\//;
    assert.ok(
      items.every((i) => re.test(i.url)),
      'Some items have URLs not matching cnbc.com/YYYY/MM/DD/ pattern',
    );
  });

  it('TC-CT4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});
