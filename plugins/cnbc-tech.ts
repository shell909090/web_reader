// CNBC Technology list plugin — HTTP-based, uses cheerio to parse the CNBC tech page.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const CNBC_TECH_URL = 'https://www.cnbc.com/technology/';

// Match CNBC article URLs with a date path like /2026/05/12/
const CNBC_DATE_RE = /cnbc\.com\/\d{4}\/\d{2}\/\d{2}\//;

/** Parse CNBC Technology page HTML into Item list, truncated to limit. */
function parseCnbcTechPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const href = anchor.attr('href') ?? '';

    if (!CNBC_DATE_RE.test(href)) return;

    // href should already be absolute for CNBC
    const url = href;
    if (seen.has(url)) return;
    seen.add(url);

    const title = anchor.text().trim();
    if (title.length < 15) return;

    items.push({ source: 'cnbc-tech', title, url, notes: 'CNBC Technology' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'cnbc-tech',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'http') throw new Error('cnbc-tech requires http mode');

    ctx.log.debug('Fetching CNBC Technology page', { url: CNBC_TECH_URL });
    const { status, html } = await ctx.httpGet(CNBC_TECH_URL);

    if (status !== 200) {
      throw new Error(`CNBC Technology page returned HTTP ${status}`);
    }

    const items = parseCnbcTechPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from CNBC Technology page`);
    return items;
  },
};

export default plugin;
