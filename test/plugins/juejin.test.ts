import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/juejin.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureFeed = JSON.parse(
  readFileSync(new URL('../fixtures/juejin/feed.json', import.meta.url), 'utf-8'),
) as unknown;

// juejin plugin does not call ctx.httpGet; ctx only needs to satisfy the Ctx type
const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({ status: 200, html: '', finalUrl: '' }),
  log: makeLogger('info'),
};

// Save and restore globalThis.fetch around each test
const orig = globalThis.fetch;

beforeEach(() => {
  // Cast via unknown — we only need .json() for the plugin, full Response not required
  (globalThis as unknown as { fetch: unknown }).fetch = async () => ({
    json: async () => fixtureFeed,
  });
});

afterEach(() => {
  globalThis.fetch = orig;
});

describe('juejin plugin', () => {
  it('TC-JJ1: list returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-JJ2: all item URLs contain juejin.cn/post/', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.includes('juejin.cn/post/')),
      'Some item URLs do not contain juejin.cn/post/',
    );
  });

  it('TC-JJ3: all items have non-empty title', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.title.length > 0),
      'Some items have empty title',
    );
  });

  it('TC-JJ4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});
