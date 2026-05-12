// Reuters list plugin — browser-based, uses Playwright + cheerio to parse the Reuters homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';
import { CONFIG } from '../lib.ts';

const REUTERS_BASE = 'https://www.reuters.com';

/** Parse Reuters homepage HTML into Item list, truncated to limit. */
function parseReutersPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  // Try primary selector, fall back to heading links, then article links
  const primaryLinks = $('[data-testid="MediaStoryCard"] a[href^="/"]');
  const headingLinks = $('a[data-testid*="heading"]');
  const articleLinks = $('article a');

  const anchors =
    primaryLinks.length > 0 ? primaryLinks : headingLinks.length > 0 ? headingLinks : articleLinks;

  anchors.each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const href = anchor.attr('href') ?? '';
    const url = href.startsWith('/') ? `${REUTERS_BASE}${href}` : href;

    if (!url || seen.has(url)) return;
    seen.add(url);

    const title = anchor.text().trim().replace(/\s+/g, ' ');
    if (title.length < 5) return;

    // Try to get timestamp from time element or data-testid*="time"
    const card = anchor.closest('[data-testid="MediaStoryCard"], article');
    const timeEl = card.find('time, [data-testid*="time"]').first();
    const timeText = timeEl.attr('datetime') ?? timeEl.text().trim();
    const notes = timeText ? `Reuters · ${timeText}` : 'Reuters';

    items.push({ source: 'reuters', title, url, notes });
  });

  return items;
}

const plugin: Plugin = {
  id: 'reuters',
  needsBrowser: true,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'browser') throw new Error('reuters requires browser mode');
    const { page, log } = ctx;

    log.debug('Navigating to Reuters homepage', { url: REUTERS_BASE });
    const response = await page.goto(REUTERS_BASE + '/', {
      waitUntil: 'networkidle',
      timeout: CONFIG.NAV_TIMEOUT_MS,
    });

    const status = response?.status() ?? 0;
    if (status === 401 || status === 403) {
      log.warn(`reuters: blocked by bot-detection (HTTP ${status}); returning 0 items`);
      return [];
    }

    // Wait for article cards; silently fall back to other selectors if not found
    await page.waitForSelector('[data-testid="MediaStoryCard"]', { timeout: 10000 }).catch(() => {
      log.warn('reuters: MediaStoryCard not found, trying fallback selectors');
    });

    const html = await page.content();
    const items = parseReutersPage(html, opts.limit);
    if (items.length === 0) {
      log.warn('reuters: 0 items parsed — page may have changed structure or be behind a paywall');
    }
    log.debug(`Parsed ${items.length} items from Reuters homepage`);
    return items;
  },
};

export default plugin;
