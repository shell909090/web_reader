// Wikipedia "In the news" plugin — HTTP-based, uses cheerio to parse the Main Page.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const WIKI_BASE = 'https://en.wikipedia.org';
const WIKI_HOME = `${WIKI_BASE}/wiki/Main_Page`;

// Namespaces that should be excluded from URL candidates
const EXCLUDED_NS_RE = /\/wiki\/(Special:|Talk:|Wikipedia:|Portal:|Help:|File:)/;

/** Parse Wikipedia Main Page HTML into Item list, truncated to limit. */
function parseWikipediaPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];

  $('#mp-itn li').each((_i, el) => {
    if (items.length >= limit) return false;

    const li = $(el);

    const title = li.text().trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!title) return;

    // Pick the last qualifying /wiki/ anchor in this li
    const anchors = li.find('a[href^="/wiki/"]').toArray();
    let url = '';
    for (let j = anchors.length - 1; j >= 0; j--) {
      const href = $(anchors[j]).attr('href') ?? '';
      if (!EXCLUDED_NS_RE.test(href)) {
        url = `${WIKI_BASE}${href}`;
        break;
      }
    }

    if (!url) return;

    items.push({ source: 'wikipedia', title, url, notes: 'Wikipedia · In the news' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'wikipedia',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'http') throw new Error('wikipedia requires http mode');

    ctx.log.debug('Fetching Wikipedia Main Page', { url: WIKI_HOME });
    const { status, html } = await ctx.httpGet(WIKI_HOME);

    if (status !== 200) {
      throw new Error(`Wikipedia Main Page returned HTTP ${status}`);
    }

    const items = parseWikipediaPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from Wikipedia Main Page`);
    return items;
  },
};

export default plugin;
