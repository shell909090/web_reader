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

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseFeed(xml: string, source: string): Item[] {
  const items: Item[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]+?)<\/entry>/gi)) {
    const block = m[1];

    const title = decodeEntities(extractText(block, 'title'));
    if (!title || title.length < 5) continue;

    // Reddit Atom feed: permalink is the rel="alternate" link
    const redditUrl =
      block.match(/rel="alternate"[^>]+href="([^"]+)"/)?.[1] ??
      block.match(/href="(https?:\/\/www\.reddit\.com\/r\/[^"]+)"/)?.[1] ??
      '';
    if (!redditUrl || !redditUrl.includes('/r/')) continue;

    // Strip [X] prefix then filter megathreads/mod posts
    const bare = title.replace(/^\[[A-Z]\]\s*/i, '');
    if (
      /^(daily|weekly|monthly|self.promo|self.promotion|hiring|mod\b|automod|scheduled|who.s hiring|career)/i.test(
        bare,
      )
    )
      continue;

    // For link posts the <content> HTML has the external URL encoded as &quot;
    const contentHtml = extractText(block, 'content');
    const extUrl =
      contentHtml.match(/href=&quot;(https?:\/\/(?!www\.reddit\.com)[^&\s]+)&quot;/)?.[1] ??
      contentHtml.match(/href="(https?:\/\/(?!www\.reddit\.com)[^"\s]+)"/)?.[1];

    // For self-posts, strip HTML from content and use as summary
    let summary: string | undefined;
    if (!extUrl && contentHtml) {
      const text = decodeEntities(contentHtml.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 20) summary = text.slice(0, 400);
    }

    const updated = extractText(block, 'updated');
    const date = updated.slice(0, 10);
    const sub = redditUrl.match(/\/r\/([^/]+)/)?.[1] ?? '';
    const notes = date ? `r/${sub} · ${date}` : `r/${sub}`;

    items.push({
      source,
      title,
      // Link post → external URL (detail mode works); self-post → Reddit URL
      url: extUrl ?? redditUrl,
      notes: extUrl ? notes : `${notes} (discussion)`,
      ...(extUrl ? { reddit_url: redditUrl } : {}),
      ...(summary ? { summary } : {}),
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
