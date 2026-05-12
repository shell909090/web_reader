// Sina News list plugin — HTTP-based, uses cheerio to parse the Sina News homepage.
// GB2312 decoding is handled upstream by httpGet's TextDecoder, so html arrives as UTF-8 string.
// Sina's DOM classes change frequently; we rely on URL patterns instead of class selectors.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const SINA_HOME = 'https://news.sina.com.cn/';

// URL patterns that identify actual news articles (not navigation/section links)
const NEWS_URL_RE = /(?:\/doc-|\/article_|\/c\/|\/w\/|\/gov\/|\/zx\/|\/f\/|cj\.sina)/;

/** True if the href points to a Sina-family domain. */
function isSinaDomain(href: string): boolean {
  return /\.sina\.(?:com\.cn|cn)\//.test(href);
}

/** Normalise protocol-relative URLs to https. */
function normaliseUrl(href: string): string {
  return href.startsWith('//') ? `https:${href}` : href;
}

/** Parse Sina News homepage HTML into an Item list. */
function parseSinaPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const href = normaliseUrl(anchor.attr('href') ?? '');
    const title = anchor.text().trim();

    // Must be a Sina domain, look like a news article URL, and have a real title
    if (!isSinaDomain(href)) return;
    if (!NEWS_URL_RE.test(href)) return;
    if (title.length < 8) return;
    if (seen.has(href)) return;
    seen.add(href);

    items.push({ source: 'sina', title, url: href, notes: '新浪新闻' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'sina',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching Sina News homepage', { url: SINA_HOME });
    const { status, html } = await ctx.httpGet(SINA_HOME);

    if (status !== 200) throw new Error(`Sina News returned HTTP ${status}`);

    const items = parseSinaPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from Sina News`);
    return items;
  },
};

export default plugin;
