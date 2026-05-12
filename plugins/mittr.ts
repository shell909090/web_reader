// MIT Technology Review plugin — main RSS feed by default, topic feeds as categories.

import type { Plugin, Item, Ctx } from '../lib.ts';

const BASE = 'https://www.technologyreview.com';

const MAIN_FEED = `${BASE}/feed/`;

const CATEGORY_FEEDS: Record<string, string> = {
  ai: `${BASE}/topic/artificial-intelligence/feed/`,
  computing: `${BASE}/topic/computing/feed/`,
  space: `${BASE}/topic/space/feed/`,
  biotech: `${BASE}/topic/biotechnology/feed/`,
};

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
    const published_at = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : undefined;
    items.push({
      source: 'mittr',
      title,
      url: link,
      notes: pubDate ? `MIT TR · ${pubDate.slice(0, 16)}` : 'MIT Technology Review',
      summary: summary || undefined,
      published_at,
    });
  }
  return items;
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

    const seen = new Set<string>();
    const allItems: Item[] = [];
    for (const r of results) {
      if (r.status === 'rejected') {
        ctx.log.warn(
          `MIT TR feed error: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
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
    ctx.log.debug(`Parsed ${allItems.length} unique MIT TR items`);
    return allItems.slice(0, opts.limit);
  },
};

export default plugin;
