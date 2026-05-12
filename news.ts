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
  'reuters',
  'cnbc-ai',
  'ars',
  'theverge',
  'infoq',
  'people',
  'csdn',
] as const;
const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const USAGE = `\
Usage: npx tsx news.ts --sources <ids|all> [options]

Options:
  -s, --sources <ids|all>  Comma-separated source IDs or "all"
                           HTTP: hn, bbc, techcrunch, sina, ars, theverge, infoq, people, csdn
                           Browser: reuters, cnbc-ai
                           Multiple: -s hn,bbc,techcrunch
  -m, --mode list|detail   Fetch mode (default: list)
  -n, --limit N            Max articles per source (default: ${CONFIG.DEFAULT_LIMIT})
  -o, --out DIR            Write output files to DIR/YYYYMMDD/
                           (default: print JSON/markdown to stdout)
  -c, --concurrency N      Parallel sources (default: ${CONFIG.DEFAULT_CONCURRENCY})
  -l, --loglevel LEVEL     Log verbosity: debug|info|warn|error (default: info)
  -h, --help               Show this help

Examples:
  npx tsx news.ts -s hn -m list -n 10
  npx tsx news.ts -s hn,bbc,techcrunch
  npx tsx news.ts -s bbc -m detail -n 3
  npx tsx news.ts -s all -o data/news/
  npx tsx news.ts -s hn -l debug`;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

type ParsedArgs = {
  sources: string[];
  mode: 'list' | 'detail';
  limit: number;
  out: string | null; // null = stdout
  concurrency: number;
  loglevel: LogLevel;
};

/** Parse and validate CLI arguments; returns ParsedArgs or null on error. */
function parseCLI(argv: string[]): ParsedArgs | null {
  let raw: ReturnType<typeof parseArgs>;
  try {
    raw = parseArgs({
      args: argv,
      options: {
        sources: { type: 'string', short: 's' },
        mode: { type: 'string', short: 'm', default: 'list' },
        limit: { type: 'string', short: 'n', default: String(CONFIG.DEFAULT_LIMIT) },
        out: { type: 'string', short: 'o' },
        concurrency: { type: 'string', short: 'c', default: String(CONFIG.DEFAULT_CONCURRENCY) },
        loglevel: { type: 'string', short: 'l', default: 'info' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
    });
  } catch (err) {
    process.stderr.write(`[ERROR] ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }

  const v = raw.values;

  if (v.help) return null;

  if (!v.sources) {
    process.stderr.write('[ERROR] --sources is required\n');
    return null;
  }

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

  const mode = v.mode as string;
  if (mode !== 'list' && mode !== 'detail') {
    process.stderr.write(`[ERROR] --mode must be "list" or "detail", got: ${mode}\n`);
    return null;
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

  const loglevel = (v.loglevel as string).toLowerCase();
  if (!(LOG_LEVELS as string[]).includes(loglevel)) {
    process.stderr.write(
      `[ERROR] --loglevel must be one of ${LOG_LEVELS.join('|')}, got: ${loglevel}\n`,
    );
    return null;
  }

  return {
    sources,
    mode: mode as 'list' | 'detail',
    limit,
    out: v.out !== undefined ? (v.out as string) : null,
    concurrency,
    loglevel: loglevel as LogLevel,
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

  const tasks = items.map((item) =>
    acquire().then(async () => {
      try {
        await fn(item);
      } finally {
        release();
      }
    }),
  );

  await Promise.all(tasks);
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

    if (outDir) log.info(`Output directory: ${outDir}`);
    log.info(
      `Sources: ${args.sources.join(', ')} | mode=${args.mode} limit=${args.limit} concurrency=${args.concurrency}`,
    );

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

                if (outDir) {
                  const path = await writeArticleMd(outDir, plugin.id, n, item.title, md);
                  item.md_path = path;
                  log.debug(`[${plugin.id}] Wrote ${path}`);
                } else {
                  // Separate articles with a markdown horizontal rule
                  process.stdout.write(`---\n# ${item.title}\n\n${md}\n\n`);
                }
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

    if (args.mode === 'list') {
      if (outDir) {
        await writeListJson(outDir, allItems);
        log.info(`Wrote index.json with ${allItems.length} total items to ${outDir}`);
      } else {
        process.stdout.write(JSON.stringify(allItems, null, 2) + '\n');
      }
    }

    if (errors.length > 0) log.warn(`Failed sources: ${errors.join(', ')}`);
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
