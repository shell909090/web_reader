// Chinese Wikipedia plugin — 新闻动态 portal and search.
// News:   https://zh.wikipedia.org/wiki/Portal:新闻动态
// Search: https://zh.wikipedia.org/w/api.php

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const NEWS_URL = 'https://zh.wikipedia.org/wiki/Portal:%E6%96%B0%E8%81%9E%E5%8B%95%E6%85%8B';
const BASE = 'https://zh.wikipedia.org';

function parseEvent(
  element: ReturnType<cheerio.CheerioAPI>,
  currentDate: string,
  seen: Set<string>,
): Item | null {
  const articleLink = element.find('> a[href^="/wiki/"]').first();
  if (!articleLink.length) return null;

  const href = articleLink.attr('href') ?? '';
  if (/Special:|Talk:|Wikipedia:|Portal:|Help:|File:/.test(href)) return null;

  const url = `${BASE}${href}`;
  if (seen.has(url)) return null;

  const title = articleLink.text().trim();
  if (title.length < 2) return null;

  const summary = element
    .text()
    .trim()
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ');
  seen.add(url);

  return {
    source: 'zhwiki',
    title,
    url,
    notes: `维基百科 · ${currentDate}`,
    summary: summary.length > title.length + 2 ? summary : undefined,
  };
}

/** Parse 新闻动态 portal HTML — dates are h2/h3 headings, events are li items. */
function parsePage(html: string, limit: number): Item[] {
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

    const item = parseEvent($(el), currentDate, seen);
    if (item) items.push(item);
  });

  return items;
}

const plugin: Plugin = {
  id: 'zhwiki',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching Chinese Wikipedia 新闻动态', { url: NEWS_URL });
    const { status, html } = await ctx.httpGet(NEWS_URL);
    if (status !== 200) throw new Error(`Chinese Wikipedia returned HTTP ${status}`);
    const items = parsePage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from 中文维基百科`);
    return items;
  },

  async search(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
    const url = `${BASE}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json`;
    ctx.log.debug('Searching Chinese Wikipedia', { query });
    const { status, html } = await ctx.httpGet(url);
    if (status !== 200) throw new Error(`Chinese Wikipedia search returned HTTP ${status}`);

    const data = JSON.parse(html) as {
      query: { search: Array<{ title: string; snippet: string; pageid: number }> };
    };

    return data.query.search.map((r) => ({
      source: 'zhwiki',
      title: r.title,
      url: `${BASE}/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
      notes: '中文维基百科',
      summary: r.snippet.replace(/<[^>]+>/g, '').trim() || undefined,
    }));
  },
};

export default plugin;
