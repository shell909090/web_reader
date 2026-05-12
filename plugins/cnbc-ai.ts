// CNBC AI news list plugin — browser-based, uses Playwright + cheerio to parse the CNBC AI page.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';
import { CONFIG } from '../lib.ts';

const CNBC_BASE = 'https://www.cnbc.com';
const CNBC_AI_URL = `${CNBC_BASE}/ai-artificial-intelligence/`;

/** Parse CNBC AI page HTML into Item list, truncated to limit. */
function parseCnbcAiPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  // Selector priority: Card-titleContainer > card-title > year-path links
  const primaryLinks = $('.Card-titleContainer a');
  const cardTitleLinks = $('.card-title a');
  const yearPathLinks = $('a[href*="cnbc.com/202"]');

  const anchors =
    primaryLinks.length > 0
      ? primaryLinks
      : cardTitleLinks.length > 0
        ? cardTitleLinks
        : yearPathLinks;

  anchors.each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const rawHref = anchor.attr('href') ?? '';

    // Resolve relative URLs
    const url = rawHref.startsWith('http') ? rawHref : `${CNBC_BASE}${rawHref}`;

    if (!url || seen.has(url)) return;
    seen.add(url);

    const title = anchor.text().trim();
    if (title.length < 5) return;

    // Try to extract timestamp from sibling time element or .Card-time
    const card = anchor.closest('[class*="Card"], article, [class*="card"]');
    const timeEl = card.find('time, .Card-time').first();
    const timeText = timeEl.attr('datetime') ?? timeEl.text().trim();
    const notes = timeText ? timeText : 'CNBC AI';

    items.push({ source: 'cnbc-ai', title, url, notes });
  });

  return items;
}

const plugin: Plugin = {
  id: 'cnbc-ai',
  needsBrowser: true,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'browser') throw new Error('cnbc-ai requires browser mode');
    const { page, log } = ctx;

    log.debug('Navigating to CNBC AI page', { url: CNBC_AI_URL });
    await page.goto(CNBC_AI_URL, {
      waitUntil: 'networkidle',
      timeout: CONFIG.NAV_TIMEOUT_MS,
    });

    // Wait for card elements; log a warning if not found
    const cardSelector =
      '.Card-titleContainer a, .card-title a, [class*="card"] a[href*="cnbc.com"]';
    await page.waitForSelector(cardSelector, { timeout: 10000 }).catch(() => {
      log.warn('cnbc-ai: card selector not found, using page.content() fallback');
    });

    const html = await page.content();
    const items = parseCnbcAiPage(html, opts.limit);
    log.debug(`Parsed ${items.length} items from CNBC AI page`);
    return items;
  },
};

export default plugin;
