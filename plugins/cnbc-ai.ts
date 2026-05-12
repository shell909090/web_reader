// CNBC AI news list plugin — HTTP-based (no browser needed; date-path links present in static HTML).

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const CNBC_BASE = 'https://www.cnbc.com';
const CNBC_AI_URL = `${CNBC_BASE}/ai-artificial-intelligence/`;

const ARTICLE_RE = /cnbc\.com\/\d{4}\/\d{2}\/\d{2}\//;

/** Parse CNBC AI page HTML into an Item list. */
function parseCnbcAiPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const href = anchor.attr('href') ?? '';
    if (!ARTICLE_RE.test(href)) return;
    if (seen.has(href)) return;

    const title = anchor.text().trim();
    if (title.length < 15) return;
    seen.add(href);

    items.push({ source: 'cnbc-ai', title, url: href, notes: 'CNBC AI' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'cnbc-ai',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching CNBC AI page', { url: CNBC_AI_URL });
    const { status, html } = await ctx.httpGet(CNBC_AI_URL);

    if (status !== 200) throw new Error(`CNBC AI returned HTTP ${status}`);

    const items = parseCnbcAiPage(html, opts.limit);
    if (items.length === 0) ctx.log.warn('cnbc-ai: 0 items — page structure may have changed');
    ctx.log.debug(`Parsed ${items.length} items from CNBC AI`);
    return items;
  },
};

export default plugin;
