// Sina News list plugin — HTTP-based, uses cheerio to parse the Sina News homepage.
// GB2312 decoding is handled upstream by httpGet's TextDecoder, so html arrives as UTF-8 string.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const SINA_HOME = 'https://news.sina.com.cn/';

/** Normalise a potentially protocol-relative URL to https. */
function normaliseUrl(href: string): string {
  if (href.startsWith('//')) return `https:${href}`;
  return href;
}

/** Parse Sina News homepage HTML into Item list, truncated to limit. */
function parseSinaPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();

  // Candidate selectors in priority order; we collect from all and deduplicate
  const selectorGroups = [
    '.news-item h2 a',
    '.uni-blk-list a',
    'a[href*=".sina.com.cn/"]',
  ] as const;

  for (const sel of selectorGroups) {
    $(sel).each((_i, el) => {
      if (items.length >= limit) return false;

      const anchor = $(el);
      const title = anchor.text().trim();
      let href = anchor.attr('href') ?? '';

      // Only keep links that point to Sina domains
      if (!href.includes('.sina.com.cn/')) return;
      href = normaliseUrl(href);

      // Skip very short titles or duplicates
      if (title.length < 3 || seen.has(href)) return;
      seen.add(href);

      // Attempt to find a channel or time label near the link
      const container = anchor.closest('li, .news-item, [class*="item"], [class*="list"]');
      const timeEl = container.find('time, .time, [class*="time"]').first().text().trim();
      const channelEl = container.find('.channel, [class*="channel"], .tag').first().text().trim();

      const parts: string[] = [];
      if (channelEl) parts.push(channelEl);
      if (timeEl) parts.push(timeEl);
      const notes = parts.length > 0 ? parts.join(' · ') : '新浪新闻';

      items.push({ source: 'sina', title, url: href, notes });
    });

    if (items.length >= limit) break;
  }

  return items;
}

const plugin: Plugin = {
  id: 'sina',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'http') throw new Error('sina requires http mode');

    ctx.log.debug('Fetching Sina News homepage', { url: SINA_HOME });
    const { status, html } = await ctx.httpGet(SINA_HOME);

    if (status !== 200) {
      throw new Error(`Sina News homepage returned HTTP ${status}`);
    }

    const items = parseSinaPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from Sina News homepage`);
    return items;
  },
};

export default plugin;
