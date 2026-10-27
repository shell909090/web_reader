// Wikipedia Current Events portal plugin (English) — HTTP-based.
// Source: https://en.wikipedia.org/wiki/Portal:Current_events
// Chinese edition: see zhwiki.ts

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const WIKI_URL = 'https://en.wikipedia.org/wiki/Portal:Current_events';

/** Parse Portal:Current_events HTML into an Item list. */
function parseWikiPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();

  $('div.current-events-main[aria-label]').each((_dayIdx, dayEl) => {
    if (items.length >= limit) return false;

    const date = $(dayEl).attr('aria-label') ?? '';
    const content = $(dayEl).find('div.current-events-content');
    let category = '';

    content.children().each((_i, child) => {
      if (items.length >= limit) return false;
      const tag = $(child).prop('tagName')?.toLowerCase();

      if (tag === 'p') {
        category = $(child).find('b').first().text().trim();
        return;
      }
      if (tag !== 'ul') return;

      $(child)
        .children('li')
        .each((_j, liEl) => {
          if (items.length >= limit) return false;

          const articleLink = $(liEl).find('> a[href^="/wiki/"]').first();
          if (!articleLink.length) return;

          const href = articleLink.attr('href') ?? '';
          if (/Special:|Talk:|Wikipedia:|Portal:|Help:|File:/.test(href)) return;

          const url = 'https://en.wikipedia.org' + href;
          if (seen.has(url)) return;
          seen.add(url);

          const title = articleLink.text().trim();
          if (title.length < 3) return;

          const summary = $(liEl).find('> ul > li').first().text().trim().replace(/\s+/g, ' ');
          const notes = ['Wikipedia', date, category].filter(Boolean).join(' · ');

          items.push({
            source: 'wiki',
            title,
            url,
            notes,
            summary: summary || undefined,
          });
        });
    });
  });

  return items;
}

const plugin: Plugin = {
  id: 'wiki',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching Wikipedia Current Events', { url: WIKI_URL });
    const { status, html } = await ctx.httpGet(WIKI_URL);
    if (status !== 200) throw new Error(`Wikipedia returned HTTP ${status}`);
    const items = parseWikiPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from Wikipedia`);
    return items;
  },

  async search(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json`;
    ctx.log.debug('Searching Wikipedia', { query });
    const { status, html } = await ctx.httpGet(url);
    if (status !== 200) throw new Error(`Wikipedia search returned HTTP ${status}`);

    const data = JSON.parse(html) as {
      query: { search: Array<{ title: string; snippet: string; pageid: number }> };
    };

    return data.query.search.map((r) => ({
      source: 'wiki',
      title: r.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
      notes: 'Wikipedia',
      summary: r.snippet.replace(/<[^>]+>/g, '').trim() || undefined,
    }));
  },
};

export default plugin;
