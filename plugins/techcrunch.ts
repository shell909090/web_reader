// TechCrunch list plugin — HTTP-based, uses cheerio to parse the TechCrunch homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const TC_HOME = 'https://techcrunch.com/';

/** Parse TechCrunch homepage HTML into Item list, truncated to limit. */
function parseTechCrunchPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();

  // Primary selector; fall back to article links containing a year path segment
  const primaryLinks = $('a.loop-card__title-link');
  const anchors =
    primaryLinks.length > 0 ? primaryLinks : $('article a[href*="techcrunch.com/202"]');

  anchors.each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const title = anchor.text().trim();
    const url = anchor.attr('href') ?? '';

    // Skip short or empty titles and duplicates
    if (title.length < 5 || !url || seen.has(url)) return;
    seen.add(url);

    // Try to read author and datetime from the card container
    const card = anchor.closest('article, .loop-card, [class*="loop-card"]');
    const author = card.find('.loop-card__author').first().text().trim();
    const datetime = card.find('time[datetime]').first().attr('datetime') ?? '';
    // Derive a short date string (YYYY-MM-DD) from datetime if available
    const dateStr = datetime ? datetime.slice(0, 10) : '';

    const parts: string[] = [];
    if (author) parts.push(author);
    if (dateStr) parts.push(dateStr);
    const notes = parts.length > 0 ? parts.join(' · ') : 'TechCrunch';

    items.push({ source: 'techcrunch', title, url, notes });
  });

  return items;
}

const plugin: Plugin = {
  id: 'techcrunch',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'http') throw new Error('techcrunch requires http mode');

    ctx.log.debug('Fetching TechCrunch homepage', { url: TC_HOME });
    const { status, html } = await ctx.httpGet(TC_HOME);

    if (status === 403 || (status >= 400 && status < 500)) {
      ctx.log.warn(`TechCrunch returned HTTP ${status} — possibly bot challenge, returning empty`);
      return [];
    }

    if (status !== 200) {
      throw new Error(`TechCrunch homepage returned HTTP ${status}`);
    }

    const items = parseTechCrunchPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from TechCrunch homepage`);
    return items;
  },
};

export default plugin;
