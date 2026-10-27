export const CONFIG = {
  UA: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  VIEWPORT: { width: 1280, height: 800 },
  LOCALE_EN: 'en-US',
  LOCALE_CN: 'zh-CN',
  TIMEZONE: 'America/New_York',
  HTTP_TIMEOUT_MS: 30_000,
  HTTP_MAX_HEADER_SIZE: 64 * 1024,
  TOTAL_TIMEOUT_MS: 600_000,
  DEFAULT_LIMIT: 50,
  DEFAULT_CONCURRENCY: 2,
} as const;
