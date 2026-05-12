// Bluesky plugin — author feeds and post search via the public AT Protocol API.

import type { Plugin, Item, Ctx } from '../lib.ts';

const BSKY_XRPC = 'https://public.api.bsky.app/xrpc';
const AUTHOR_FEED_URL = `${BSKY_XRPC}/app.bsky.feed.getAuthorFeed`;
const SEARCH_POSTS_URL = `${BSKY_XRPC}/app.bsky.feed.searchPosts`;

const ACCOUNT_GROUPS: Record<string, string[]> = {
  news: ['bbc.com', 'apnews.com', 'reuters.com', 'theguardian.com'],
  tech: ['theverge.com', 'arstechnica.com', 'techcrunch.com'],
};

const ALL_ACCOUNTS = [...ACCOUNT_GROUPS.news, ...ACCOUNT_GROUPS.tech];

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type BskyEmbed = {
  $type: string;
  external?: {
    uri: string;
    title?: string;
    description?: string;
  };
};

type BskyRecord = {
  text: string;
  createdAt?: string;
  embed?: BskyEmbed;
};

type BskyPost = {
  uri: string;
  author: { handle: string; displayName?: string };
  record: BskyRecord;
  likeCount?: number;
  repostCount?: number;
  indexedAt?: string;
};

type AuthorFeedResponse = {
  feed: Array<{ post: BskyPost }>;
};

type SearchPostsResponse = {
  posts: BskyPost[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a BskyPost to an Item, returning null if title or url is missing. */
function postToItem(post: BskyPost): Item | null {
  const { uri, author, record, likeCount, repostCount, indexedAt } = post;
  const external = record.embed?.external;

  let title: string;
  let url: string;

  if (external?.uri) {
    title = (external.title ?? record.text).slice(0, 100).trim();
    url = external.uri;
  } else {
    title = record.text.slice(0, 100).trim();
    const rkey = uri.split('/').pop();
    url = rkey ? `https://bsky.app/profile/${author.handle}/post/${rkey}` : '';
  }

  if (!title || !url) return null;

  const displayName = author.displayName ?? author.handle ?? 'Bluesky';
  const date = (indexedAt ?? record.createdAt ?? '').slice(0, 10);
  const parts: string[] = [displayName];
  if (date) parts.push(date);
  if (likeCount !== undefined) parts.push(`${likeCount} likes`);
  if (repostCount !== undefined) parts.push(`${repostCount} reposts`);
  const notes = parts.join(' · ');

  const published_at = date || undefined;

  return { source: 'bsky', title, url, notes, published_at };
}

/** Fetch up to `limit` posts from a single Bluesky author feed. */
async function fetchAuthorFeed(ctx: Ctx, handle: string, limit: number): Promise<Item[]> {
  const url = `${AUTHOR_FEED_URL}?actor=${encodeURIComponent(handle)}&limit=${limit}`;
  ctx.log.debug('Fetching Bluesky author feed', { handle, url });
  const { status, html } = await ctx.httpGet(url);
  if (status !== 200) throw new Error(`Bluesky getAuthorFeed(${handle}) returned HTTP ${status}`);

  let data: AuthorFeedResponse;
  try {
    data = JSON.parse(html) as AuthorFeedResponse;
  } catch (err) {
    throw new Error(
      `Bluesky getAuthorFeed(${handle}): JSON parse failed for ${url}: ${String(err)}`,
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

    const seen = new Set<string>();
    const allItems: Item[] = [];
    for (const r of results) {
      if (r.status === 'rejected') {
        ctx.log.warn(
          `bsky: feed error: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
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

    ctx.log.debug(`bsky: collected ${allItems.length} unique items`);
    return allItems.slice(0, opts.limit);
  },

  async search(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
    const url = `${SEARCH_POSTS_URL}?q=${encodeURIComponent(query)}&limit=${limit}`;
    ctx.log.debug('Searching Bluesky posts', { query, url });
    const { status, html } = await ctx.httpGet(url);
    if (status !== 200) throw new Error(`Bluesky searchPosts returned HTTP ${status}`);

    let data: SearchPostsResponse;
    try {
      data = JSON.parse(html) as SearchPostsResponse;
    } catch (err) {
      throw new Error(`Bluesky searchPosts: JSON parse failed for ${url}: ${String(err)}`);
    }

    return data.posts
      .map(postToItem)
      .filter((i): i is Item => i !== null)
      .slice(0, limit);
  },
};

export default plugin;
