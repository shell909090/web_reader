// CSDN list plugin — HTTP-based, uses cheerio to parse the CSDN homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const CSDN_HOME = 'https://www.csdn.net/';

// Matches blog.csdn.net/<user>/article/<id>
const ARTICLE_RE = /blog\.csdn\.net\/.+\/article\//;

/** True if the href looks like a CSDN blog article link. */
function isArticleUrl(href: string): boolean {
  return ARTICLE_RE.test(href);
}

/** Parse CSDN homepage HTML into an Item list. */
function parseCSDNPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const href = anchor.attr('href') ?? '';
    const title = anchor.text().trim();

    if (!isArticleUrl(href)) return;
    if (title.length < 10) return;
    if (seen.has(href)) return;
    seen.add(href);

    items.push({ source: 'csdn', title, url: href, notes: 'CSDN' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'csdn',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'http') throw new Error('csdn requires http mode');

    ctx.log.debug('Fetching CSDN homepage', { url: CSDN_HOME });
    const { status, html } = await ctx.httpGet(CSDN_HOME);

    if (status !== 200) throw new Error(`CSDN returned HTTP ${status}`);

    const items = parseCSDNPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from CSDN`);
    return items;
  },
};

export default plugin;
