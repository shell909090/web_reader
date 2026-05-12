// MIT Technology Review plugin — uses the official RSS feed.

import type { Plugin, Item, Ctx } from '../lib.ts';

const RSS_URL = 'https://www.technologyreview.com/feed/';

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
    const summary = extractText(block, 'description');
    const notes = pubDate ? `MIT TR · ${pubDate.slice(0, 16)}` : 'MIT Technology Review';

    items.push({ source: 'mittr', title, url: link, notes, summary: summary || undefined });
  }

  return items;
}

const plugin: Plugin = {
  id: 'mittr',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching MIT Technology Review RSS', { url: RSS_URL });
    const { status, html: xml } = await ctx.httpGet(RSS_URL);

    if (status !== 200) throw new Error(`MIT TR RSS returned HTTP ${status}`);

    const items = parseRss(xml, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from MIT Technology Review`);
    return items;
  },
};

export default plugin;
