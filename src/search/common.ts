import { z } from 'zod';
import type { Ctx, HttpGetOpts, Item } from '../types.ts';

export const webRow = z.object({
  title: z.string(),
  url: z.string().url(),
  description: z.string().optional(),
  content: z.string().optional(),
});

/** Convert validated web results without changing upstream ordering. */
export function webItems(source: string, rows: z.infer<typeof webRow>[], limit: number): Item[] {
  return rows.slice(0, limit).map((row, index) => ({
    kind: 'web',
    source,
    title: row.title,
    url: row.url,
    notes: '',
    summary: row.description ?? row.content,
    rank: index + 1,
  }));
}

/** Request search data without exposing credentials through transport failures. */
export async function searchResponse(
  ctx: Ctx,
  source: string,
  url: string,
  opts: HttpGetOpts = {},
): Promise<string> {
  let response;
  try {
    response = await ctx.httpGet(url, { ...opts, sensitive: true, timeoutMs: 20000 });
  } catch {
    throw new Error(`${source}: request failed (network, timeout or refused redirect)`);
  }
  if (response.status === 429)
    throw new Error(
      `${source}: rate limited (HTTP 429); retry later${response.retryAfter && /^\d{1,10}$/.test(response.retryAfter) ? '; Retry-After: ' + response.retryAfter : ''}`,
    );
  if (response.status < 200 || response.status >= 300)
    throw new Error(`${source}: access failed (HTTP ${response.status})`);
  return response.html;
}

/** Validate JSON responses without echoing upstream bodies or credentials. */
export function searchJson<T>(body: string, schema: z.ZodType<T>, source: string): T {
  try {
    return schema.parse(JSON.parse(body));
  } catch {
    throw new Error(`${source}: invalid search response`);
  }
}

/** Resolve an API endpoint and forbid sending credentials over plain HTTP. */
export function apiUrl(base: string | undefined, fallback: string, path: string): string {
  const url = new URL(path, (base ?? fallback).replace(/\/$/, '') + '/');
  if (url.protocol !== 'https:') throw new Error('Credential-bearing API endpoints require HTTPS');
  return url.href;
}
