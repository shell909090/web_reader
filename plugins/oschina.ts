// OSCHINA news list plugin — HTTP-based, uses cheerio to parse the OSCHINA news page.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const OSCHINA_NEWS_URL = 'https://www.oschina.net/news';

// Match OSCHINA news article URLs like https://www.oschina.net/news/439526/title
const NEWS_URL_RE = /oschina\.net\/news\/\d/;

/** Parse OSCHINA news page HTML into Item list, truncated to limit. */
function parseOSCHINAPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const href = anchor.attr('href') ?? '';

    if (!NEWS_URL_RE.test(href)) return;

    // Deduplicate by URL
    const url = href;
    if (seen.has(url)) return;
    seen.add(url);

    const title = anchor.text().trim();
    if (title.length < 8) return;

    items.push({ source: 'oschina', title, url, notes: 'OSCHINA' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'oschina',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'http') throw new Error('oschina requires http mode');

    ctx.log.debug('Fetching OSCHINA news page', { url: OSCHINA_NEWS_URL });
    const { status, html } = await ctx.httpGet(OSCHINA_NEWS_URL);

    if (status !== 200) {
      throw new Error(`OSCHINA news page returned HTTP ${status}`);
    }

    const items = parseOSCHINAPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from OSCHINA news page`);
    return items;
  },
};

export default plugin;
