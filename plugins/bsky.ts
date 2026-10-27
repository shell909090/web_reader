import { getToken } from '../src/feeds/bluesky-auth.ts';
import {
  postToItem,
  type AuthorFeedResponse,
  type SearchPostsResponse,
} from '../src/feeds/bluesky-post.ts';
// Bluesky plugin — author feeds and post search via the AT Protocol API.
// Search requires auth: set BSKY_IDENTIFIER and BSKY_APP_PASSWORD env vars.

import type { Plugin, Item, Ctx } from '../lib.ts';
import { collectFeedResults } from '../src/feeds/results.ts';

const BSKY_XRPC = 'https://public.api.bsky.app/xrpc';
const AUTHOR_FEED_URL = `${BSKY_XRPC}/app.bsky.feed.getAuthorFeed`;
const SEARCH_POSTS_URL = `${BSKY_XRPC}/app.bsky.feed.searchPosts`;

const ACCOUNT_GROUPS: Record<string, string[]> = {
  // Verified-domain handles (DNS TXT record on bsky.app)
  news: ['nytimes.com', 'apnews.com', 'reuters.com', 'theguardian.com'],
  tech: ['theverge.com', 'arstechnica.com', 'techcrunch.com'],
};

const ALL_ACCOUNTS = [...ACCOUNT_GROUPS.news, ...ACCOUNT_GROUPS.tech];

/** Fetch up to `limit` posts from a single Bluesky author feed. */
async function fetchAuthorFeed(ctx: Ctx, handle: string, limit: number): Promise<Item[]> {
  const url = `${AUTHOR_FEED_URL}?actor=${encodeURIComponent(handle)}&limit=${limit}`;
  ctx.log.debug('Fetching Bluesky author feed', { handle, url });
  const token = await getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const { status, html } = await ctx.httpGet(url, { headers });
  if (status !== 200) throw new Error(`Bluesky getAuthorFeed(${handle}) returned HTTP ${status}`);

  let data: AuthorFeedResponse;
  try {
    data = JSON.parse(html) as AuthorFeedResponse;
  } catch (err) {
    throw new Error(
      `Bluesky getAuthorFeed(${handle}): JSON parse failed for ${url}: ${String(err)}`,
      { cause: err },
    );
  }

  return data.feed.map((entry) => postToItem(entry.post)).filter((i): i is Item => i !== null);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const plugin: Plugin = {
  id: 'bsky',

  categories: {
    news: 'News (BBC · AP · Reuters · Guardian)',
    tech: 'Tech (Verge · Ars · TechCrunch)',
  },

  async list(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]> {
    const cats = opts.categories ?? [];
    let accounts: string[];

    if (cats.length === 0) {
      accounts = ALL_ACCOUNTS;
    } else {
      const unknown = cats.filter((c) => !ACCOUNT_GROUPS[c]);
      if (unknown.length) {
        ctx.log.warn(
          `bsky: unknown categories [${unknown.join(', ')}]. Available: ${Object.keys(ACCOUNT_GROUPS).join(', ')}`,
        );
      }
      accounts = [...new Set(cats.flatMap((c) => ACCOUNT_GROUPS[c] ?? []))];
    }

    const perAccount = Math.max(5, Math.ceil(opts.limit / accounts.length));

    const results = await Promise.allSettled(
      accounts.map((handle) => fetchAuthorFeed(ctx, handle, perAccount)),
    );

    const allItems = collectFeedResults(results, ctx.log, 'bsky: feed error');
    ctx.log.debug(`bsky: collected ${allItems.length} unique items`);
    return allItems.slice(0, opts.limit);
  },

  async search(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
    const url = `${SEARCH_POSTS_URL}?q=${encodeURIComponent(query)}&limit=${limit}`;
    ctx.log.debug('Searching Bluesky posts', { query, url });
    const token = await getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const { status, html } = await ctx.httpGet(url, { headers });
    if (status === 401 || status === 403) {
      throw new Error(
        'Bluesky search requires authentication. ' +
          'Set BSKY_IDENTIFIER (your handle, e.g. user.bsky.social) and ' +
          'BSKY_APP_PASSWORD (from https://bsky.app/settings/app-passwords) env vars.',
      );
    }
    if (status !== 200) throw new Error(`Bluesky searchPosts returned HTTP ${status}`);

    let data: SearchPostsResponse;
    try {
      data = JSON.parse(html) as SearchPostsResponse;
    } catch (err) {
      throw new Error(`Bluesky searchPosts: JSON parse failed for ${url}: ${String(err)}`, {
        cause: err,
      });
    }

    return data.posts
      .map(postToItem)
      .filter((i): i is Item => i !== null)
      .slice(0, limit);
  },
};

export default plugin;
