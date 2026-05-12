import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/zhwiki.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(new URL('../fixtures/zhwiki/main.html', import.meta.url), 'utf-8');

const searchFixture = JSON.stringify({
  query: {
    search: [
      { title: '人工智能', snippet: '人工智能（AI）是计算机科学的一个分支...', pageid: 1 },
      { title: '机器学习', snippet: '机器学习是人工智能的子领域...', pageid: 2 },
      { title: '深度学习', snippet: '深度学习使用多层神经网络...', pageid: 3 },
    ],
  },
});

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (url: string) => {
    if (url.includes('api.php')) return { status: 200, html: searchFixture, finalUrl: url };
    return { status: 200, html: fixtureHtml, finalUrl: url };
  },
  log: makeLogger('info'),
};

describe('zhwiki plugin', () => {
  it('TC-ZW1: list returns >= 8 items from fixture', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 8, `Expected >= 8, got ${items.length}`);
  });

  it('TC-ZW2: all urls point to zh.wikipedia.org/wiki/', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.url.startsWith('https://zh.wikipedia.org/wiki/')));
  });

  it('TC-ZW3: notes contain 维基百科 and date', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.notes.includes('维基百科')));
    assert.ok(items[0].notes.includes('5月'));
  });

  it('TC-ZW4: source field is zhwiki', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => i.source === 'zhwiki'));
  });

  it('TC-ZW5: search returns items with zh.wikipedia.org urls', async () => {
    const items = await plugin.search!(ctx, '人工智能', 5);
    assert.ok(items.length >= 3);
    assert.ok(items.every((i) => i.url.includes('zh.wikipedia.org')));
    assert.ok(items.every((i) => i.source === 'zhwiki'));
  });

  it('TC-ZW6: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 3 });
    assert.ok(items.length <= 3);
  });
});
