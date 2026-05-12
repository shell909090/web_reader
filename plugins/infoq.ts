// InfoQ China list plugin — HTTP-based, uses cheerio to parse the InfoQ CN homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const INFOQ_HOME = 'https://www.infoq.cn/';
const INFOQ_BASE = 'https://www.infoq.cn';

// Matches infoq.cn/article/ or xie.infoq.cn/article/
const ARTICLE_RE = /infoq\.cn\/article\//;

/** True if the href looks like an InfoQ article link. */
function isArticleUrl(href: string): boolean {
  return ARTICLE_RE.test(href);
}

/** Resolve root-relative href to absolute URL. */
function resolveUrl(href: string): string {
  if (href.startsWith('/')) return `${INFOQ_BASE}${href}`;
  return href;
}

/** Parse InfoQ CN homepage HTML into an Item list. */
function parseInfoQPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const rawHref = anchor.attr('href') ?? '';
    const href = resolveUrl(rawHref);
    const title = anchor.text().trim();

    if (!isArticleUrl(href)) return;
    if (title.length < 8) return;
    if (seen.has(href)) return;
    seen.add(href);

    items.push({ source: 'infoq', title, url: href, notes: 'InfoQ' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'infoq',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'http') throw new Error('infoq requires http mode');

    ctx.log.debug('Fetching InfoQ CN homepage', { url: INFOQ_HOME });
    const { status, html } = await ctx.httpGet(INFOQ_HOME);

    if (status !== 200) throw new Error(`InfoQ CN returned HTTP ${status}`);

    const items = parseInfoQPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from InfoQ CN`);
    return items;
  },
};

export default plugin;
