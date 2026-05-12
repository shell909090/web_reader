// NYTimes Chinese edition plugin — HTTP-based, uses cheerio to parse the homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const NYT_CN_BASE = 'https://cn.nytimes.com';
const NYT_CN_HOME = `${NYT_CN_BASE}/`;

// Relative href pattern: /section/YYYYMMDD/slug/
const DATE_HREF_RE = /^\/\w+\/\d{8}\//;

/** Parse NYTimes Chinese homepage HTML into Item list, deduplicated and truncated to limit. */
function parseNYTimesPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const href = $(el).attr('href') ?? '';
    if (!DATE_HREF_RE.test(href)) return;

    const title = $(el).text().trim();
    if (title.length < 8) return;

    const url = `${NYT_CN_BASE}${href}`;
    if (seen.has(url)) return;
    seen.add(url);

    items.push({ source: 'nytimes', title, url, notes: '纽约时报中文网' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'nytimes',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching NYTimes Chinese homepage', { url: NYT_CN_HOME });
    const { status, html } = await ctx.httpGet(NYT_CN_HOME);

    if (status !== 200) {
      throw new Error(`NYTimes Chinese homepage returned HTTP ${status}`);
    }

    const items = parseNYTimesPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from NYTimes Chinese homepage`);
    return items;
  },
};

export default plugin;
