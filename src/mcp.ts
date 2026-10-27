import { readUrls, search } from './mcp-tools.ts';
import { CONFIG, makeLogger, httpGet, type Item, type Plugin, type Ctx } from '../lib.ts';
import { parseSourceTokens } from './cli/sources.ts';
import { loadPlugin } from './plugin-loader.ts';
import { pConcurrent } from './concurrency.ts';

export async function startMcp(): Promise<void> {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { z } = await import('zod');

  const server = new McpServer({ name: 'web-reader', version: '0.1.0' });
  const log = makeLogger('warn');

  // Tool 1: list — fetch news feeds
  server.tool(
    'list_news',
    'Fetch news article list from sources. Returns JSON array with title/url/notes/summary fields.',
    {
      sources: z
        .string()
        .describe(
          'Comma-separated source IDs or preset names (news/tech/fin). ' +
            'Examples: "news", "tech", "hn,bbc", "cnbc:markets", "reddit:ml"',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Max articles per source (default 50)'),
    },
    async ({ sources, limit }) => {
      const parsed = parseSourceTokens(sources);
      if (!parsed)
        return { content: [{ type: 'text', text: 'Error: unknown source' }], isError: true };

      const loaded: { plugin: Plugin; categories: string[] }[] = [];
      for (const req of parsed) {
        const plugin = await loadPlugin(req.id, log);
        if (plugin) loaded.push({ plugin, categories: req.categories });
      }
      if (loaded.length === 0)
        return { content: [{ type: 'text', text: 'Error: no plugins loaded' }], isError: true };

      const allItems: Item[] = [];
      const ctx: Ctx = { mode: 'http', httpGet, log };
      await pConcurrent(loaded, CONFIG.DEFAULT_CONCURRENCY, async ({ plugin, categories }) => {
        try {
          const items = await plugin.list(ctx, {
            limit: limit ?? CONFIG.DEFAULT_LIMIT,
            categories,
          });
          allItems.push(...items);
        } catch {
          /* individual failures are silent in MCP */
        }
      });

      return { content: [{ type: 'text', text: JSON.stringify(allItems, null, 2) }] };
    },
  );

  // Tool 2: read_url — fetch full text of URLs as markdown
  server.tool(
    'read_url',
    'Fetch the full text of one or more URLs and return as Markdown.',
    {
      urls: z.array(z.string().url()).min(1).max(10).describe('URLs to fetch'),
    },
    readUrls,
  );

  // Tool 3: search — search a data source
  server.tool(
    'search',
    'Search a data source by keyword. Returns JSON list of matching articles.',
    {
      source: z
        .string()
        .describe('Source to search: wiki (English Wikipedia), zhwiki (中文维基百科), reddit'),
      query: z.string().min(1).describe('Search keywords'),
      limit: z.number().int().min(1).max(20).optional().describe('Max results (default 10)'),
    },
    search,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
