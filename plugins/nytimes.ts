import { extractText, rssLink } from '../src/feeds/rss.ts';
// NYTimes Chinese edition plugin — parses the RSS feed for stable, structured output.
// Feed URL: https://cn.nytimes.com/rss/

import type { Plugin, Item, Ctx } from '../lib.ts';

const RSS_URL = 'https://cn.nytimes.com/rss/';

/** Parse RSS 2.0 XML into an Item list. */
function parseRss(xml: string, limit: number): Item[] {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]+?)<\/item>/gi)];
  const items: Item[] = [];
  const seen = new Set<string>();

  for (const m of itemBlocks) {
    if (items.length >= limit) break;
    const block = m[1];

    const title = extractText(block, 'title');
    if (title.length < 4) continue;

    // <link> in RSS is often a text node between tags (not an attribute)
    const link = rssLink(block);
    if (!link || seen.has(link)) continue;
    seen.add(link);

    const pubDate = extractText(block, 'pubDate');
    const notes = pubDate ? `纽约时报中文网 · ${pubDate.slice(0, 16)}` : '纽约时报中文网';
    const published_at = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : undefined;

    items.push({ source: 'nytimes', title, url: link, notes, published_at });
  }

  return items;
}

const plugin: Plugin = {
  id: 'nytimes',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching NYTimes Chinese RSS', { url: RSS_URL });
    const { status, html: xml } = await ctx.httpGet(RSS_URL);

    if (status !== 200) throw new Error(`NYTimes RSS returned HTTP ${status}`);

    const items = parseRss(xml, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from NYTimes Chinese RSS`);
    return items;
  },
};

export default plugin;
