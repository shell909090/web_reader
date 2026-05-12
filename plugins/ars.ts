// Ars Technica list plugin — HTTP-based, uses cheerio to parse the homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const ARS_HOME = 'https://arstechnica.com/';

// Matches article URLs with a channel and year/month path, e.g. /security/2026/05/...
const ARTICLE_PATH_RE = /arstechnica\.com\/(\w+)\/\d{4}\/\d{2}\//;

/** Parse Ars Technica homepage HTML into Item list, truncated to limit. */
function parseArsPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const href = $(el).attr('href') ?? '';
    const match = ARTICLE_PATH_RE.exec(href);
    if (!match) return;

    const url = href;
    if (seen.has(url)) return;

    const title = $(el).text().trim();
    if (title.length < 10) return;

    seen.add(url);

    const channel = match[1];

    // Summary and date live in the card container around the title link
    const card = $(el).closest('div.grow, li, article');
    const summary = card.find('p').first().text().trim().replace(/\s+/g, ' ');
    const date = card.find('time, [class*="date"]').first().text().trim();

    const noteParts = [channel];
    if (date) noteParts.push(date);
    const notes = noteParts.join(' · ');

    items.push({ source: 'ars', title, url, notes, summary: summary || undefined });
  });

  return items;
}

const plugin: Plugin = {
  id: 'ars',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching Ars Technica homepage', { url: ARS_HOME });
    const { status, html } = await ctx.httpGet(ARS_HOME);

    if (status !== 200) {
      throw new Error(`Ars Technica homepage returned HTTP ${status}`);
    }

    const items = parseArsPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from Ars Technica homepage`);
    return items;
  },
};

export default plugin;
