import { z } from 'zod';
import type { Ctx, Item } from '../types.ts';
import { providerConfig } from './config.ts';
import { searchJson, searchResponse, webItems, webRow } from './common.ts';

/** Search a user-configured SearXNG instance with JSON enabled. */
export async function searxng(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
  const config = providerConfig('searxng');
  if (!config.base_url)
    throw new Error(
      'searxng: missing base_url; set providers.searxng.base_url or SEARXNG_BASE_URL',
    );
  const url = new URL('search', config.base_url.replace(/\/$/, '') + '/');
  url.search = new URLSearchParams({ q: query, format: 'json' }).toString();
  const body = await searchResponse(ctx, 'searxng', url.href);
  const data = searchJson(
    body,
    z.object({ results: z.array(webRow), unresponsive_engines: z.array(z.unknown()).optional() }),
    'searxng',
  );
  if (data.unresponsive_engines?.length) {
    if (!data.results.length)
      throw new Error('searxng: upstream engines failed; no usable results');
    ctx.log.warn('searxng: partial results; some upstream engines failed');
  }
  return webItems('searxng', data.results, limit);
}
