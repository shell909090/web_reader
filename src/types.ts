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
  /** URL pattern for detail-mode dispatch; set when the site is a JS SPA or needs API-based rendering. */
  urlPattern?: RegExp;
  list(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]>;
  /** Full-text search; only implemented by data-source plugins (e.g. wiki). */
  search?(ctx: Ctx, query: string, limit: number): Promise<Item[]>;
  detail?(ctx: Ctx, item: Item): Promise<string>;
};
export type HttpGetOpts = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type HttpResponse = {
  status: number;
  html: string;
  finalUrl: string;
};
