import { parseNewsRss } from '../src/feeds/news-rss.ts';
// MIT Technology Review plugin — main RSS feed by default, topic feeds as categories.

import type { Plugin, Item, Ctx } from '../lib.ts';
import { collectFeedResults } from '../src/feeds/results.ts';

const BASE = 'https://www.technologyreview.com';

const MAIN_FEED = `${BASE}/feed/`;

const CATEGORY_FEEDS: Record<string, string> = {
  ai: `${BASE}/topic/artificial-intelligence/feed/`,
  computing: `${BASE}/topic/computing/feed/`,
  space: `${BASE}/topic/space/feed/`,
  biotech: `${BASE}/topic/biotechnology/feed/`,
};

function parseFeed(xml: string): Item[] {
  return parseNewsRss(xml, 'mittr', 'MIT TR', 'MIT Technology Review');
}

const plugin: Plugin = {
  id: 'mittr',
  categories: {
    ai: 'Artificial Intelligence',
    computing: 'Computing',
    space: 'Space',
    biotech: 'Biotechnology',
  },

  async list(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]> {
    const cats = opts.categories ?? [];

    // No category requested → use the main feed (default behaviour)
    if (cats.length === 0) {
      ctx.log.debug('Fetching MIT TR main RSS', { url: MAIN_FEED });
      const { status, html: xml } = await ctx.httpGet(MAIN_FEED);
      if (status !== 200) throw new Error(`MIT TR RSS returned HTTP ${status}`);
      const items = parseFeed(xml);
      ctx.log.debug(`Parsed ${items.length} items from MIT TR main feed`);
      return items.slice(0, opts.limit);
    }

    // Specific categories requested → fetch in parallel and deduplicate
    const feedUrls = cats
      .filter((c) => CATEGORY_FEEDS[c])
      .map((c) => ({ cat: c, url: CATEGORY_FEEDS[c] }));

    const unknown = cats.filter((c) => !CATEGORY_FEEDS[c]);
    if (unknown.length) {
      ctx.log.warn(
        `mittr: unknown categories [${unknown.join(', ')}]. Available: ${Object.keys(CATEGORY_FEEDS).join(', ')}`,
      );
    }

    const results = await Promise.allSettled(
      feedUrls.map(({ cat, url }) => {
        ctx.log.debug(`Fetching MIT TR [${cat}]`, { url });
        return ctx.httpGet(url).then((r) => {
          if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
          return parseFeed(r.html);
        });
      }),
    );

    const allItems = collectFeedResults(results, ctx.log, 'MIT TR feed error');
    ctx.log.debug(`Parsed ${allItems.length} unique MIT TR items`);
    return allItems.slice(0, opts.limit);
  },
};

export default plugin;
