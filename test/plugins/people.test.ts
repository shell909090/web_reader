import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/people.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: readFileSync(new URL('../fixtures/people/list.html', import.meta.url), 'utf-8'),
    finalUrl: 'https://www.people.com.cn/',
  }),
  log: makeLogger('info'),
};

describe('people plugin', () => {
  it('TC-PD1: list fixture returns >= 10 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-PD2: all urls contain .people.com.cn/', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => /\.people\.com\.cn\//.test(i.url)),
      'Some items have URL not matching .people.com.cn/',
    );
  });

  it('TC-PD3: titles are non-empty', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.title.length > 0),
      'Some items have empty title',
    );
  });

  it('TC-PD4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });
});

it('ignores hidden ancestors and links before deduplication and limiting', async () => {
  const link = (id: number, title = 'Visible news article'): string =>
    `<a href="https://politics.people.com.cn/n1/2026/1108/c1-${id}.html">${title}</a>`;
  const html = `<div id="retired" style="display:none;">${link(1, 'Hidden duplicate article')}<section>${link(2)}</section></div>
    <div style="color:red; DISPLAY : none !important">${link(3)}</div>
    <div hidden>${link(4)}</div>
    <a style="display: none" href="https://politics.people.com.cn/n1/2026/1108/c1-5.html">Hidden direct article</a>
    <div style="display:block">${link(1)}${link(6)}</div>
    <div style="--display:none">${link(7)}</div>`;
  const local: Ctx = {
    ...ctx,
    httpGet: async () => ({ status: 200, html, finalUrl: 'https://www.people.com.cn/' }),
  };
  const items = await plugin.list(local, { limit: 10 });
  assert.deepEqual(
    items.map((item) => item.url.split('-').pop()),
    ['1.html', '6.html', '7.html'],
  );
  assert.equal(items[0].title, 'Visible news article');
  assert.deepEqual(await plugin.list(local, { limit: 2 }), items.slice(0, 2));
});
