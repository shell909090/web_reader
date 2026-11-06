import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/theverge.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureXml = readFileSync(new URL('../fixtures/theverge/feed.xml', import.meta.url), 'utf-8');

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: fixtureXml,
    finalUrl: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
  }),
  log: makeLogger('info'),
};

describe('theverge plugin', () => {
  it('TC-TV1: list returns >= 5 items', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 5, `Expected >= 5 items, got ${items.length}`);
  });

  it('TC-TV2: all urls contain theverge.com', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.includes('theverge.com')),
      'Some items have URLs that do not contain theverge.com',
    );
  });

  it('TC-TV3: notes are non-empty', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.notes.length > 0),
      'Some items have empty notes',
    );
  });
  it('reports an unavailable feed instead of returning an empty success', async () => {
    const unavailable: Ctx = {
      ...ctx,
      httpGet: async () => ({ status: 503, html: '', finalUrl: '' }),
    };
    await assert.rejects(plugin.list(unavailable, { limit: 5 }), /HTTP 503/);
  });

  it('respects the requested item limit', async () => {
    const items = await plugin.list(ctx, { limit: 1 });
    assert.equal(items.length, 1);
  });

  it('reads an Atom entry without a publication date using its fallback link', async () => {
    const minimal: Ctx = {
      ...ctx,
      httpGet: async () => ({
        status: 200,
        html: '<feed><entry><title>AI news</title><link href="https://www.theverge.com/ai"/></entry></feed>',
        finalUrl: '',
      }),
    };
    const items = await plugin.list(minimal, { limit: 5 });
    assert.equal(items.length, 1);
    assert.equal(items[0].url, 'https://www.theverge.com/ai');
    assert.ok(items[0].notes);
  });
});
