// Wall Street Journal plugin — RSS feeds from feeds.a.dj.com (wsj.com homepage is 401).

import type { Plugin, Item, Ctx } from '../lib.ts';

const FEED_BASE = 'https://feeds.a.dj.com/rss';

const CATEGORY_FEEDS: Record<string, string> = {
  world: `${FEED_BASE}/RSSWorldNews.xml`,
  us: `${FEED_BASE}/WSJcomUSBusiness.xml`,
  markets: `${FEED_BASE}/RSSMarketsMain.xml`,
  opinion: `${FEED_BASE}/RSSOpinion.xml`,
  main: `${FEED_BASE}/RSSWSJD.xml`,
};

const DEFAULT_CATEGORIES = ['world', 'us', 'markets', 'main'];

function extractText(block: string, tag: string): string {
  const m = block.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]+?)(?:\\]\\]>)?</${tag}>`, 'i'),
  );
  return m ? m[1].trim() : '';
}

function parseFeed(xml: string, source: string): Item[] {
  const items: Item[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]+?)<\/item>/gi)) {
    const block = m[1];
    const title = extractText(block, 'title');
    if (title.length < 5) continue;
    const link = block.match(/<link>\s*([^<\s]+)/i)?.[1]?.trim() ?? extractText(block, 'guid');
    if (!link) continue;
    const pubDate = extractText(block, 'pubDate');
    const summary = extractText(block, 'description');
    items.push({
      source,
      title,
      url: link,
      notes: pubDate ? `WSJ · ${pubDate.slice(0, 16)}` : 'WSJ',
      summary: summary || undefined,
    });
  }
  return items;
}

const plugin: Plugin = {
  id: 'wsj',
  categories: {
    world: 'World News',
    us: 'US Business',
    markets: 'Markets',
    opinion: 'Opinion',
    main: 'WSJ Digest',
  },

  async list(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]> {
    const cats = opts.categories?.length ? opts.categories : DEFAULT_CATEGORIES;
    const feedUrls = cats
      .filter((c) => CATEGORY_FEEDS[c])
      .map((c) => ({ cat: c, url: CATEGORY_FEEDS[c] }));

    if (feedUrls.length === 0) {
      ctx.log.warn(
        `wsj: no valid categories in [${cats.join(', ')}]. Available: ${Object.keys(CATEGORY_FEEDS).join(', ')}`,
      );
      return [];
    }

    const results = await Promise.allSettled(
      feedUrls.map(({ cat, url }) => {
        ctx.log.debug(`Fetching WSJ RSS [${cat}]`, { url });
        return ctx.httpGet(url).then((r) => {
          if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
          return parseFeed(r.html, 'wsj');
        });
      }),
    );

    const seen = new Set<string>();
    const allItems: Item[] = [];
    for (const r of results) {
      if (r.status === 'rejected') {
        ctx.log.warn(
          `WSJ feed error: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
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
    ctx.log.debug(`Parsed ${allItems.length} unique WSJ items`);
    return allItems.slice(0, opts.limit);
  },
};

export default plugin;
