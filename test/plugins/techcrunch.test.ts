import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/techcrunch.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: readFileSync(new URL('../fixtures/techcrunch/list.html', import.meta.url), 'utf-8'),
    finalUrl: 'https://techcrunch.com/',
  }),
  log: makeLogger('info'),
};

describe('techcrunch plugin', () => {
  it('TC-TC1: list fixture returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-TC2: all urls are absolute https addresses', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.startsWith('https://')),
      'Some items have non-absolute or non-https URL',
    );
  });

  it('TC-TC3: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });

  it('TC-TC4: notes are non-empty', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.notes.length > 0),
      'Some items have empty notes',
    );
  });
});
