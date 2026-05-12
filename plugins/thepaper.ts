// ThePaper (澎湃新闻) plugin — parses the breaking news list page.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const LIST_URL = 'https://www.thepaper.cn/list_25428';
const BASE = 'https://www.thepaper.cn';

const ARTICLE_RE = /\/newsDetail_forward_\d+/;

function parsePage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const href = $(el).attr('href') ?? '';
    if (!ARTICLE_RE.test(href)) return;

    const url = href.startsWith('http') ? href : `${BASE}${href}`;
    if (seen.has(url)) return;

    const title = $(el).text().trim().replace(/\s+/g, ' ');
    if (title.length < 6) return;

    seen.add(url);
    items.push({ source: 'thepaper', title, url, notes: '澎湃新闻' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'thepaper',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching ThePaper breaking news', { url: LIST_URL });
    const { status, html } = await ctx.httpGet(LIST_URL);

    if (status !== 200) throw new Error(`ThePaper returned HTTP ${status}`);

    const items = parsePage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from ThePaper`);
    return items;
  },
};

export default plugin;
