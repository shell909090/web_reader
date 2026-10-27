import { parseFeed } from '../src/feeds/reddit.ts';
// Reddit plugin — subreddit RSS feeds and global search.
// Uses public .rss endpoints; no API key required.

import type { Plugin, Item, Ctx } from '../lib.ts';
import { collectFeedResults } from '../src/feeds/results.ts';

const BASE = 'https://www.reddit.com';

const CATEGORY_SUBS: Record<string, string> = {
  // AI / ML
  ml: 'MachineLearning',
  llm: 'LocalLLaMA',
  ai: 'artificial',
  // IT / Tech
  tech: 'technology',
  prog: 'programming',
  // Finance
  investing: 'investing',
  stocks: 'stocks',
  // News
  worldnews: 'worldnews',
};

const DEFAULT_CATEGORIES = ['worldnews', 'tech', 'ml'];

const plugin: Plugin = {
  id: 'reddit',
  categories: Object.fromEntries(Object.entries(CATEGORY_SUBS).map(([k, v]) => [k, `r/${v}`])),

  async list(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]> {
    const cats = opts.categories?.length ? opts.categories : DEFAULT_CATEGORIES;

    const unknown = cats.filter((c) => !CATEGORY_SUBS[c]);
    if (unknown.length) {
      ctx.log.warn(
        `reddit: unknown categories [${unknown.join(', ')}]. Available: ${Object.keys(CATEGORY_SUBS).join(', ')}`,
      );
    }

    const validCats = cats.filter((c) => CATEGORY_SUBS[c]);
    const results = await Promise.allSettled(
      validCats.map((cat) => {
        const url = `${BASE}/r/${CATEGORY_SUBS[cat]}/hot.rss`;
        ctx.log.debug(`Fetching Reddit [${cat}]`, { url });
        return ctx.httpGet(url).then((r) => {
          if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
          return parseFeed(r.html, 'reddit');
        });
      }),
    );

    const allItems = collectFeedResults(results, ctx.log, 'Reddit feed error');
    ctx.log.debug(`Parsed ${allItems.length} unique Reddit items`);
    return allItems.slice(0, opts.limit);
  },

  async search(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
    const url = `${BASE}/search.rss?q=${encodeURIComponent(query)}&type=link&sort=relevance&limit=${limit}`;
    ctx.log.debug('Searching Reddit', { query });
    const { status, html } = await ctx.httpGet(url);
    if (status !== 200) throw new Error(`Reddit search returned HTTP ${status}`);

    const items = parseFeed(html, 'reddit');
    return items.slice(0, limit);
  },
};

export default plugin;
