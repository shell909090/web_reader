// Wikipedia Current Events portal plugin — HTTP-based.
// Source: https://en.wikipedia.org/wiki/Portal:Current_events

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const WIKI_URL = 'https://en.wikipedia.org/wiki/Portal:Current_events';
const WIKI_BASE = 'https://en.wikipedia.org';

/** Parse Portal:Current_events HTML into an Item list. */
function parseWikiPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();

  // Each day is a div.current-events-main with aria-label="May 12" etc.
  $('div.current-events-main[aria-label]').each((_dayIdx, dayEl) => {
    if (items.length >= limit) return false;

    const date = $(dayEl).attr('aria-label') ?? '';
    const content = $(dayEl).find('div.current-events-content');

    let category = '';

    // Walk through children: <p><b>Category</b></p> followed by <ul>
    content.children().each((_i, child) => {
      if (items.length >= limit) return false;

      const tag = $(child).prop('tagName')?.toLowerCase();

      // Category heading: <p><b>Armed conflicts and attacks</b></p>
      if (tag === 'p') {
        category = $(child).find('b').first().text().trim();
        return;
      }

      if (tag !== 'ul') return;

      // Each outer <li> is one event; its first direct <a href="/wiki/..."> is the article link
      $(child)
        .children('li')
        .each((_j, liEl) => {
          if (items.length >= limit) return false;

          const articleLink = $(liEl).find('> a[href^="/wiki/"]').first();
          if (!articleLink.length) return;

          const href = articleLink.attr('href') ?? '';
          if (/Special:|Talk:|Wikipedia:|Portal:|Help:|File:/.test(href)) return;

          const url = WIKI_BASE + href;
          if (seen.has(url)) return;
          seen.add(url);

          const title = articleLink.text().trim();
          if (title.length < 3) return;

          // Inner <li> is the news sentence (summary)
          const summary = $(liEl).find('> ul > li').first().text().trim().replace(/\s+/g, ' ');

          const noteParts = ['Wikipedia'];
          if (date) noteParts.push(date);
          if (category) noteParts.push(category);

          items.push({
            source: 'wikipedia',
            title,
            url,
            notes: noteParts.join(' · '),
            summary: summary || undefined,
          });
        });
    });
  });

  return items;
}

const plugin: Plugin = {
  id: 'wikipedia',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching Wikipedia Current Events', { url: WIKI_URL });
    const { status, html } = await ctx.httpGet(WIKI_URL);

    if (status !== 200) throw new Error(`Wikipedia returned HTTP ${status}`);

    const items = parseWikiPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from Wikipedia Current Events`);
    return items;
  },
};

export default plugin;
