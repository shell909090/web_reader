// Shared utilities: HTTP, browser, extraction, output. Implemented across T02-T05.

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
