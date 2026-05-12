import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/huggingface.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const ctx: Ctx = {
  mode: 'http',
  httpGet: async (_url: string) => ({
    status: 200,
    html: readFileSync(new URL('../fixtures/huggingface/papers.html', import.meta.url), 'utf-8'),
    finalUrl: 'https://huggingface.co/papers',
  }),
  log: makeLogger('info'),
};

describe('huggingface plugin', () => {
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
});
