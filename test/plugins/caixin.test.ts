import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/caixin.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureHtml = readFileSync(new URL('../fixtures/caixin/list.html', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({ status: 200, html: fixtureHtml, finalUrl: 'https://www.caixin.com/' }),
  log: makeLogger('info'),
};

describe('caixin plugin', () => {
  it('TC-CX1: list returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 10, `Expected >= 10, got ${items.length}`);
  });

  it('TC-CX2: all urls contain caixin.com with date pattern', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => /caixin\.com\/\d{4}-\d{2}-\d{2}\//.test(i.url)));
  });

  it('TC-CX3: photo links are filtered out', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => !i.url.includes('photos.caixin.com')));
  });

  it('TC-CX4: notes contain date', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items[0].notes.includes('2026'));
  });

  it('TC-CX5: titles contain Chinese characters', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.every((i) => /[一-鿿]/.test(i.title)));
  });

  it('TC-CX6: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5);
  });

  it('excludes sidebar announcements, footer links and card navigation before applying the limit', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.equal(items.length, 12);
    assert.ok(items.every((i) => !/反侵权公告|固定栏目导航|使用声明/.test(i.title)));
    const limited = await plugin.list(ctx, { limit: 5 });
    assert.deepEqual(limited, items.slice(0, 5));
  });

  it('uses page structure rather than filtering headline keywords', async () => {
    const headline = '反侵权公告引发版权保护行业讨论';
    const html = `<div class="main_left"><div class="news_list"><dl><dd><p><a href="https://www.caixin.com/2026-10-27/102497850.html">${headline}</a></p></dd></dl></div></div>`;
    const items = await plugin.list(
      { ...ctx, httpGet: async () => ({ status: 200, html, finalUrl: 'https://www.caixin.com/' }) },
      { limit: 5 },
    );
    assert.deepEqual(
      items.map((i) => i.title),
      [headline],
    );
  });

  it('reports a missing news stream instead of falling back to whole-page links', async () => {
    const html =
      '<a href="https://www.caixin.com/2021-07-15/101740785.html">反侵权公告（第45号）</a>';
    const changed = {
      ...ctx,
      httpGet: async () => ({ status: 200, html, finalUrl: 'https://www.caixin.com/' }),
    };
    await assert.rejects(plugin.list(changed, { limit: 5 }), /news list contained no articles/);
    assert.deepEqual(await plugin.list(changed, { limit: 0 }), []);
  });
});
