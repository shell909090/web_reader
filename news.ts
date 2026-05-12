// CLI entry point for the news fetching tool.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CONFIG,
  makeLogger,
  httpGet,
  withBrowser,
  extractMarkdown,
  writeListJson,
  writeArticleMd,
  type Item,
  type Plugin,
  type Ctx,
  type Logger,
} from './lib.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KNOWN_SOURCES = ['hn', 'bbc', 'techcrunch', 'sina', 'reuters', 'cnbc-ai'] as const;

const USAGE = `\
Usage: npx tsx news.ts [options]

Options:
  --sources <ids|all>    Comma-separated source IDs or "all"
                         Available: hn, bbc, techcrunch, sina, reuters, cnbc-ai
  --mode list|detail     Fetch mode (default: list)
  --limit N              Max articles per source (default: 20)
  --out DIR              Output directory (default: data/news/)
  --concurrency N        Parallel sources (default: 2)
  --debug                Enable debug logging
  --help                 Show this help

Examples:
  npx tsx news.ts --sources hn --mode list --limit 10
  npx tsx news.ts --sources bbc --mode detail --limit 3
  npx tsx news.ts --sources all --mode list`;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

type ParsedArgs = {
  sources: string[];
  mode: 'list' | 'detail';
  limit: number;
  out: string;
  concurrency: number;
  debug: boolean;
};

/** Parse and validate CLI arguments; returns ParsedArgs or null on error. */
function parseCLI(argv: string[]): ParsedArgs | null {
  let raw: ReturnType<typeof parseArgs>;
  try {
    raw = parseArgs({
      args: argv,
      options: {
        sources: { type: 'string' },
        mode: { type: 'string', default: 'list' },
        limit: { type: 'string', default: String(CONFIG.DEFAULT_LIMIT) },
        out: { type: 'string', default: 'data/news' },
        concurrency: { type: 'string', default: String(CONFIG.DEFAULT_CONCURRENCY) },
        debug: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    });
  } catch (err) {
    process.stderr.write(`[ERROR] ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }

  const v = raw.values;

  // --help is handled by the caller
  if (v.help) return null;

  // --sources is required
  if (!v.sources) {
    process.stderr.write('[ERROR] --sources is required\n');
    return null;
  }

  // Resolve source list
  let sources: string[];
  if (v.sources === 'all') {
    sources = [...KNOWN_SOURCES];
  } else {
    sources = (v.sources as string)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const unknown = sources.filter((s) => !(KNOWN_SOURCES as readonly string[]).includes(s));
    if (unknown.length > 0) {
      process.stderr.write(`[ERROR] Unknown source(s): ${unknown.join(', ')}\n`);
      return null;
    }
    if (sources.length === 0) {
      process.stderr.write('[ERROR] --sources cannot be empty\n');
      return null;
    }
  }

  // --mode
  const mode = v.mode as string;
  if (mode !== 'list' && mode !== 'detail') {
    process.stderr.write(`[ERROR] --mode must be "list" or "detail", got: ${mode}\n`);
    return null;
  }

  // --limit
  const limit = Number(v.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    process.stderr.write(`[ERROR] --limit must be a positive integer, got: ${v.limit}\n`);
    return null;
  }

  // --concurrency
  const concurrency = Number(v.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    process.stderr.write(
      `[ERROR] --concurrency must be a positive integer, got: ${v.concurrency}\n`,
    );
    return null;
  }

  return {
    sources,
    mode: mode as 'list' | 'detail',
    limit,
    out: v.out as string,
    concurrency,
    debug: v.debug as boolean,
  };
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
  let index = 0;
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
      // A waiter gets the slot immediately; running count stays the same
      next();
    } else {
      running--;
    }
  };

  const tasks: Array<Promise<void>> = [];

  for (const item of items) {
    index++;
    void index; // suppress unused warning
    tasks.push(
      acquire().then(async () => {
        try {
          await fn(item);
        } finally {
          release();
        }
      }),
    );
  }

  await Promise.all(tasks);
}

// ---------------------------------------------------------------------------
// Error log writer
// ---------------------------------------------------------------------------

/** Append a structured error entry to outDir/_errors.log. */
async function logError(
  outDir: string,
  info: { source: string; url?: string; stage: string; err: unknown },
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    source: info.source,
    url: info.url ?? null,
    stage: info.stage,
    message: info.err instanceof Error ? info.err.message : String(info.err),
    stack: info.err instanceof Error ? (info.err.stack ?? null) : null,
  };
  await appendFile(join(outDir, '_errors.log'), JSON.stringify(entry) + '\n', 'utf-8');
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
    // Distinguish "module not found" from real import errors
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
// Main
// ---------------------------------------------------------------------------

/** Main entry point; returns exit code. */
export async function main(argv: string[]): Promise<number> {
  // Handle --help before full arg parsing so we always print on --help
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }

  // Set total timeout guard
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

    const log = makeLogger(args.debug ? 'debug' : 'info');

    // Build date-stamped output directory
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const outDir = join(args.out, dateStr);

    log.info(`Output directory: ${outDir}`);
    log.info(
      `Sources: ${args.sources.join(', ')} | mode=${args.mode} limit=${args.limit} concurrency=${args.concurrency}`,
    );

    // Load plugins
    const plugins: Plugin[] = [];
    for (const id of args.sources) {
      const plugin = await loadPlugin(id, log);
      if (plugin) plugins.push(plugin);
    }

    if (plugins.length === 0) {
      log.error('No plugins could be loaded; aborting.');
      return 3;
    }

    log.debug(`Loaded ${plugins.length} plugin(s)`);

    const allItems: Item[] = [];
    const errors: string[] = [];

    await withBrowser(plugins, async (getPage) => {
      await pConcurrent(plugins, args.concurrency, async (plugin) => {
        log.info(`[${plugin.id}] Starting ${args.mode}`);
        try {
          const ctx: Ctx = plugin.needsBrowser
            ? { mode: 'browser', page: await getPage(plugin.id), log }
            : { mode: 'http', httpGet, log };

          const items = await plugin.list(ctx, { limit: args.limit });
          log.info(`[${plugin.id}] Fetched ${items.length} items`);

          if (args.mode === 'detail') {
            let n = 0;
            for (const item of items) {
              n++;
              try {
                const md = plugin.detail
                  ? await plugin.detail(ctx, item)
                  : extractMarkdown((await httpGet(item.url)).html, item.url);
                const path = await writeArticleMd(outDir, plugin.id, n, item.title, md);
                item.md_path = path;
                log.debug(`[${plugin.id}] Wrote ${path}`);
              } catch (err) {
                log.warn(
                  `[${plugin.id}] detail failed for "${item.title}": ${err instanceof Error ? err.message : String(err)}`,
                );
                await logError(outDir, { source: plugin.id, url: item.url, stage: 'detail', err });
              }
            }
          }

          allItems.push(...items);
        } catch (err) {
          log.error(
            `[${plugin.id}] list failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          errors.push(plugin.id);
          await logError(outDir, { source: plugin.id, stage: 'list', err });
        }
      });
    });

    await writeListJson(outDir, allItems);
    log.info(`Wrote list.json with ${allItems.length} total items to ${outDir}`);

    if (errors.length > 0) {
      log.warn(`Failed sources: ${errors.join(', ')}`);
    }

    // Exit code logic
    if (errors.length === plugins.length) {
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
