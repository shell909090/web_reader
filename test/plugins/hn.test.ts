import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/hn.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: readFileSync(new URL('../fixtures/hn/list.html', import.meta.url), 'utf-8'),
    finalUrl: 'https://news.ycombinator.com/',
  }),
  log: makeLogger('info'),
};

describe('hn plugin', () => {
  it('TC-HN1: list returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-HN2: all items have non-empty title', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.title.length > 0),
      'Some items have empty title',
    );
  });

  it('TC-HN3: all items have absolute URL', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.startsWith('http')),
      'Some items have non-absolute URL',
    );
  });

  it('TC-HN4: all items have non-empty notes', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.notes.length > 0),
      'Some items have empty notes',
    );
  });

  it('TC-HN5: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});
