// HuggingFace Papers list plugin — HTTP-based, uses cheerio to parse the HF papers page.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const HF_BASE = 'https://huggingface.co';
const HF_PAPERS_URL = `${HF_BASE}/papers`;

// Match paper paths like /papers/2605.12345 (digit after /papers/)
const PAPER_PATH_RE = /\/papers\/\d/;

/** Parse HuggingFace papers page HTML into Item list, truncated to limit. */
function parseHFPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $('a[href^="/papers/"]').each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const href = anchor.attr('href') ?? '';

    if (!PAPER_PATH_RE.test(href)) return;

    const url = `${HF_BASE}${href}`;
    if (seen.has(url)) return;

    // Try direct text; fall back to a heading element inside the anchor
    let title = anchor.text().trim();
    if (title.length < 10) {
      const inner = anchor.find('h1, h2, h3, h4, [class*="title"], [class*="heading"]').first();
      if (inner.length) title = inner.text().trim();
    }
    // Only mark as seen after confirming we have a usable title, so a later
    // anchor for the same URL with better text can still be picked up.
    if (title.length < 10) return;
    seen.add(url);

    items.push({ source: 'hf', title, url, notes: 'HuggingFace Papers' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'hf',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching HuggingFace papers page', { url: HF_PAPERS_URL });
    const { status, html } = await ctx.httpGet(HF_PAPERS_URL);

    if (status !== 200) {
      throw new Error(`HuggingFace papers page returned HTTP ${status}`);
    }

    const items = parseHFPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from HuggingFace papers page`);
    return items;
  },

  async search(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
    const url = `${HF_PAPERS_URL}?q=${encodeURIComponent(query)}`;
    ctx.log.debug('Searching HuggingFace papers', { query, url });
    const { status, html } = await ctx.httpGet(url);

    if (status !== 200) {
      throw new Error(`HuggingFace papers search returned HTTP ${status}`);
    }

    const items = parseHFPage(html, limit);
    ctx.log.debug(`Found ${items.length} papers for query "${query}"`);
    return items;
  },
};

export default plugin;
