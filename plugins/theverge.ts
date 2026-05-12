// The Verge AI plugin — HTTP-based, parses Atom feed for AI/artificial-intelligence section.

import type { Plugin, Item, Ctx } from '../lib.ts';

const FEED_URL = 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml';

// Match each <entry> block (non-greedy, DOTALL via [\s\S])
const ENTRY_RE = /<entry[\s>]([\s\S]*?)<\/entry>/g;

// Extract title content, handling optional CDATA
const TITLE_RE = /<title(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/;

// Prefer <link rel="alternate" href="..."> or fall back to <link href="...">
const LINK_ALT_RE = /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/;
const LINK_HREF_RE = /<link[^>]+href=["']([^"']+)["']/;

// Extract published date
const PUBLISHED_RE = /<published>([\s\S]*?)<\/published>/;

/** Parse Atom feed XML into Item list, truncated to limit. */
function parseAtomFeed(xml: string, limit: number): Item[] {
  const seen = new Set<string>();
  const items: Item[] = [];

  let match: RegExpExecArray | null;
  ENTRY_RE.lastIndex = 0;

  while ((match = ENTRY_RE.exec(xml)) !== null) {
    if (items.length >= limit) break;

    const block = match[1];

    const titleMatch = TITLE_RE.exec(block);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    if (!title) continue;

    const urlMatch = LINK_ALT_RE.exec(block) ?? LINK_HREF_RE.exec(block);
    if (!urlMatch) continue;
    const url = urlMatch[1].trim();
    if (seen.has(url)) continue;

    const publishedMatch = PUBLISHED_RE.exec(block);
    const notes = publishedMatch ? publishedMatch[1].trim().slice(0, 10) : 'The Verge';

    seen.add(url);
    items.push({ source: 'theverge', title, url, notes });
  }

  return items;
}

const plugin: Plugin = {
  id: 'theverge',

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching The Verge AI Atom feed', { url: FEED_URL });
    const { status, html } = await ctx.httpGet(FEED_URL);

    if (status !== 200) {
      throw new Error(`The Verge feed returned HTTP ${status}`);
    }

    const items = parseAtomFeed(html, opts.limit);
    ctx.log.debug(`Parsed ${items.length} items from The Verge AI feed`);
    return items;
  },
};

export default plugin;
