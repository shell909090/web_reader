import { z } from 'zod';
import type { Ctx, Item } from '../types.ts';
import { providerConfig, credential } from './config.ts';
import { apiUrl, searchJson, searchResponse, webItems, webRow } from './common.ts';

/** Search Brave's official web API. */
export async function brave(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
  const config = providerConfig('brave');
  const key = credential(config, 'brave');
  const url = new URL(apiUrl(config.base_url, 'https://api.search.brave.com', 'res/v1/web/search'));
  url.search = new URLSearchParams({ q: query, count: String(Math.min(limit, 20)) }).toString();
  const body = await searchResponse(ctx, 'brave', url.href, {
    headers: { 'X-Subscription-Token': key },
  });
  const data = searchJson(
    body,
    z.object({
      web: z.object({ results: z.array(webRow) }).optional(),
      query: z.object({ original: z.string() }),
    }),
    'brave',
  );
  return webItems('brave', data.web?.results ?? [], limit);
}

/** Search Tavily without requesting generated answers or full text. */
export async function tavily(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
  const config = providerConfig('tavily');
  const key = credential(config, 'tavily');
  const body = await searchResponse(
    ctx,
    'tavily',
    apiUrl(config.base_url, 'https://api.tavily.com', 'search'),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        max_results: Math.min(limit, 20),
        include_answer: false,
        include_raw_content: false,
      }),
    },
  );
  const data = searchJson(body, z.object({ results: z.array(webRow) }), 'tavily');
  return webItems('tavily', data.results, limit);
}

/** Search Exa without requesting target-page content. */
export async function exa(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
  const config = providerConfig('exa');
  const key = credential(config, 'exa');
  const body = await searchResponse(
    ctx,
    'exa',
    apiUrl(config.base_url, 'https://api.exa.ai', 'search'),
    {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, numResults: Math.min(limit, 100), type: 'auto' }),
    },
  );
  const data = searchJson(body, z.object({ results: z.array(webRow) }), 'exa');
  return webItems('exa', data.results, limit);
}
