import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/ars.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(new URL('../fixtures/ars/list.html', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: fixtureHtml,
    finalUrl: 'https://arstechnica.com/',
  }),
  log: makeLogger('info'),
};

describe('ars plugin', () => {
  it('TC-ARS1: list fixture returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-ARS2: all urls match arstechnica.com/channel/YYYY/MM/', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    const pattern = /arstechnica\.com\/\w+\/\d{4}\/\d{2}\//;
    assert.ok(
      items.every((i) => pattern.test(i.url)),
      'Some items have URLs that do not match the expected pattern',
    );
  });

  it('TC-ARS3: notes are non-empty', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.notes.length > 0),
      'Some items have empty notes',
    );
  });

  it('TC-ARS4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});
