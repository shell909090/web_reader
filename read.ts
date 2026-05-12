// read.ts — fetch news feeds, read URLs as markdown, query data sources.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

import {
  CONFIG,
  makeLogger,
  httpGet,
  extractMarkdown,
  type Item,
  type Plugin,
  type Ctx,
  type Logger,
  type LogLevel,
} from './lib.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KNOWN_SOURCES = [
  'hn',
  'bbc',
  'techcrunch',
  'sina',
  'ars',
  'theverge',
  'infoq',
  'people',
  'csdn',
  'wiki',
  'zhwiki',
  'reddit',
  'caixin',
  'thepaper',
  'xinhua',
  'mittr',
  'wsj',
  'cnbc',
  'nytimes',
  'huggingface',
  'oschina',
  'juejin',
] as const;

/** Named source presets — expanded before plugin loading. */
const SETS: Record<string, string[]> = {
  news: ['bbc', 'nytimes', 'xinhua', 'thepaper'],
  tech: ['hn', 'ars', 'mittr', 'infoq'],
  fin: ['caixin', 'wsj', 'cnbc:markets'],
};

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const USAGE = `\
Usage:
  list mode:   npx tsx read.ts -s <ids|all> [options]
  detail mode: npx tsx read.ts <url…>
               npx tsx read.ts -s hn | jq -r '.[].url' | npx tsx read.ts
  query mode:  npx tsx read.ts -q wiki <keywords…>

  Mode is inferred: -s → list, -q → query, otherwise → detail.

Options:
  -s, --sources <ids|all>  Comma-separated source IDs, set names, or "all"
                           Presets: news (bbc+nytimes+xinhua+thepaper)
                                    tech (hn+ars+mittr+infoq)
                                    fin  (caixin+wsj+cnbc:markets)
                           Categories: reddit:ml/llm/ai/tech/prog/investing/stocks/worldnews
                                       wsj:world/us/markets/opinion/main
                                       cnbc:top/world/markets/tech/finance/us/health/politics/intl/ai
                                       mittr:ai/computing/space/biotech (default: main RSS)
                                       xinhua:politics/world/society/finance/tech/mil/legal/health/edu
                           Others: hn bbc techcrunch sina ars theverge infoq people csdn
                                   caixin wiki nytimes huggingface oschina juejin
  -q, --query SOURCE       Query a data source; keywords follow as positional args
                           Searchable sources: wiki (EN), zhwiki (中文), reddit
  -n, --limit N            Max results (default: ${CONFIG.DEFAULT_LIMIT})
  -o, --out FILE           Write output to FILE instead of stdout
  -c, --concurrency N      [list] Parallel sources (default: ${CONFIG.DEFAULT_CONCURRENCY})
  -l, --loglevel LEVEL     Log verbosity: debug|info|warn|error (default: warn)
  -h, --help               Show this help

Examples:
  npx tsx read.ts -s news
  npx tsx read.ts -s tech -n 30
  npx tsx read.ts -s fin -o fin.json
  npx tsx read.ts https://arstechnica.com/tech/2026/05/article
  npx tsx read.ts -q wiki transformer architecture
  npx tsx read.ts -q wiki large language models | jq -r '.[0].url' | npx tsx read.ts`;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/** One entry per unique source ID with all requested categories merged. */
type SourceRequest = { id: string; categories: string[] };

type ParsedArgs =
  | {
      mode: 'list';
      sources: SourceRequest[];
      limit: number;
      concurrency: number;
      out: string | null;
      loglevel: LogLevel;
    }
  | { mode: 'detail'; urls: string[]; out: string | null; loglevel: LogLevel }
  | {
      mode: 'query';
      source: string;
      keywords: string[];
      limit: number;
      out: string | null;
      loglevel: LogLevel;
    };

/** Parse "id", "id:category", or set name tokens, grouping categories per source ID. */
function parseSourceTokens(input: string): SourceRequest[] | null {
  // Expand set names first, preserving category suffixes on plain tokens
  const raw = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const tokens: string[] = [];
  for (const tok of raw) {
    const setName = tok.split(':')[0];
    if (SETS[setName] && !tok.includes(':')) {
      tokens.push(...SETS[setName]); // expand set → member tokens
    } else {
      tokens.push(tok);
    }
  }

  const grouped = new Map<string, string[]>();
  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    const id = colon >= 0 ? tok.slice(0, colon) : tok;
    const cat = colon >= 0 ? tok.slice(colon + 1) : '';
    if (!(KNOWN_SOURCES as readonly string[]).includes(id)) {
      process.stderr.write(`[ERROR] Unknown source: ${id}\n`);
      return null;
    }
    if (!grouped.has(id)) grouped.set(id, []);
    if (cat) grouped.get(id)!.push(cat);
  }
  return [...grouped.entries()].map(([id, categories]) => ({ id, categories }));
}

