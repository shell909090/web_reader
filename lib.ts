// Shared utilities: HTTP, browser, extraction, output. Implemented across T02-T05.
// Plugin system types are defined here so plugins, lib, and news.ts share one source of truth.

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// CJS-safe loader for jsdom, readability, turndown (all CommonJS packages)
const _require = createRequire(import.meta.url);

export const CONFIG = {
  UA: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  VIEWPORT: { width: 1280, height: 800 },
  LOCALE_EN: 'en-US',
  LOCALE_CN: 'zh-CN',
  TIMEZONE: 'America/New_York',
  HTTP_TIMEOUT_MS: 30_000,
  NAV_TIMEOUT_MS: 30_000,
  TOTAL_TIMEOUT_MS: 600_000,
  DEFAULT_LIMIT: 20,
  DEFAULT_CONCURRENCY: 2,
} as const;

// ---------------------------------------------------------------------------
// Plugin system shared types
// ---------------------------------------------------------------------------

export type Logger = {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
};

export type Item = {
  source: string;
  title: string;
  url: string;
  notes: string;
} & Record<string, unknown>;

export type Ctx =
  | { mode: 'http'; httpGet(url: string, opts?: HttpGetOpts): Promise<HttpResponse>; log: Logger }
  | { mode: 'browser'; page: import('playwright').Page; log: Logger };

export type Plugin = {
  id: string;
  needsBrowser: boolean;
  list(ctx: Ctx, opts: { limit: number }): Promise<Item[]>;
  detail?(ctx: Ctx, item: Item): Promise<string>;
};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export type HttpGetOpts = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type HttpResponse = {
  status: number;
  html: string;
  finalUrl: string;
};

const DEFAULT_HEADERS = {
  'User-Agent': CONFIG.UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
};

const MAX_REDIRECTS = 5;

/** Extract charset from Content-Type header value, fallback to 'utf-8'. */
function parseCharset(contentType: string | null): string {
  if (!contentType) return 'utf-8';
  const match = contentType.match(/charset=([^\s;]+)/i);
  if (!match) return 'utf-8';
  const cs = match[1].toLowerCase().replace(/^["']|["']$/g, '');
  // Normalize CJK legacy encodings to 'gbk' which TextDecoder supports
  if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb18030') return 'gbk';
  return cs;
}

/** Perform a single fetch attempt with redirect tracking and GBK-aware decoding. */
async function fetchOnce(
  url: string,
  mergedHeaders: Record<string, string>,
  timeoutMs: number,
): Promise<HttpResponse> {
  let currentUrl = url;
  let redirectsLeft = MAX_REDIRECTS;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        headers: mergedHeaders,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;

    // Manual redirect handling
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        // No location header; treat as final response with empty body
        return { status, html: '', finalUrl: currentUrl };
      }
      if (redirectsLeft === 0) {
        throw new Error(`Too many redirects (>${MAX_REDIRECTS}) starting from ${url}`);
      }
      redirectsLeft--;
      // Resolve relative redirects against current URL
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    const charset = parseCharset(response.headers.get('content-type'));
    const buffer = await response.arrayBuffer();
    const html = new TextDecoder(charset).decode(buffer);

    return { status, html, finalUrl: currentUrl };
  }
}

/** Sleep for a randomised back-off before a retry (base + up to 500ms jitter). */
function sleep(baseMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, baseMs + Math.random() * 500));
}

// Only retry on transient network failures; logic errors (e.g. redirect loops) should propagate.
function isRetriableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof TypeError) return true; // undici/node fetch throws TypeError for network failures
  return false;
}

