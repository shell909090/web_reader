// Xinhua News (新华网) plugin — scrapes news.cn homepage HTML.
// (RSS feeds at xinhuanet.com are stale since 2022; news.cn HTML has current content.)

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const HOME_URL = 'https://www.news.cn/';

// news.cn article URL: /section/YYYYMMDD/{hash}/c or /section/YYYYMMDD/{hash}/c.html
const ARTICLE_RE = /news\.cn\/.+\/\d{8}\//;

function parsePage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const href = $(el).attr('href') ?? '';
    if (!ARTICLE_RE.test(href)) return;
    if (seen.has(href)) return;

    const title = $(el).text().trim().replace(/\s+/g, ' ');
    if (title.length < 6) return;

    seen.add(href);

    // Extract date from URL
    const date = href.match(/\/(\d{4})(\d{2})(\d{2})\//);
    const notes = date ? `新华社 · ${date[1]}-${date[2]}-${date[3]}` : '新华社';

    items.push({ source: 'xinhua', title, url: href, notes });
  });

  return items;
}

const plugin: Plugin = {
  id: 'xinhua',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching Xinhua homepage', { url: HOME_URL });
    const { status, html } = await ctx.httpGet(HOME_URL);

    if (status !== 200) throw new Error(`Xinhua returned HTTP ${status}`);

    const items = parsePage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from Xinhua`);
    return items;
  },
};

export default plugin;
