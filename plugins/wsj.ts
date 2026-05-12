// Wall Street Journal plugin — uses official RSS feeds (wsj.com homepage is 401).
// Combines World, Digest, and Markets feeds for broader coverage.

import type { Plugin, Item, Ctx } from '../lib.ts';

const FEEDS = [
  'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
  'https://feeds.a.dj.com/rss/RSSWSJD.xml',
  'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
];

function extractText(block: string, tag: string): string {
  const m = block.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]+?)(?:\\]\\]>)?</${tag}>`, 'i'),
  );
  return m ? m[1].trim() : '';
}

function parseFeed(xml: string): Item[] {
  const items: Item[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]+?)<\/item>/gi)) {
    const block = m[1];
    const title = extractText(block, 'title');
    if (title.length < 5) continue;
    const link = block.match(/<link>\s*([^<\s]+)/i)?.[1]?.trim() ?? extractText(block, 'guid');
    if (!link) continue;
    const pubDate = extractText(block, 'pubDate');
    const summary = extractText(block, 'description');
    const notes = pubDate ? `WSJ · ${pubDate.slice(0, 16)}` : 'WSJ';
    items.push({
      source: 'wsj',
      title,
      url: link,
      notes,
      summary: summary || undefined,
    });
  }
  return items;
}

const plugin: Plugin = {
  id: 'wsj',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    // Fetch all feeds concurrently
    const results = await Promise.allSettled(
      FEEDS.map((url) => {
        ctx.log.debug('Fetching WSJ RSS feed', { url });
        return ctx.httpGet(url).then((r) => {
          if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
          return parseFeed(r.html);
        });
      }),
    );

    const seen = new Set<string>();
    const allItems: Item[] = [];

    for (const r of results) {
      if (r.status === 'rejected') {
        ctx.log.warn(
          `WSJ feed failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        );
        continue;
      }
      for (const item of r.value) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          allItems.push(item);
        }
      }
    }

    ctx.log.debug(`Parsed ${allItems.length} unique items from WSJ RSS feeds`);
    return allItems.slice(0, opts.limit);
  },
};

export default plugin;
