// Wikipedia Current Events portal plugin — HTTP-based.
// English: https://en.wikipedia.org/wiki/Portal:Current_events
// Chinese: https://zh.wikipedia.org/wiki/Portal:新闻动态  (category: cn)

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const WIKI_EN_URL = 'https://en.wikipedia.org/wiki/Portal:Current_events';
const WIKI_CN_URL = 'https://zh.wikipedia.org/wiki/Portal:%E6%96%B0%E8%81%9E%E5%8B%95%E6%85%8B';

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

          const url = 'https://en.wikipedia.org' + href;
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
            source: 'wiki',
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

/** Parse Chinese Wikipedia 新闻动态 portal (h2/h3 dates + li items). */
function parseZhWikiPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();
  let currentDate = '';

  $('#mw-content-text *').each((_i, el) => {
    if (items.length >= limit) return false;
    const tag = $(el).prop('tagName')?.toLowerCase();

    if (tag === 'h2' || tag === 'h3') {
      const text = $(el).text().trim();
      if (/\d+月\d+日/.test(text)) currentDate = text;
      return;
    }

    if (tag !== 'li' || !currentDate) return;

    // First direct /wiki/ link is the article title
    const articleLink = $(el).find('> a[href^="/wiki/"]').first();
    if (!articleLink.length) return;

    const href = articleLink.attr('href') ?? '';
    if (/Special:|Talk:|Wikipedia:|Portal:|Help:|File:/.test(href)) return;

    const url = `https://zh.wikipedia.org${href}`;
    if (seen.has(url)) return;

    const title = articleLink.text().trim();
    if (title.length < 2) return;

    const summary = $(el)
      .text()
      .trim()
      .replace(/\[\d+\]/g, '')
      .replace(/\s+/g, ' ');
    seen.add(url);

    items.push({
      source: 'wiki',
      title,
      url,
      notes: `维基百科 · ${currentDate}`,
      summary: summary.length > title.length + 2 ? summary : undefined,
    });
  });

  return items;
}

const plugin: Plugin = {
  id: 'wiki',
  categories: {
    cn: '中文新闻动态',
  },

  async list(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]> {
    const useCn = opts.categories?.includes('cn');
    const url = useCn ? WIKI_CN_URL : WIKI_EN_URL;
    ctx.log.debug(`Fetching Wikipedia Current Events [${useCn ? 'zh' : 'en'}]`, { url });
    const { status, html } = await ctx.httpGet(url);

    if (status !== 200) throw new Error(`Wikipedia returned HTTP ${status}`);

    const items = useCn ? parseZhWikiPage(html, opts.limit) : parseWikiPage(html, opts.limit);
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
