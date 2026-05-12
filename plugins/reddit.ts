// Reddit plugin — subreddit RSS feeds and global search.
// Uses public .rss endpoints; no API key required.

import type { Plugin, Item, Ctx } from '../lib.ts';

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

function extractText(block: string, tag: string): string {
  const m = block.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]+?)(?:\\]\\]>)?</${tag}>`, 'i'),
  );
  return m ? m[1].trim() : '';
}

function parseFeed(xml: string, source: string): Item[] {
  const items: Item[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]+?)<\/entry>/gi)) {
    const block = m[1];

    const title = extractText(block, 'title')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    if (!title || title.length < 5) continue;

    // Reddit Atom feed uses <link rel="alternate" href="..."/>
    const link =
      block.match(/rel="alternate"[^>]+href="([^"]+)"/)?.[1] ??
      block.match(/href="(https?:\/\/www\.reddit\.com\/r\/[^"]+)"/)?.[1] ??
      '';
    if (!link || link.includes('/r/') === false) continue;

    // Strip [X] prefix (e.g. [D], [R]) then filter megathreads/mod posts
    const bare = title.replace(/^\[[A-Z]\]\s*/i, '');
    if (
      /^(daily|weekly|monthly|self.promo|self.promotion|hiring|mod\b|automod|scheduled|who.s hiring|career)/i.test(
        bare,
      )
    )
      continue;

    const updated = extractText(block, 'updated');
    const date = updated.slice(0, 10);
    const sub = link.match(/\/r\/([^/]+)/)?.[1] ?? '';

    items.push({
      source,
      title,
      url: link,
      notes: date ? `r/${sub} · ${date}` : `r/${sub}`,
    });
  }
  return items;
}

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

    const seen = new Set<string>();
    const allItems: Item[] = [];
    for (const r of results) {
      if (r.status === 'rejected') {
        ctx.log.warn(
          `Reddit feed error: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
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
