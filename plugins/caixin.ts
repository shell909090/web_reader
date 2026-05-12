// Caixin (财新) plugin — HTTP-based, parses caixin.com homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const CAIXIN_HOME = 'https://www.caixin.com/';

// Article URLs contain a date segment like /2026-05-12/
const ARTICLE_RE = /caixin\.com\/\d{4}-\d{2}-\d{2}\/\d+\.html$/;

// Skip photo galleries and video pages
const SKIP_RE = /^(?:photos|video|vip)\./;

function parsePage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const href = $(el).attr('href') ?? '';
    if (!ARTICLE_RE.test(href)) return;

    // Extract subdomain to filter photos/video
    const subdomain = href.replace('https://', '').split('.')[0];
    if (SKIP_RE.test(subdomain + '.')) return;

    if (seen.has(href)) return;

    const title = $(el).text().trim().replace(/\s+/g, ' ');
    if (title.length < 6) return;

    seen.add(href);

    // Extract date from URL as notes
    const date = href.match(/\/(\d{4}-\d{2}-\d{2})\//)?.[1] ?? '';
    const notes = date ? `财新 · ${date}` : '财新';

    items.push({ source: 'caixin', title, url: href, notes, published_at: date || undefined });
  });

  return items;
}

const plugin: Plugin = {
  id: 'caixin',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching Caixin homepage', { url: CAIXIN_HOME });
    const { status, html } = await ctx.httpGet(CAIXIN_HOME);

    if (status !== 200) throw new Error(`Caixin returned HTTP ${status}`);

    const items = parsePage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from Caixin`);
    return items;
  },
};

export default plugin;
