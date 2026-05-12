// BBC News list plugin — HTTP-based, uses cheerio to parse the BBC News homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const BBC_BASE = 'https://www.bbc.com';
const BBC_HOME = `${BBC_BASE}/news`;

// BBC article URLs follow /news/articles/<hash> or /news/videos/<hash>
// Navigation section links like /news/us-canada, /news/world/africa are not articles.
const ARTICLE_PATH_RE = /\/news\/(articles|videos)\/[a-z0-9]+/;

/** Parse BBC News homepage HTML into Item list, truncated to limit. */
function parseBBCPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $('a[href^="/news/"]').each((_i, el) => {
    if (items.length >= limit) return false;

    const href = $(el).attr('href') ?? '';

    // Only keep actual article/video pages, skip all navigation links
    if (!ARTICLE_PATH_RE.test(href)) return;

    const url = `${BBC_BASE}${href}`;

    // Deduplicate by url
    if (seen.has(url)) return;
    seen.add(url);

    const title = $(el).text().trim().replace(/\s+/g, ' ');

    // Skip entries with very short or missing titles
    if (title.length < 5) return;

    items.push({ source: 'bbc', title, url, notes: 'BBC News' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'bbc',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'http') throw new Error('bbc requires http mode');

    ctx.log.debug('Fetching BBC News homepage', { url: BBC_HOME });
    const { status, html } = await ctx.httpGet(BBC_HOME);

    if (status !== 200) {
      throw new Error(`BBC News homepage returned HTTP ${status}`);
    }

    const items = parseBBCPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from BBC News homepage`);
    return items;
  },
};

export default plugin;