/** Fetch a URL with automatic GBK decoding, redirect following, and 5xx/network retry. */
export async function httpGet(url: string, opts?: HttpGetOpts): Promise<HttpResponse> {
  const timeoutMs = opts?.timeoutMs ?? CONFIG.HTTP_TIMEOUT_MS;
  const mergedHeaders: Record<string, string> = { ...DEFAULT_HEADERS, ...opts?.headers };

  const attempt = async (): Promise<HttpResponse> => fetchOnce(url, mergedHeaders, timeoutMs);

  let result: HttpResponse;
  try {
    result = await attempt();
  } catch (err) {
    if (!isRetriableError(err)) throw err;
    await sleep(1000);
    result = await attempt();
    return result;
  }

  // 5xx: retry once
  if (result.status >= 500) {
    await sleep(1000);
    try {
      result = await attempt();
    } catch (err) {
      if (!isRetriableError(err)) throw err;
      throw new Error(`Network error on retry for ${url}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

// Injectable for unit tests; callers should use the default.
type ChromiumLauncher = {
  launch(opts?: { headless?: boolean }): Promise<import('playwright').Browser>;
};

/** Run fn with a managed browser whose lifetime is tied to this call. */
export async function withBrowser<T>(
  plugins: Plugin[],
  fn: (getPage: (sourceId: string) => Promise<import('playwright').Page>) => Promise<T>,
  launcher?: ChromiumLauncher,
): Promise<T> {
  const needsBrowser = plugins.some((p) => p.needsBrowser);

  if (!needsBrowser) {
    const getPage = async (_sourceId: string): Promise<import('playwright').Page> => {
      throw new Error('No browser plugins: getPage should not be called');
    };
    return fn(getPage);
  }

  // Lazy-load chromium so the import cost is paid only when needed
  const actualLauncher = launcher ?? (await import('playwright')).chromium;
  const browser = await actualLauncher.launch({ headless: true });

  // Pre-create one context per browser plugin so cleanup is guaranteed even if fn errors early.
  const contexts = new Map<string, import('playwright').BrowserContext>();
  for (const p of plugins.filter((p) => p.needsBrowser)) {
    const ctx = await browser.newContext({
      userAgent: CONFIG.UA,
      viewport: CONFIG.VIEWPORT,
      locale: CONFIG.LOCALE_EN,
      timezoneId: CONFIG.TIMEZONE,
    });
    contexts.set(p.id, ctx);
  }

  const getPage = async (sourceId: string): Promise<import('playwright').Page> => {
    const ctx = contexts.get(sourceId);
    if (!ctx) throw new Error(`No browser context for source: ${sourceId}`);
    return ctx.newPage();
  };

  try {
    return await fn(getPage);
  } finally {
    for (const ctx of contexts.values()) {
      await ctx.close().catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

export class ExtractError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ExtractError';
  }
}

// Module-level TurndownService instance (cheaper than per-call construction).
const _td = (() => {
  const TurndownService = _require('turndown') as typeof import('turndown');
  const instance = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  return instance;
})();

const TRAILING_NOISE_RE =
  /\n(?:#+\s*)?(?:Read (?:more|also|next)|Related(?: articles?| reading)?|更多阅读|相关阅读|推荐阅读|延伸阅读|推荐文章)[\s\S]*/i;
const MULTI_BLANK_RE = /\n{3,}/g;

/** Extract the main article body from raw HTML and return it as Markdown. */
export function extractMarkdown(html: string, url: string): string {
  // Dynamic require to avoid circular ESM/CJS issues with jsdom and readability
  const { JSDOM } = _require('jsdom') as typeof import('jsdom');
  const { Readability } = _require('@mozilla/readability') as typeof import('@mozilla/readability');

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article?.content) {
    throw new ExtractError(`Readability found no article content at ${url}`);
  }

  let md = _td.turndown(article.content);
  md = md.replace(TRAILING_NOISE_RE, '');
  md = md.replace(MULTI_BLANK_RE, '\n\n');
  md = md.trim();

  if (md.length < 200) {
    throw new ExtractError(`Extracted content too short (${md.length} chars) at ${url}`);
  }

  return md;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/** Create a logger that writes info/warn/error to stderr; debug only when level=debug. */
export function makeLogger(level: 'debug' | 'info'): Logger {
  const shouldDebug = level === 'debug';
  const write = (prefix: string, msg: string, meta?: unknown) => {
    const line =
      meta !== undefined ? `${prefix} ${msg} ${JSON.stringify(meta)}` : `${prefix} ${msg}`;
    process.stderr.write(line + '\n');
  };
  return {
    debug: (msg, meta) => {
      if (shouldDebug) write('[DEBUG]', msg, meta);
    },
    info: (msg, meta) => write('[INFO]', msg, meta),
    warn: (msg, meta) => write('[WARN]', msg, meta),
    error: (msg, meta) => write('[ERROR]', msg, meta),
  };
}

// ---------------------------------------------------------------------------
// Output writers
// ---------------------------------------------------------------------------

/** Write items to outDir/list.json (UTF-8, 2-space indent, creates dir if needed). */
export async function writeListJson(outDir: string, items: Item[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'list.json'), JSON.stringify(items, null, 2), 'utf-8');
}

/** Write a single article to outDir/{source}-{NNNN}.md and return the relative path. */
export async function writeArticleMd(
  outDir: string,
  source: string,
  index: number, // 1-based, per-source
  title: string,
  markdown: string,
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const filename = `${source}-${String(index).padStart(4, '0')}.md`;
  const content = `# ${title}\n\n${markdown}\n`;
  await writeFile(join(outDir, filename), content, 'utf-8');
  return filename; // relative path (just the filename, caller prepends outDir if needed)
}