/** Parse and validate CLI arguments; returns ParsedArgs or null on error. */
function parseCLI(argv: string[]): ParsedArgs | null {
  let raw: { values: Record<string, string | boolean | undefined>; positionals: string[] };
  try {
    raw = parseArgs({
      args: argv,
      options: {
        sources: { type: 'string', short: 's' },
        query: { type: 'string', short: 'q' },
        limit: { type: 'string', short: 'n', default: String(CONFIG.DEFAULT_LIMIT) },
        out: { type: 'string', short: 'o' },
        concurrency: { type: 'string', short: 'c', default: String(CONFIG.DEFAULT_CONCURRENCY) },
        loglevel: { type: 'string', short: 'l', default: 'warn' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    process.stderr.write(`[ERROR] ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }

  const v = raw.values;
  if (v.help) return null;

  const loglevel = (v.loglevel as string).toLowerCase();
  if (!(LOG_LEVELS as string[]).includes(loglevel)) {
    process.stderr.write(
      `[ERROR] --loglevel must be one of ${LOG_LEVELS.join('|')}, got: ${loglevel}\n`,
    );
    return null;
  }

  const out = v.out !== undefined ? (v.out as string) : null;

  // -q: query mode
  if (v.query !== undefined) {
    const source = (v.query as string).trim();
    if (!source) {
      process.stderr.write('[ERROR] -q requires a source name\n');
      return null;
    }
    if (raw.positionals.length === 0) {
      process.stderr.write('[ERROR] -q requires keywords\n');
      return null;
    }
    const limit = Number(v.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      process.stderr.write(`[ERROR] --limit must be a positive integer\n`);
      return null;
    }
    return {
      mode: 'query',
      source,
      keywords: raw.positionals,
      limit,
      out,
      loglevel: loglevel as LogLevel,
    };
  }

  // Mode is inferred: -s present → list, absent → detail
  if (!v.sources) {
    return { mode: 'detail', urls: raw.positionals, out, loglevel: loglevel as LogLevel };
  }

  let sources: SourceRequest[];
  if (v.sources === 'all') {
    sources = [...KNOWN_SOURCES].map((id) => ({ id, categories: [] }));
  } else {
    const parsed = parseSourceTokens(v.sources as string);
    if (!parsed) return null;
    if (parsed.length === 0) {
      process.stderr.write('[ERROR] --sources cannot be empty\n');
      return null;
    }
    sources = parsed;
  }

  const limit = Number(v.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    process.stderr.write(`[ERROR] --limit must be a positive integer, got: ${v.limit}\n`);
    return null;
  }

  const concurrency = Number(v.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    process.stderr.write(
      `[ERROR] --concurrency must be a positive integer, got: ${v.concurrency}\n`,
    );
    return null;
  }

  return { mode: 'list', sources, limit, concurrency, out, loglevel: loglevel as LogLevel };
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

/** Run fn over items with at most `limit` concurrent executions (semaphore pattern). */
async function pConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let running = 0;
  const pending: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (running < limit) {
      running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => pending.push(resolve));
  };

  const release = (): void => {
    const next = pending.shift();
    if (next) {
      next();
    } else {
      running--;
    }
  };

  await Promise.all(
    items.map((item) =>
      acquire().then(async () => {
        try {
          await fn(item);
        } finally {
          release();
        }
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Error reporting — always stderr
// ---------------------------------------------------------------------------

function logError(info: { source: string; url?: string; stage: string; err: unknown }): void {
  const msg = info.err instanceof Error ? info.err.message : String(info.err);
  process.stderr.write(`[ERR] ${info.source}${info.url ? ' ' + info.url : ''}: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Plugin loader
// ---------------------------------------------------------------------------

/** Dynamically import a plugin by source id; returns null if the file is not found. */
async function loadPlugin(id: string, log: Logger): Promise<Plugin | null> {
  const pluginUrl = new URL(`./plugins/${id}.ts`, import.meta.url).href;
  try {
    const mod = (await import(pluginUrl)) as { default: Plugin };
    return mod.default;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('Cannot find module') ||
      msg.includes('ERR_MODULE_NOT_FOUND') ||
      msg.includes('does not provide an export') ||
      msg.includes('ENOENT')
    ) {
      log.warn(`Plugin not found, skipping source: ${id}`);
    } else {
      log.warn(`Failed to load plugin "${id}": ${msg}`);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stdin reader (for piped URLs in detail mode)
// ---------------------------------------------------------------------------

async function readStdinLines(): Promise<string[]> {
  if (process.stdin.isTTY) return [];
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks)
    .toString('utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Main entry point; returns exit code. */
export async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }

  const timeout = setTimeout(() => {
    process.stderr.write('[ERROR] Total timeout exceeded\n');
    process.exit(4);
  }, CONFIG.TOTAL_TIMEOUT_MS);
  timeout.unref();

  try {
    const args = parseCLI(argv);
    if (!args) {
      process.stderr.write(USAGE + '\n');
      return 2;
    }

    const log = makeLogger(args.loglevel);

    // ------------------------------------------------------------------
    // Query mode: search a data source by keyword
    // ------------------------------------------------------------------
    if (args.mode === 'query') {
      const plugin = await loadPlugin(args.source, log);
      if (!plugin) {
        log.error(`Unknown or unavailable query source: ${args.source}`);
        return 2;
      }
      if (!plugin.search) {
        log.error(`Source "${args.source}" does not support search. Searchable: wiki`);
        return 2;
      }
      const query = args.keywords.join(' ');
      log.debug(`Querying ${args.source}: "${query}"`);
      const ctx: Ctx = { mode: 'http', httpGet, log };
      const items = await plugin.search(ctx, query, args.limit);
      const json = JSON.stringify(items, null, 2) + '\n';
      if (args.out) {
        await writeFile(args.out, json, 'utf-8');
      } else {
        process.stdout.write(json);
      }
      return 0;
    }

    // ------------------------------------------------------------------
    // Detail mode: fetch full content for given URLs
    // ------------------------------------------------------------------
    if (args.mode === 'detail') {
      const urls = args.urls.length > 0 ? args.urls : await readStdinLines();
      if (urls.length === 0) {
        log.error('detail mode requires URLs — pass as arguments or pipe via stdin');
        process.stderr.write(USAGE + '\n');
        return 2;
      }

      const chunks: string[] = [];
      let failures = 0;
      for (const url of urls) {
        try {
          const { html } = await httpGet(url);
          const md = extractMarkdown(html, url);
          const title = decodeURIComponent(
            new URL(url).pathname.split('/').filter(Boolean).pop() ?? url,
          );
          chunks.push(`---\n# ${title}\n\n${md}\n`);
        } catch (err) {
          failures++;
          logError({ source: 'detail', url, stage: 'detail', err });
        }
      }

      const output = chunks.join('\n');
      if (args.out) {
        await writeFile(args.out, output, 'utf-8');
      } else {
        process.stdout.write(output);
      }

      if (failures === urls.length) return 3;
      return 0;
    }

    // ------------------------------------------------------------------
    // List mode: fetch article lists from sources
    // ------------------------------------------------------------------
    type LoadedSource = { plugin: Plugin; categories: string[] };
    const loaded: LoadedSource[] = [];
    for (const req of args.sources) {
      const plugin = await loadPlugin(req.id, log);
      if (plugin) loaded.push({ plugin, categories: req.categories });
    }

    if (loaded.length === 0) {
      log.error('No plugins could be loaded; aborting.');
      return 3;
    }

    const allItems: Item[] = [];
    const errors: string[] = [];

    const ctx: Ctx = { mode: 'http', httpGet, log };
    await pConcurrent(loaded, args.concurrency, async ({ plugin, categories }) => {
      const label = categories.length ? `${plugin.id}:${categories.join('+')}` : plugin.id;
      try {
        const items = await plugin.list(ctx, { limit: args.limit, categories });
        allItems.push(...items);
      } catch (err) {
        errors.push(label);
        logError({ source: label, stage: 'list', err });
      }
    });

    const json = JSON.stringify(allItems, null, 2) + '\n';
    if (args.out) {
      await writeFile(args.out, json, 'utf-8');
    } else {
      process.stdout.write(json);
    }

    if (errors.length > 0) log.warn(`Failed sources: ${errors.join(', ')}`);
    if (errors.length === loaded.length) {
      log.error('All sources failed.');
      return 3;
    }
    return 0;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// MCP Server mode
// ---------------------------------------------------------------------------

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
            'Examples: "news", "tech", "hn,bbc", "wsj:markets", "reddit:ml"',
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
    async ({ urls }) => {
      const chunks: string[] = [];
      for (const url of urls) {
        try {
          const { html } = await httpGet(url);
          const md = extractMarkdown(html, url);
          const title = decodeURIComponent(
            new URL(url).pathname.split('/').filter(Boolean).pop() ?? url,
          );
          chunks.push(`---\n# ${title}\n\n${md}\n`);
        } catch (err) {
          chunks.push(
            `---\n# Error fetching ${url}\n\n${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      }
      return { content: [{ type: 'text', text: chunks.join('\n') }] };
    },
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
    async ({ source, query, limit }) => {
      const plugin = await loadPlugin(source, log);
      if (!plugin)
        return {
          content: [{ type: 'text', text: `Error: unknown source "${source}"` }],
          isError: true,
        };
      if (!plugin.search)
        return {
          content: [{ type: 'text', text: `Error: "${source}" does not support search` }],
          isError: true,
        };
      const ctx: Ctx = { mode: 'http', httpGet, log };
      const items = await plugin.search(ctx, query, limit ?? 10);
      return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const isMcp = process.argv.includes('--mcp');
  if (isMcp) {
    startMcp().catch((err) => {
      process.stderr.write(`[FATAL] ${err}\n`);
      process.exit(1);
    });
  } else {
    main(process.argv.slice(2))
      .then((code) => process.exit(code))
      .catch((err) => {
        process.stderr.write(`[FATAL] ${err}\n`);
        process.exit(1);
      });
  }
}
