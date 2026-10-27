import { buildNotes, type Market } from '../src/feeds/market.ts';
import { renderMarketMd } from '../src/feeds/market-markdown.ts';
// Polymarket plugin — top prediction markets by volume.

import type { Plugin, Item, Ctx } from '../lib.ts';

const BASE_URL = 'https://gamma-api.polymarket.com';
const MARKET_URL = 'https://polymarket.com/event';

/** Parse a JSON array of markets into Items. */
function parseMarkets(markets: Market[]): Item[] {
  const items: Item[] = [];
  for (const m of markets) {
    const title = m.question?.trim();
    const url = m.slug ? `${MARKET_URL}/${m.slug}` : '';
    if (!title || !url) continue;
    items.push({
      source: 'polymarket',
      title,
      url,
      notes: buildNotes(m),
      published_at: undefined,
    });
  }
  return items;
}

const plugin: Plugin = {
  id: 'polymarket',

  urlPattern: /^https:\/\/polymarket\.com\/event\//,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    const url = `${BASE_URL}/markets?limit=${opts.limit}&closed=false&order=volumeNum&ascending=false`;
    ctx.log.debug('Fetching Polymarket top markets', { url });
    const { status, html } = await ctx.httpGet(url);
    if (status !== 200) throw new Error(`Polymarket API returned HTTP ${status}`);
    const markets: Market[] = JSON.parse(html);
    ctx.log.debug(`Parsed ${markets.length} markets from Polymarket`);
    return parseMarkets(markets).slice(0, opts.limit);
  },

  async detail(ctx: Ctx, item: Item): Promise<string> {
    const slug = new URL(item.url).pathname.split('/').filter(Boolean).pop() ?? '';
    if (!slug) throw new Error('Cannot extract slug from URL: ' + item.url);
    const apiUrl = `${BASE_URL}/markets?slug=${encodeURIComponent(slug)}`;
    ctx.log.debug('Fetching Polymarket market detail', { slug, url: apiUrl });
    const { status, html } = await ctx.httpGet(apiUrl);
    if (status !== 200) throw new Error(`Polymarket API returned HTTP ${status}`);
    const markets: Market[] = JSON.parse(html);
    const m = markets[0];
    if (!m) throw new Error(`No market found for slug: ${slug}`);
    return renderMarketMd(m);
  },
};

export default plugin;
