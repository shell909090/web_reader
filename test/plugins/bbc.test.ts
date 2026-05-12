import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/bbc.ts';
import { makeLogger, extractMarkdown } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const listHtml = readFileSync(new URL('../fixtures/bbc/list.html', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: listHtml,
    finalUrl: 'https://www.bbc.com/news',
  }),
  log: makeLogger('info'),
};

describe('bbc plugin', () => {
  it('TC-BBC1: list returns >= 10 items from fixture', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-BBC2: all urls are absolute bbc news paths', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.startsWith('https://www.bbc.com/news/')),
      'Some items have non-absolute or non-bbc-news URL',
    );
  });

  it('TC-BBC3: noise links (/live/ /video/ /av/) are filtered out', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    const noisePatterns = ['/live/', '/video/', '/av/'];
    const noisy = items.filter((i) => noisePatterns.some((p) => i.url.includes(p)));
    assert.strictEqual(
      noisy.length,
      0,
      `Expected no noise links, found: ${noisy.map((i) => i.url).join(', ')}`,
    );
  });

  it('TC-BBC4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });

  it('TC-BBC5: detail fixture produces markdown > 200 characters', () => {
    const html = readFileSync(new URL('../fixtures/bbc/detail.html', import.meta.url), 'utf-8');
    const md = extractMarkdown(html, 'https://www.bbc.com/news/test');
    assert.ok(md.length > 200, `Expected markdown > 200 chars, got ${md.length}`);
  });
});
