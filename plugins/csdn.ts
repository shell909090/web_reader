// CSDN list plugin — HTTP-based, uses cheerio to parse the CSDN homepage.

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const CSDN_HOME = 'https://www.csdn.net/';

// Matches blog.csdn.net/<user>/article/<id>
const ARTICLE_RE = /blog\.csdn\.net\/.+\/article\//;

/** True if the href looks like a CSDN blog article link. */
function isArticleUrl(href: string): boolean {
  return ARTICLE_RE.test(href);
}

/** Parse CSDN homepage HTML into an Item list. */
function parseCSDNPage(html: string, limit: number): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_i, el) => {
    if (items.length >= limit) return false;

    const anchor = $(el);
    const href = anchor.attr('href') ?? '';

    if (!isArticleUrl(href)) return;
    if (seen.has(href)) return;
    seen.add(href);

    // Some cards wrap title in <p.project-title>; prefer that over full a.text()
    // to avoid picking up category / star-count / "查看详情" noise text.
    const titleEl = anchor.find('p.project-title, .article-title').first();
    const title = (
      titleEl.length
        ? titleEl.text()
        : anchor
            .contents()
            .filter((_, n) => n.type === 'text')
            .first()
            .text()
    ).trim();

    if (title.length < 10) return;

    items.push({ source: 'csdn', title, url: href, notes: 'CSDN' });
  });

  return items;
}

const plugin: Plugin = {
  id: 'csdn',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching CSDN homepage', { url: CSDN_HOME });
    const { status, html } = await ctx.httpGet(CSDN_HOME);

    if (status !== 200) throw new Error(`CSDN returned HTTP ${status}`);

    const items = parseCSDNPage(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from CSDN`);
    return items;
  },
};

export default plugin;
