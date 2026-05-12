import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/cnbc-ai.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(
  new URL('../fixtures/cnbc-ai/list.html', import.meta.url),
  'utf-8',
);

const mockPage = {
  goto: async () => {},
  waitForSelector: async () => {},
  content: async () => fixtureHtml,
};

const ctx: Ctx = {
  mode: 'browser',
  page: mockPage as unknown as import('playwright').Page,
  log: makeLogger('info'),
};

describe('cnbc-ai plugin', () => {
  it('TC-CB1: list fixture returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-CB2: all urls contain cnbc.com', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.includes('cnbc.com')),
      'Some items have URLs not containing cnbc.com',
    );
  });

  it('TC-CB3: title is non-empty for all items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.title.length > 0),
      'Some items have empty titles',
    );
  });

  it('TC-CB4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});
