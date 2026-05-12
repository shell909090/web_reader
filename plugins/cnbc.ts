// CNBC plugin — combines all CNBC section RSS feeds plus AI page scraping.
// RSS feeds use: https://www.cnbc.com/id/{id}/device/rss/rss.html

import * as cheerio from 'cheerio';
import type { Plugin, Item, Ctx } from '../lib.ts';

const RSS_BASE = 'https://www.cnbc.com/id';

const CATEGORY_FEEDS: Record<string, string> = {
  top: `${RSS_BASE}/100003114/device/rss/rss.html`,
  world: `${RSS_BASE}/10000664/device/rss/rss.html`,
  markets: `${RSS_BASE}/10001147/device/rss/rss.html`,
  tech: `${RSS_BASE}/15839135/device/rss/rss.html`,
  finance: `${RSS_BASE}/10000108/device/rss/rss.html`,
  us: `${RSS_BASE}/10000115/device/rss/rss.html`,
  health: `${RSS_BASE}/20910258/device/rss/rss.html`,
  politics: `${RSS_BASE}/10001054/device/rss/rss.html`,
  intl: `${RSS_BASE}/10000113/device/rss/rss.html`,
};

const AI_URL = 'https://www.cnbc.com/ai-artificial-intelligence/';
const ARTICLE_RE = /cnbc\.com\/\d{4}\/\d{2}\/\d{2}\//;

const DEFAULT_CATEGORIES = ['top', 'tech', 'markets'];

function extractText(block: string, tag: string): string {
  const m = block.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]+?)(?:\\]\\]>)?</${tag}>`, 'i'),
  );
  return m ? m[1].trim() : '';
}

function parseFeed(xml: string): Item[] {
  const items: Item[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]+?)<\/item>/gi)) {
    const block = m[1];
    const title = extractText(block, 'title');
    if (title.length < 5) continue;
    const link = block.match(/<link>\s*([^<\s]+)/i)?.[1]?.trim() ?? extractText(block, 'guid');
    if (!link) continue;
    const pubDate = extractText(block, 'pubDate');
    const summary = extractText(block, 'description');
    items.push({
      source: 'cnbc',
      title,
      url: link,
      notes: pubDate ? `CNBC · ${pubDate.slice(0, 16)}` : 'CNBC',
      summary: summary || undefined,
    });
  }
  return items;
}

async function fetchAiPage(ctx: Ctx): Promise<Item[]> {
  const { status, html } = await ctx.httpGet(AI_URL);
  if (status !== 200) throw new Error(`CNBC AI page returned HTTP ${status}`);
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: Item[] = [];
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    if (!ARTICLE_RE.test(href)) return;
    if (seen.has(href)) return;
    const title = $(el).text().trim();
    if (title.length < 15) return;
    seen.add(href);
    items.push({ source: 'cnbc', title, url: href, notes: 'CNBC AI' });
  });
  return items;
}

const plugin: Plugin = {
  id: 'cnbc',
  categories: {
    top: 'Top News',
    world: 'World',
    markets: 'Markets',
    tech: 'Technology',
    finance: 'Finance',
    us: 'US News',
    health: 'Health',
    politics: 'Politics',
    intl: 'International',
    ai: 'AI (page scrape)',
  },

  async list(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]> {
    const cats = opts.categories?.length ? opts.categories : DEFAULT_CATEGORIES;

    const rssCats = cats.filter((c) => CATEGORY_FEEDS[c]);
    const wantAi = cats.includes('ai');

    const fetchTasks: Promise<Item[]>[] = rssCats.map((cat) => {
      const url = CATEGORY_FEEDS[cat];
      ctx.log.debug(`Fetching CNBC RSS [${cat}]`, { url });
      return ctx.httpGet(url).then((r) => {
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        return parseFeed(r.html);
      });
    });

    if (wantAi) fetchTasks.push(fetchAiPage(ctx));

    const unknownCats = cats.filter((c) => !CATEGORY_FEEDS[c] && c !== 'ai');
    if (unknownCats.length) {
      ctx.log.warn(
        `cnbc: unknown categories [${unknownCats.join(', ')}]. Available: ${Object.keys({ ...CATEGORY_FEEDS, ai: '' }).join(', ')}`,
      );
    }

    const results = await Promise.allSettled(fetchTasks);
    const seen = new Set<string>();
    const allItems: Item[] = [];
    for (const r of results) {
      if (r.status === 'rejected') {
        ctx.log.warn(
          `CNBC feed error: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        );
        continue;
      }
      for (const item of r.value) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          allItems.push(item);
        }
      }
    }
    ctx.log.debug(`Parsed ${allItems.length} unique CNBC items`);
    return allItems.slice(0, opts.limit);
  },
};

export default plugin;
