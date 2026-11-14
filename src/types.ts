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
  occurred_at?: string; // Event occurrence instant
  written_at?: string; // Explicit authoring instant
  first_seen_at?: string; // Persisted at the application output boundary
  event_date?: string; // Calendar date (YYYY-MM-DD) of a reported event, not publication time
  published_at?: string; // Original publication instant in Beijing time
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
  list?(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]>;
  /** Full-text search; only implemented by data-source plugins (e.g. wiki). */
  search?(ctx: Ctx, query: string, limit: number): Promise<SearchResult[]>;
  detail?(ctx: Ctx, item: Item): Promise<string>;
};
export type HttpGetOpts = {
  method?: 'GET' | 'POST';
  body?: string;
  sensitive?: boolean;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type HttpResponse = {
  status: number;
  html: string;
  finalUrl: string;
  retryAfter?: string;
};

export type FeedPlugin = Omit<Plugin, 'list' | 'search'> & {
  list: NonNullable<Plugin['list']>;
  search?(ctx: Ctx, query: string, limit: number): Promise<Item[]>;
};
export type SearchResult =
  | Item
  | {
      url?: never;
      kind: 'answer';
      source: string;
      title: string;
      answer: string;
      sections?: { title: string; text: string }[];
    };
