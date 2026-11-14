import { z } from 'zod';

export const SEARCH_IDS = [
  'brave',
  'duckduckgo',
  'tavily',
  'exa',
  'parallel',
  'firecrawl',
  'keenable',
  'wolframalpha',
  'searxng',
] as const;
export const providerSchema = z
  .object({
    enabled: z.boolean().optional(),
    api_key: z.string().optional(),
    app_id: z.string().optional(),
    mcp_url: z.string().url().optional(),
    base_url: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      })
      .optional(),
  })
  .strict();
export const schema = z
  .object({ providers: z.partialRecord(z.enum(SEARCH_IDS), providerSchema).optional() })
  .strict();
export type ProviderConfig = z.infer<typeof providerSchema>;
export type SearchConfig = Partial<Record<(typeof SEARCH_IDS)[number], ProviderConfig>>;
