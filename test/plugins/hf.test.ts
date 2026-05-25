import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/hf.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: readFileSync(new URL('../fixtures/hf/papers.html', import.meta.url), 'utf-8'),
    finalUrl: 'https://huggingface.co/papers',
  }),
  log: makeLogger('info'),
};

describe('hf plugin', () => {
  it('TC-HF1: list returns >= 10 items from fixture', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(items.length >= 10, `Expected >= 10 items, got ${items.length}`);
  });

  it('TC-HF2: all items have title with length >= 10', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.title.length >= 10),
      'Some items have title shorter than 10 characters',
    );
  });

  it('TC-HF3: all items have absolute URL pointing to huggingface.co/papers', async () => {
    const items = await plugin.list(ctx, { limit: 20 });
    assert.ok(
      items.every((i) => i.url.startsWith('https://huggingface.co/papers/')),
      'Some items have URLs not starting with https://huggingface.co/papers/',
    );
  });

  it('TC-HF4: limit is respected', async () => {
    const items = await plugin.list(ctx, { limit: 5 });
    assert.ok(items.length <= 5, `Expected <= 5 items, got ${items.length}`);
  });

  it('TC-HF5: search returns items using same parser as list', async () => {
    assert.ok(plugin.search, 'plugin.search should be defined');
    const items = await plugin.search(ctx, 'attention', 10);
    assert.ok(items.length >= 1, `Expected >= 1 search result, got ${items.length}`);
  });

  it('TC-HF6: search respects limit', async () => {
    assert.ok(plugin.search, 'plugin.search should be defined');
    const items = await plugin.search(ctx, 'transformer', 3);
    assert.ok(items.length <= 3, `Expected <= 3 items, got ${items.length}`);
  });

  it('TC-HF7: search items have source=hf and valid URLs', async () => {
    assert.ok(plugin.search, 'plugin.search should be defined');
    const items = await plugin.search(ctx, 'diffusion', 10);
    assert.ok(
      items.every((i) => i.source === 'hf'),
      'Some items have wrong source',
    );
    assert.ok(
      items.every((i) => i.url.startsWith('https://huggingface.co/papers/')),
      'Some search items have invalid URLs',
    );
  });
});
