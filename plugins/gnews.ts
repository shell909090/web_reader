// Google News RSS plugin — top headlines by default, topic feeds as categories, keyword search.

import type { Plugin, Item, Ctx } from '../lib.ts';

const BASE_URL = 'https://news.google.com/rss';
const TOP_URL = `${BASE_URL}?hl=en-US&gl=US&ceid=US:en`;

const TOPIC_IDS: Record<string, string> = {
  tech: 'TECHNOLOGY',
  business: 'BUSINESS',
  science: 'SCIENCE',
  health: 'HEALTH',
  sports: 'SPORTS',
  entertainment: 'ENTERTAINMENT',
  world: 'WORLD',
  nation: 'NATION',
};

function categoryUrl(topic: string): string {
  return `${BASE_URL}/headlines/section/topic/${topic}?hl=en-US&gl=US&ceid=US:en`;
}

function extractText(block: string, tag: string): string {
  const m = block.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]+?)(?:\\]\\]>)?</${tag}>`, 'i'),
  );
  return m ? m[1].trim() : '';
}

/** Parse a Google News RSS feed XML string into Items. */
function parseFeed(xml: string): Item[] {
  const items: Item[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]+?)<\/item>/gi)) {
    const block = m[1];

    const rawTitle = extractText(block, 'title');
    if (rawTitle.length < 5) continue;
    const title = rawTitle.replace(/ - [^-]+$/, '').trim();

    const link = block.match(/<link>\s*([^<\s]+)/i)?.[1]?.trim() ?? extractText(block, 'guid');
    if (!link) continue;

    const publisher = block.match(/<source[^>]*>([^<]+)<\/source>/i)?.[1]?.trim() ?? '';

    const pubDate = extractText(block, 'pubDate');
    let published_at: string | undefined;
    if (pubDate) {
      const d = new Date(pubDate);
      published_at = isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
    }

    const notes = publisher
      ? published_at
        ? `${publisher} · ${published_at}`
        : publisher
      : (published_at ?? 'Google News');

    items.push({
      source: 'gnews',
      title,
      url: link,
      notes,
      published_at,
    });
  }
  return items;
}

/** Fetch a single RSS URL and return parsed items, throwing on non-200. */
async function fetchFeed(ctx: Ctx, url: string): Promise<Item[]> {
  const { status, html: xml } = await ctx.httpGet(url);
  if (status !== 200) throw new Error(`Google News RSS returned HTTP ${status}`);
  return parseFeed(xml);
}

const plugin: Plugin = {
  id: 'gnews',
  categories: Object.fromEntries(
    Object.entries(TOPIC_IDS).map(([k, v]) => [k, v.charAt(0) + v.slice(1).toLowerCase()]),
  ),

  async list(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]> {
    const cats = opts.categories ?? [];

    if (cats.length === 0) {
      ctx.log.debug('Fetching Google News top headlines', { url: TOP_URL });
      const items = await fetchFeed(ctx, TOP_URL);
      ctx.log.debug(`Parsed ${items.length} items from Google News top feed`);
      return items.slice(0, opts.limit);
    }

    const unknown = cats.filter((c) => !TOPIC_IDS[c]);
    if (unknown.length) {
      ctx.log.warn(
        `gnews: unknown categories [${unknown.join(', ')}]. Available: ${Object.keys(TOPIC_IDS).join(', ')}`,
      );
    }

    const validCats = cats.filter((c) => TOPIC_IDS[c]);
    const results = await Promise.allSettled(
      validCats.map((cat) => {
        const url = categoryUrl(TOPIC_IDS[cat]);
        ctx.log.debug(`Fetching Google News [${cat}]`, { url });
        return fetchFeed(ctx, url);
      }),
    );

    const seen = new Set<string>();
    const allItems: Item[] = [];
    for (const r of results) {
      if (r.status === 'rejected') {
        ctx.log.warn(
          `gnews feed error: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
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
    ctx.log.debug(`Parsed ${allItems.length} unique Google News items`);
    return allItems.slice(0, opts.limit);
  },

  async search(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
    const url = `${BASE_URL}/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    ctx.log.debug('Searching Google News', { query });
    const items = await fetchFeed(ctx, url);
    return items.slice(0, limit);
  },
};

export default plugin;
