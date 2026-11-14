import { z } from 'zod';
import type { Ctx, SearchResult } from '../types.ts';
import { providerConfig, credential } from './config.ts';
import { apiUrl, searchJson, searchResponse } from './common.ts';

const resultSchema = z.object({
  queryresult: z.object({
    success: z.boolean(),
    error: z.union([
      z.boolean(),
      z.object({ code: z.number().optional(), msg: z.string().optional() }),
    ]),
    pods: z
      .array(
        z.object({
          title: z.string(),
          subpods: z.array(z.object({ plaintext: z.string().optional() })),
        }),
      )
      .optional(),
  }),
});

/** Return WolframAlpha computational answers without inventing article URLs. */
export async function wolframalpha(
  ctx: Ctx,
  query: string,
  _limit: number,
): Promise<SearchResult[]> {
  const config = providerConfig('wolframalpha');
  const key = credential(config, 'wolframalpha', 'app_id');
  const url = new URL(apiUrl(config.base_url, 'https://api.wolframalpha.com', 'v2/query'));
  url.search = new URLSearchParams({
    appid: key,
    input: query,
    output: 'json',
    format: 'plaintext',
  }).toString();
  const body = await searchResponse(ctx, 'wolframalpha', url.href);
  const { queryresult: result } = searchJson(body, resultSchema, 'wolframalpha');
  if (result.error) throw new Error('wolframalpha: API rejected query or credentials');
  if (!result.success) return [];
  const sections = (result.pods ?? []).map((pod) => ({
    title: pod.title,
    text: pod.subpods
      .map((part) => part.plaintext ?? '')
      .filter(Boolean)
      .join('\n'),
  }));
  if (!sections.some((section) => section.text))
    throw new Error('wolframalpha: answer has no readable content');
  return [
    {
      kind: 'answer',
      source: 'wolframalpha',
      title: query,
      answer: sections.map((section) => `${section.title}\n${section.text}`).join('\n\n'),
      sections,
    },
  ];
}
