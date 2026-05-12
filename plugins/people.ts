// People's Daily list plugin — HTTP-based, uses cheerio to parse the people.com.cn homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const PEOPLE_HOME = 'https://www.people.com.cn/';

// Must contain .people.com.cn/ and end with .html or .shtml
const DOMAIN_RE = /\.people\.com\.cn\//;
const HTML_RE = /\.s?html/;
// Old archive links to filter out
const ARCHIVE_RE = /\/GB\//;

/** True if the href looks like a People Daily article link. */
function isArticleUrl(href: string): boolean {
  if (!DOMAIN_RE.test(href)) return false;
  if (!HTML_RE.test(href)) return false;
  return true;
}

/** Parse People Daily homepage HTML into an Item list. */
function parsePeoplePage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();

  // First pass: try filtering out /GB/ archive links
  const candidates: Array<{ href: string; title: string }> = [];
  $('a[href]').each((_i, el) => {
    const anchor = $(el);
    const href = anchor.attr('href') ?? '';
    const title = anchor.text().trim();

    if (!isArticleUrl(href)) return;
    if (title.length < 8) return;
    if (seen.has(href)) return;
    seen.add(href);

    candidates.push({ href, title });
  });

  // Try to filter archive links if there are enough items without them
  const nonArchive = candidates.filter((c) => !ARCHIVE_RE.test(c.href));
  const source = nonArchive.length >= limit ? nonArchive : candidates;

  for (const { href, title } of source) {
    if (items.length >= limit) break;
    items.push({ source: 'people', title, url: href, notes: 'People Daily' });
  }

  return items;
}

const plugin: Plugin = {
  id: 'people',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    if (ctx.mode !== 'http') throw new Error('people requires http mode');

    ctx.log.debug('Fetching People Daily homepage', { url: PEOPLE_HOME });
    const { status, html } = await ctx.httpGet(PEOPLE_HOME);

    if (status !== 200) throw new Error(`People Daily returned HTTP ${status}`);

    const items = parsePeoplePage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from People Daily`);
    return items;
  },
};

export default plugin;
