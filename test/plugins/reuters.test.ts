import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/reuters.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(
  new URL('../fixtures/reuters/list.html', import.meta.url),
  'utf-8',
);

// Construct a mock Playwright page that returns the fixture HTML
const mockPage = {
  goto: async (_url: string, _opts?: unknown) => {},
  waitForSelector: async (_sel: string, _opts?: unknown) => {},
  content: async () => fixtureHtml,
};

const ctx: Ctx = {
  mode: 'browser',
  page: mockPage as unknown as import('playwright').Page, // structural mock
  log: makeLogger('info'),
};

describe('reuters plugin', () => {
  it('TC-RT1: list returns >= 10 items from fixture', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-RT2: all urls are absolute Reuters URLs', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.startsWith('https://www.reuters.com')),
      `Some items have non-absolute or non-reuters URL: ${items.map((i) => i.url).join(', ')}`,
    );
  });

  it('TC-RT3: all titles are non-empty', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.title.length > 0),
      'Some items have an empty title',
    );
  });

  it('TC-RT4: limit is respected (limit=5 returns <= 5 items)', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});
