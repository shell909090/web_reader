import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/yahoo.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixture = readFileSync(new URL('../fixtures/yahoo/list.html', import.meta.url), 'utf-8');
function context(html = fixture, status = 200): Ctx {
  return {
    mode: 'http',
    httpGet: async (url) => {
      assert.equal(url, 'https://finance.yahoo.com/news/');
      return { status, html, finalUrl: url };
    },
    log: makeLogger('info'),
  };
}

function card(href: string, title: string, extra = ''): string {
  return `<section data-testid="storyitem"><a href="${href}"><h3>${title}</h3></a>${extra}</section>`;
}

describe('yahoo plugin', () => {
  it('parses actual news stream cards, including new category article paths', async () => {
    const items = await plugin.list(context(), { limit: 50 });
    assert.equal(items.length, 15);
    assert.ok(items.every((i) => new URL(i.url).hostname === 'finance.yahoo.com'));
    assert.ok(items[0].url.includes('/economy/policy/articles/'));
    assert.ok(items[0].notes.includes('Fortune'));
    assert.equal(items[0].published_at, undefined);
  });

  it('respects the requested limit', async () => {
    assert.equal((await plugin.list(context(), { limit: 5 })).length, 5);
    assert.deepEqual(await plugin.list(context(), { limit: 0 }), []);
  });

  it('normalizes URLs, decodes text, deduplicates and excludes non-article links', async () => {
    const html =
      card('/news/story.html?tracking=1', 'Stocks &amp; bonds') +
      card('https://finance.yahoo.com/news/story.html#top', 'Duplicate headline') +
      card('https://example.com/news/story.html', 'External headline') +
      card('/quote/AAPL/', 'Stock quote') +
      card('http://[', 'Malformed URL') +
      card('javascript:alert(1)', 'Invalid scheme') +
      card('/news/short.html', 'Hi') +
      '<a href="/news/navigation.html">Navigation headline</a>';
    const items = await plugin.list(context(html), { limit: 50 });
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Stocks & bonds');
    assert.equal(items[0].url, 'https://finance.yahoo.com/news/story.html');
  });

  it('preserves summaries and absolute timestamps only when available', async () => {
    const html = card(
      '/news/story.html',
      'A market headline',
      '<p>A useful summary.</p><time datetime="2026-10-27T08:00:00Z"></time>',
    );
    const [item] = await plugin.list(context(html), { limit: 5 });
    assert.equal(item.summary, 'A useful summary.');
    assert.equal(item.published_at, '2026-10-27T08:00:00.000Z');
  });

  it('reports HTTP failures and unexpected page structure', async () => {
    for (const status of [403, 404, 429]) {
      await assert.rejects(
        plugin.list(context('', status), { limit: 5 }),
        new RegExp(`HTTP ${status}`),
      );
    }
    await assert.rejects(
      plugin.list(context('<html>Consent required</html>'), { limit: 5 }),
      /no articles/,
    );
  });
});
