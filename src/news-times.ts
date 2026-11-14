import type { Ctx, Item, Plugin, FeedPlugin } from './types.ts';
import { newsTime } from './timestamps.ts';
import { recordFirstSeen } from './first-seen.ts';
import { publicationMetadata, publisherTime } from './publication-metadata.ts';
import { pConcurrent } from './concurrency.ts';

const ARTICLE_SOURCES = new Set([
  'bbc',
  'techcrunch',
  'sina',
  'infoq',
  'people',
  'csdn',
  'thepaper',
  'juejin',
  'yahoo',
  'ars',
  'caixin',
  'xinhua',
  'hn',
  'reddit',
  'bsky',
]);

async function enrich(item: Item, ctx: Ctx): Promise<void> {
  item.published_at = newsTime(item.published_at);
  if (item.published_at) return;
  try {
    if (item.source === 'oschina') {
      item.published_at = await oschinaTime(item, ctx);
    } else if (ARTICLE_SOURCES.has(item.source) && !isSocialPage(item.url)) {
      const response = await ctx.httpGet(item.url, { timeoutMs: 8000 });
      if (response.status === 200)
        item.published_at = publicationMetadata(response.html, item.source);
    }
    if (!item.published_at)
      ctx.log.debug('Publication time unavailable', { source: item.source, url: item.url });
  } catch (err) {
    ctx.log.debug('Publication metadata fetch failed', { source: item.source, error: String(err) });
  }
}

async function oschinaTime(item: Item, ctx: Ctx): Promise<string | undefined> {
  const id = new URL(item.url).pathname.match(/^\/news\/(\d+)/)?.[1];
  if (!id) return undefined;
  const response = await ctx.httpGet(`https://apiv1.oschina.net/oschinapi/new/detail?id=${id}`, {
    timeoutMs: 8000,
    headers: { Referer: 'https://www.oschina.net/' },
  });
  if (response.status !== 200) return undefined;
  const data = JSON.parse(response.html) as { success?: boolean; result?: { pubTime?: string } };
  return data.success ? publisherTime(data.result?.pubTime, 'oschina') : undefined;
}

/** Attach persistent observations and optionally retrieve missing publication metadata. */
export async function observeNews(items: Item[], ctx: Ctx): Promise<Item[]> {
  recordFirstSeen(items);
  await pConcurrent(items, 4, async (item) => {
    await enrich(item, ctx);
  });
  return items;
}

/** Apply the same timestamp contract to CLI and MCP plugin outputs. */
export function withNewsTimes(plugin: FeedPlugin): FeedPlugin;
export function withNewsTimes(plugin: Plugin): Plugin;
export function withNewsTimes(plugin: Plugin): Plugin {
  return {
    ...plugin,
    ...(plugin.list
      ? {
          list: async (ctx: Ctx, opts: { limit: number; categories?: string[] }) =>
            observeNews(await plugin.list!(ctx, opts), ctx),
        }
      : {}),
    ...(plugin.search
      ? {
          search: async (ctx: Ctx, query: string, limit: number) => {
            const results = await plugin.search!(ctx, query, limit);
            const items = results.filter((item): item is Item => typeof item.url === 'string');
            recordFirstSeen(items);
            for (const item of items) item.published_at = newsTime(item.published_at);
            return results;
          },
        }
      : {}),
  };
}

function isSocialPage(raw: string): boolean {
  const host = new URL(raw).hostname;
  return /(^|\.)(reddit\.com|bsky\.app|ycombinator\.com)$/.test(host);
}
