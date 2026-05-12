// CLI entry point for the news fetching tool.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CONFIG,
  makeLogger,
  httpGet,
  extractMarkdown,
  writeListJson,
  writeArticleMd,
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
  'mittr',
  'wsj',
  'cnbc',
  'nytimes',
  'huggingface',
  'oschina',
  'juejin',
] as const;
const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const USAGE = `\
Usage:
  list mode:   npx tsx news.ts -s <ids|all> [options]
  detail mode: npx tsx news.ts -m detail <url…>
               npx tsx news.ts -s hn | jq -r '.[].url' | npx tsx news.ts -m detail

Options:
  -s, --sources <ids|all>  [list] Comma-separated source IDs, or "all"
                           Sources with categories use id:category syntax, e.g. wsj:markets
                           wsj categories:  world us markets opinion main
                           cnbc categories: top world markets tech finance us health politics ai
                           Other: hn bbc techcrunch sina ars theverge mittr infoq people csdn
                                  wiki nytimes huggingface oschina juejin
  -m, --mode list|detail   Fetch mode (default: list)
  -n, --limit N            [list] Max articles per source (default: ${CONFIG.DEFAULT_LIMIT})
  -o, --out DIR            Write output files to DIR/YYYYMMDD/
                           (default: print JSON/markdown to stdout)
  -c, --concurrency N      [list] Parallel sources (default: ${CONFIG.DEFAULT_CONCURRENCY})
  -l, --loglevel LEVEL     Log verbosity: debug|info|warn|error (default: warn)
  -h, --help               Show this help

Examples:
  npx tsx news.ts -s hn,bbc,wsj
  npx tsx news.ts -s wsj:markets,wsj:world -n 50
  npx tsx news.ts -s cnbc:tech,cnbc:ai -n 30
  npx tsx news.ts -s all -o data/news/
  npx tsx news.ts -s hn -n 5 | jq -r '.[].url' | npx tsx news.ts -m detail`;

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
  | { mode: 'detail'; urls: string[]; out: string | null; loglevel: LogLevel };

/** Parse "id" or "id:category" tokens, grouping categories per source ID. */
function parseSourceTokens(input: string): SourceRequest[] | null {
  const tokens = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
        mode: { type: 'string', short: 'm', default: 'list' },
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

  const mode = v.mode as string;
  if (mode !== 'list' && mode !== 'detail') {
    process.stderr.write(`[ERROR] --mode must be "list" or "detail", got: ${mode}\n`);
    return null;
  }

  const out = v.out !== undefined ? (v.out as string) : null;

  // ---- detail mode ----
  if (mode === 'detail') {
    return { mode: 'detail', urls: raw.positionals, out, loglevel: loglevel as LogLevel };
  }

  // ---- list mode ----
  if (!v.sources) {
    process.stderr.write('[ERROR] --sources is required in list mode\n');
    return null;
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
// Error reporting
// ---------------------------------------------------------------------------

/** Write a structured error entry to outDir/_errors.log, or stderr when outDir is null. */
async function logError(
  outDir: string | null,
  info: { source: string; url?: string; stage: string; err: unknown },
): Promise<void> {
  const entry = {
    ts: new Date().toISOString(),
    source: info.source,
    url: info.url ?? null,
    stage: info.stage,
    message: info.err instanceof Error ? info.err.message : String(info.err),
    stack: info.err instanceof Error ? (info.err.stack ?? null) : null,
  };
  const line = JSON.stringify(entry) + '\n';
  if (outDir === null) {
    process.stderr.write('[ERR] ' + line);
  } else {
    await mkdir(outDir, { recursive: true });
    await appendFile(join(outDir, '_errors.log'), line, 'utf-8');
  }
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
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const outDir = args.out !== null ? join(args.out, dateStr) : null;

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

      log.info(`Fetching detail for ${urls.length} URL(s)`);
      let n = 0;
      let failures = 0;
      for (const url of urls) {
        n++;
        try {
          const { html } = await httpGet(url);
          const md = extractMarkdown(html, url);
          // Use the last path segment as a rough title fallback
          const title = decodeURIComponent(
            new URL(url).pathname.split('/').filter(Boolean).pop() ?? url,
          );
          if (outDir) {
            const path = await writeArticleMd(outDir, 'detail', n, title, md);
            log.info(`Wrote ${path}`);
          } else {
            process.stdout.write(`---\n# ${title}\n\n${md}\n\n`);
          }
        } catch (err) {
          failures++;
          log.warn(`Failed ${url}: ${err instanceof Error ? err.message : String(err)}`);
          await logError(outDir, { source: 'detail', url, stage: 'detail', err });
        }
      }

      if (failures === urls.length) return 3;
      return 0;
    }

    // ------------------------------------------------------------------
    // List mode: fetch article lists from sources
    // ------------------------------------------------------------------
    const srcStr = args.sources
      .map((s) => (s.categories.length ? `${s.id}:${s.categories.join('+')}` : s.id))
      .join(', ');
    log.info(`Sources: ${srcStr} | limit=${args.limit} concurrency=${args.concurrency}`);

    // Load plugins for each requested source
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
      log.info(`[${label}] Fetching list`);
      try {
        const items = await plugin.list(ctx, { limit: args.limit, categories });
        log.info(`[${label}] ${items.length} items`);
        allItems.push(...items);
      } catch (err) {
        log.error(`[${label}] failed: ${err instanceof Error ? err.message : String(err)}`);
        errors.push(label);
        await logError(outDir, { source: label, stage: 'list', err });
      }
    });

    if (outDir) {
      await writeListJson(outDir, allItems);
      log.info(`Wrote index.json with ${allItems.length} items to ${outDir}`);
    } else {
      process.stdout.write(JSON.stringify(allItems, null, 2) + '\n');
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

// Run as CLI when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
