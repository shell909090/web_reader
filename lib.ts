// Shared utilities: HTTP, extraction, output. Plugin system types.

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
  TOTAL_TIMEOUT_MS: 600_000,
  DEFAULT_LIMIT: 50,
  DEFAULT_CONCURRENCY: 2,
} as const;

// ---------------------------------------------------------------------------
// HTTP request profiles
// ---------------------------------------------------------------------------

export type ProfileName = 'default' | 'chrome-win' | 'firefox' | 'mobile' | 'curl';

export type Profile = {
  ua: string;
  /** Additional headers to override (e.g. Accept for curl). */
  headers?: Record<string, string>;
};

export const PROFILES: Record<ProfileName, Profile> = {
  default: {
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  'chrome-win': {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  firefox: {
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  },
  mobile: {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  curl: {
    ua: 'curl/8.7.1',
    headers: { Accept: '*/*' },
  },
};

export const PROFILE_NAMES = Object.keys(PROFILES) as ProfileName[];

let _activeProfile: ProfileName = 'default';

/** Switch the global HTTP request profile used by httpGet. */
export function setActiveProfile(name: ProfileName): void {
  _activeProfile = name;
}

/** Return the currently active profile name. */
export function getActiveProfile(): ProfileName {
  return _activeProfile;
}

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
  published_at?: string; // ISO 8601 date when available (not all sources provide this)
} & Record<string, unknown>;

export type Ctx = {
  mode: 'http';
  httpGet(url: string, opts?: HttpGetOpts): Promise<HttpResponse>;
  log: Logger;
};

export type Plugin = {
  id: string;
  /** Available sub-feeds: slug → human label. If absent, plugin has a single feed. */
  categories?: Record<string, string>;
  list(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]>;
  /** Full-text search; only implemented by data-source plugins (e.g. wiki). */
  search?(ctx: Ctx, query: string, limit: number): Promise<Item[]>;
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

/** Build default request headers from the currently active profile. */
function buildDefaultHeaders(): Record<string, string> {
  const profile = PROFILES[_activeProfile];
  return {
    'User-Agent': profile.ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    ...profile.headers,
  };
}

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
  const mergedHeaders: Record<string, string> = { ...buildDefaultHeaders(), ...opts?.headers };

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
  const { JSDOM, VirtualConsole } = _require('jsdom') as typeof import('jsdom');
  const { Readability } = _require('@mozilla/readability') as typeof import('@mozilla/readability');

  // Suppress CSS/resource parse errors (common with complex modern sites like Reddit)
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => undefined);

  const dom = new JSDOM(html, { url, virtualConsole: vc });
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

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Create a logger that writes to stderr; messages below `level` are suppressed. */
export function makeLogger(level: LogLevel): Logger {
  const minRank = LOG_RANK[level];
  const write = (prefix: string, rank: number, msg: string, meta?: unknown) => {
    if (rank < minRank) return;
    const line =
      meta !== undefined ? `${prefix} ${msg} ${JSON.stringify(meta)}` : `${prefix} ${msg}`;
    process.stderr.write(line + '\n');
  };
  return {
    debug: (msg, meta) => write('[DEBUG]', 0, msg, meta),
    info: (msg, meta) => write('[INFO]', 1, msg, meta),
    warn: (msg, meta) => write('[WARN]', 2, msg, meta),
    error: (msg, meta) => write('[ERROR]', 3, msg, meta),
  };
}

// ---------------------------------------------------------------------------
// Output writers
// ---------------------------------------------------------------------------

/** Write items to outDir/index.json (UTF-8, 2-space indent, creates dir if needed). */
export async function writeListJson(outDir: string, items: Item[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.json'), JSON.stringify(items, null, 2), 'utf-8');
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
