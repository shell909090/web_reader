import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from '../../plugins/polymarket.ts';
import { makeLogger } from '../../lib.ts';
import type { Ctx } from '../../lib.ts';

const fixtureJson = readFileSync(
  new URL('../fixtures/polymarket/list.json', import.meta.url),
  'utf-8',
);

const ctx: Ctx = {
  mode: 'http',
  httpGet: async () => ({
    status: 200,
    html: fixtureJson,
    finalUrl: 'https://gamma-api.polymarket.com/markets',
  }),
  log: makeLogger('warn'),
};

describe('polymarket plugin', () => {
  it('TC-PM1: list returns 3 items with required fields', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.strictEqual(items.length, 3, `Expected 3 items, got ${items.length}`);
    for (const item of items) {
      assert.strictEqual(
        item.source,
        'polymarket',
        `source should be 'polymarket', got '${item.source}'`,
      );
      assert.ok(item.title && item.title.length > 0, 'title should be non-empty');
      assert.ok(
        item.url.startsWith('https://polymarket.com/event/'),
        `url "${item.url}" should start with 'https://polymarket.com/event/'`,
      );
      assert.ok(item.notes && item.notes.length > 0, 'notes should be non-empty');
    }
  });

  it('TC-PM2: URL is built correctly from slug', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    assert.ok(items.length >= 1, 'Expected at least one item');
    // First fixture slug: will-the-us-federal-reserve-cut-interest-rates-before-end-of-2026
    assert.strictEqual(
      items[0].url,
      'https://polymarket.com/event/will-the-us-federal-reserve-cut-interest-rates-before-end-of-2026',
    );
  });

  it('TC-PM3: notes contains volume formatted with M/K suffix', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    // First item has volumeNum 5200000.5 → should appear as something like "5.2M"
    assert.ok(
      items[0].notes.includes('M') || items[0].notes.includes('K'),
      `notes "${items[0].notes}" should contain M or K volume suffix`,
    );
    // Second item has volumeNum 890000.0 → should appear as something like "890K"
    assert.ok(
      items[1].notes.includes('M') || items[1].notes.includes('K'),
      `notes "${items[1].notes}" should contain M or K volume suffix`,
    );
    // Third item has volumeNum 12000.0 → should appear as something like "12K"
    assert.ok(
      items[2].notes.includes('K'),
      `notes "${items[2].notes}" should contain K volume suffix`,
    );
  });

  it('TC-PM4: notes contains Yes probability percentage', async () => {
    const items = await plugin.list(ctx, { limit: 50 });
    // First fixture item has Yes price 0.72 → should show 72.0%
    assert.ok(
      items[0].notes.includes('72.0%'),
      `notes "${items[0].notes}" should contain Yes probability "72.0%"`,
    );
    // Second fixture item has Yes price 0.41 → should show 41.0%
    assert.ok(
      items[1].notes.includes('41.0%'),
      `notes "${items[1].notes}" should contain Yes probability "41.0%"`,
    );
  });

  it('TC-PM5: limit is respected (limit=2 → ≤2 items)', async () => {
    const items = await plugin.list(ctx, { limit: 2 });
    assert.ok(items.length <= 2, `Expected <= 2 items, got ${items.length}`);
  });

  it('TC-PM6: detail() returns non-empty Markdown string', async () => {
    const md = await plugin.detail!(ctx, {
      source: 'polymarket',
      title: '',
      url: 'https://polymarket.com/event/will-the-us-federal-reserve-cut-interest-rates-before-end-of-2026',
      notes: '',
    });
    assert.ok(md && md.length > 0, 'detail() should return a non-empty string');
  });

  it('TC-PM7: detail() Markdown contains question as heading', async () => {
    const md = await plugin.detail!(ctx, {
      source: 'polymarket',
      title: '',
      url: 'https://polymarket.com/event/will-the-us-federal-reserve-cut-interest-rates-before-end-of-2026',
      notes: '',
    });
    assert.ok(
      md.includes('# Will the US Federal Reserve cut interest rates before end of 2026?'),
      `Markdown should contain question heading, got:\n${md.slice(0, 200)}`,
    );
  });

  it('TC-PM8: detail() Markdown contains Outcomes section with Yes probability', async () => {
    const md = await plugin.detail!(ctx, {
      source: 'polymarket',
      title: '',
      url: 'https://polymarket.com/event/will-the-us-federal-reserve-cut-interest-rates-before-end-of-2026',
      notes: '',
    });
    assert.ok(md.includes('## Outcomes'), 'Markdown should contain Outcomes section');
    assert.ok(md.includes('Yes'), 'Outcomes section should include Yes outcome');
    assert.ok(md.includes('72.0%'), 'Outcomes section should include Yes probability 72.0%');
  });
});
