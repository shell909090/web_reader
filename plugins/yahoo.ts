// Yahoo Finance plugin — server-rendered news stream.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const NEWS_URL = 'https://finance.yahoo.com/news/';

function articleUrl(href: string): URL | null {
  let url: URL;
  try {
    url = new URL(href, NEWS_URL);
  } catch {
    return null;
  }
  if (url.origin !== 'https://finance.yahoo.com' || !url.pathname.endsWith('.html')) return null;
  url.search = '';
  url.hash = '';
  return url;
}

function parsePage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();

  $('[data-testid="storyitem"] a[href]').each((_i, el) => {
    if (items.length >= limit) return false;
    const heading = $(el).find('h2, h3').first();
    const title = heading.text().trim().replace(/\s+/g, ' ');
    if (title.length < 5) return;

    const url = articleUrl($(el).attr('href')!);
    if (!url) return;
    if (seen.has(url.href)) return;
    seen.add(url.href);

    const card = $(el).closest('[data-testid="storyitem"]');
    const summary = card.find('p').first().text().trim();
    const publishing = card.find('.publishing').text().trim().replace(/\s+/g, ' ');
    const datetime = card.find('time[datetime]').attr('datetime');
    const timestamp = datetime ? Date.parse(datetime) : NaN;
    items.push({
      source: 'yahoo',
      title,
      url: url.href,
      notes: publishing ? `Yahoo Finance · ${publishing}` : 'Yahoo Finance',
      summary: summary || undefined,
      published_at: Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString(),
    });
  });

  return items;
}

const plugin: Plugin = {
  id: 'yahoo',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching Yahoo Finance news page', { url: NEWS_URL });
    const { status, html } = await ctx.httpGet(NEWS_URL);
    if (status !== 200) throw new Error(`Yahoo Finance returned HTTP ${status}`);

    const items = parsePage(html, opts.limit);
    if (opts.limit > 0 && items.length === 0) {
      throw new Error(
        'Yahoo Finance news page contained no articles; page structure may have changed',
      );
    }
    ctx.log.debug(`Parsed ${items.length} items from Yahoo Finance`);
    return items;
  },
};

export default plugin;
