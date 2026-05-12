import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/csdn.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: readFileSync(new URL('../fixtures/csdn/list.html', import.meta.url), 'utf-8'),
    finalUrl: 'https://www.csdn.net/',
  }),
  log: makeLogger('info'),
};

describe('csdn plugin', () => {
  it('TC-CS1: list fixture returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-CS2: all urls match blog.csdn.net/.../article/ pattern', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => /blog\.csdn\.net\/.+\/article\//.test(i.url)),
      'Some items have URL not matching blog.csdn.net/.../article/',
    );
  });

  it('TC-CS3: titles are non-empty', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.title.length > 0),
      'Some items have empty title',
    );
  });

  it('TC-CS4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});
