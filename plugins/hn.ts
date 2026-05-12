// Hacker News list plugin — HTTP-based, uses cheerio to parse the HN homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const HN_BASE = 'https://news.ycombinator.com';
const HN_HOME = `${HN_BASE}/`;

/** Parse HN homepage HTML into Item list, truncated to limit. */
function parseHNPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];

  $('tr.athing').each((_i, el) => {
    if (items.length >= limit) return false; // cheerio each: return false to break

    const row = $(el);
    const titleAnchor = row.find('.titleline > a').first();
    const title = titleAnchor.text().trim();
    let url = titleAnchor.attr('href') ?? '';

    // Internal HN links (e.g. "item?id=12345") need the base prepended
    if (url.startsWith('item?id=')) {
      url = `${HN_BASE}/${url}`;
    }

    if (!title || !url) return; // skip malformed rows

    // The metadata row immediately follows the athing row
    const subtext = row.next('tr').find('.subtext');
    const score = subtext.find('.score').text().trim();
    const age = subtext.find('.age a').text().trim();
    // Comments link is a direct child <a> of the subtext cell (not nested in a span)
    const comments = subtext
      .children('a')
      .filter((_i, el) => /comment/i.test($(el).text()))
      .first()
      .text()
      .trim();

    // Build notes from available fields, omitting blanks
    const parts: string[] = [];
    if (score) parts.push(score);
    if (age) parts.push(age);
    if (comments) parts.push(comments);
    const notes = parts.join(' · ');

    items.push({ source: 'hn', title, url, notes });
  });

  return items;
}

const plugin: Plugin = {
  id: 'hn',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'http') throw new Error('hn requires http mode');

    ctx.log.debug('Fetching HN homepage', { url: HN_HOME });
    const { status, html } = await ctx.httpGet(HN_HOME);

    if (status !== 200) {
      throw new Error(`HN homepage returned HTTP ${status}`);
    }

    const items = parseHNPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from HN homepage`);
    return items;
  },
};

export default plugin;
