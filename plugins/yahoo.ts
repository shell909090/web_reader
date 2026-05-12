// Yahoo Finance plugin — main news RSS feed.

import type { Plugin, Item, Ctx } from '../lib.ts';

const RSS_URL = 'https://finance.yahoo.com/news/rssindex';

function extractText(block: string, tag: string): string {
  const m = block.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]+?)(?:\\]\\]>)?</${tag}>`, 'i'),
  );
  return m ? m[1].trim() : '';
}

function parseRss(xml: string, limit: number): Item[] {
  const items: Item[] = [];
  const seen = new Set<string>();

  for (const m of xml.matchAll(/<item>([\s\S]+?)<\/item>/gi)) {
    if (items.length >= limit) break;
    const block = m[1];

    const title = extractText(block, 'title');
    if (title.length < 5) continue;

    const link = block.match(/<link>\s*([^<\s]+)/i)?.[1]?.trim() ?? extractText(block, 'guid');
    if (!link || seen.has(link)) continue;
    seen.add(link);

    const pubDate = extractText(block, 'pubDate');
    const date = pubDate ? pubDate.slice(0, 16) : '';
    const summary = extractText(block, 'description');

    items.push({
      source: 'yahoo',
      title,
      url: link,
      notes: date ? `Yahoo Finance · ${date}` : 'Yahoo Finance',
      summary: summary || undefined,
    });
  }

  return items;
}

const plugin: Plugin = {
  id: 'yahoo',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching Yahoo Finance RSS', { url: RSS_URL });
    const { status, html: xml } = await ctx.httpGet(RSS_URL);

    if (status !== 200) throw new Error(`Yahoo Finance RSS returned HTTP ${status}`);

    const items = parseRss(xml, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from Yahoo Finance`);
    return items;
  },
};

export default plugin;
