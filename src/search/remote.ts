import { z } from 'zod';
import type { Ctx, Item } from '../types.ts';
import { providerConfig, type ProviderConfig } from './config.ts';
import { callSearchTool } from './mcp-client.ts';
import { toolData, structuredItems, exaTextItems } from './mcp-results.ts';

function optionalHeaders(config: ProviderConfig): Record<string, string> | undefined {
  return config.api_key?.trim() ? { Authorization: `Bearer ${config.api_key.trim()}` } : undefined;
}

/** Use Exa's public MCP endpoint when no API key is configured. */
export async function exaKeyless(
  query: string,
  limit: number,
  config: ProviderConfig,
): Promise<Item[]> {
  const result = await callSearchTool({
    source: 'exa',
    endpoint: config.mcp_url ?? 'https://mcp.exa.ai/mcp',
    tool: 'web_search_exa',
    args: {
      query,
      objective: `Find relevant web pages about: ${query}`,
      numResults: Math.min(limit, 100),
    },
  });
  const data = toolData(result);
  if (typeof data === 'string') return exaTextItems(data, limit);
  const parsed = z.object({ results: z.unknown() }).safeParse(data);
  if (!parsed.success) throw new Error('exa: invalid MCP search response');
  return structuredItems('exa', parsed.data.results, limit);
}

/** Search Parallel using its keyless or explicitly authenticated MCP service. */
export async function parallel(_ctx: Ctx, query: string, limit: number): Promise<Item[]> {
  const config = providerConfig('parallel');
  const result = await callSearchTool({
    source: 'parallel',
    endpoint: config.mcp_url ?? 'https://mcp.parallel.ai/mcp',
    tool: 'web_search',
    headers: optionalHeaders(config),
    args: { objective: `Find relevant web pages about: ${query}`, search_queries: [query] },
  });
  const parsed = z.object({ results: z.unknown() }).safeParse(toolData(result));
  if (!parsed.success) throw new Error('parallel: invalid MCP search response');
  return structuredItems('parallel', parsed.data.results, limit);
}

/** Search Firecrawl without invoking scraping, crawling or follow-up tools. */
export async function firecrawl(_ctx: Ctx, query: string, limit: number): Promise<Item[]> {
  const config = providerConfig('firecrawl');
  const result = await callSearchTool({
    source: 'firecrawl',
    endpoint: config.mcp_url ?? 'https://mcp.firecrawl.dev/v2/mcp',
    tool: 'firecrawl_search',
    headers: optionalHeaders(config),
    args: {
      query,
      objective: `Find relevant web pages about: ${query}`,
      limit: Math.min(limit, 100),
      sources: ['web'],
      highlights: false,
      domainTools: false,
    },
  });
  const parsed = z
    .object({ success: z.boolean(), data: z.object({ web: z.unknown() }) })
    .safeParse(toolData(result));
  if (!parsed.success || !parsed.data.success)
    throw new Error('firecrawl: invalid or unsuccessful MCP search response');
  return structuredItems('firecrawl', parsed.data.data.web, limit);
}
