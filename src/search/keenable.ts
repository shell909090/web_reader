import { z } from 'zod';
import type { Ctx, Item } from '../types.ts';
import { providerConfig } from './config.ts';
import { apiUrl, searchJson, searchResponse, webItems } from './common.ts';

const schema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      snippet: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
});

/** Search Keenable's public API or the keyed endpoint when explicitly configured. */
export async function keenable(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
  const config = providerConfig('keenable');
  const key = config.api_key?.trim();
  const endpoint = key ? 'v1/search' : 'v1/search/public';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Keenable-Title': 'web_reader',
  };
  if (key) headers['X-API-Key'] = key;
  const body = await searchResponse(
    ctx,
    'keenable',
    apiUrl(config.base_url, 'https://api.keenable.ai', endpoint),
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, max_results: Math.min(limit, 100), snippet_max_length: 500 }),
    },
  );
  const data = searchJson(body, schema, 'keenable');
  return webItems(
    'keenable',
    data.results.map((row) => ({ ...row, description: row.snippet ?? row.description })),
    limit,
  );
}
