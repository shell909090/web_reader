// Polymarket plugin — top prediction markets by volume.

import type { Plugin, Item, Ctx } from '../lib.ts';

const BASE_URL = 'https://gamma-api.polymarket.com';
const MARKET_URL = 'https://polymarket.com/event';

type Market = {
  question: string;
  slug: string;
  outcomePrices: string;
  outcomes: string;
  volumeNum: number;
  endDateIso?: string;
  description?: string;
  resolutionSource?: string;
  active: boolean;
  closed: boolean;
};

/** Format a USD volume number as $XM, $XK, or $X. */
function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${Math.round(vol)}`;
}

/** Build the notes string from market fields. */
function buildNotes(market: Market): string {
  const parts: string[] = [];

  try {
    const prices: string[] = JSON.parse(market.outcomePrices);
    const outcomes: string[] = JSON.parse(market.outcomes);
    if (
      outcomes.length === 2 &&
      outcomes[0] === 'Yes' &&
      outcomes[1] === 'No' &&
      prices.length >= 1
    ) {
      const pct = (parseFloat(prices[0]) * 100).toFixed(1);
      parts.push(`Yes: ${pct}%`);
    }
  } catch {
    // malformed JSON — skip probability
  }

  parts.push(`Vol: ${formatVolume(market.volumeNum)}`);

  if (market.endDateIso) parts.push(`Ends: ${market.endDateIso.slice(0, 10)}`);

  return parts.join(' · ');
}

/** Render a Market as a Markdown string for detail mode. */
function renderMarketMd(m: Market): string {
  const lines: string[] = [];
  lines.push(`# ${m.question}`);
  lines.push('');

  // Metadata line
  const meta: string[] = [];
  try {
    const prices: string[] = JSON.parse(m.outcomePrices);
    const outcomes: string[] = JSON.parse(m.outcomes);
    if (outcomes[0] === 'Yes' && prices[0]) {
      meta.push(`Yes: ${(parseFloat(prices[0]) * 100).toFixed(1)}%`);
    }
  } catch {
    /* skip */
  }
  meta.push(`Vol: ${formatVolume(m.volumeNum)}`);
  if (m.endDateIso) meta.push(`Ends: ${m.endDateIso.slice(0, 10)}`);
  lines.push(meta.join(' · '));
  lines.push('');

  // Description
  if (m.description?.trim()) {
    lines.push('## Description');
    lines.push('');
    lines.push(m.description.trim());
    lines.push('');
  }

  // Outcomes table
  try {
    const prices: string[] = JSON.parse(m.outcomePrices);
    const outcomes: string[] = JSON.parse(m.outcomes);
    if (outcomes.length > 0) {
      lines.push('## Outcomes');
      lines.push('');
      lines.push('| Outcome | Probability |');
      lines.push('|---------|-------------|');
      for (let i = 0; i < outcomes.length; i++) {
        const pct = prices[i] ? `${(parseFloat(prices[i]) * 100).toFixed(1)}%` : '—';
        lines.push(`| ${outcomes[i]} | ${pct} |`);
      }
      lines.push('');
    }
  } catch {
    /* skip */
  }

  // Resolution source
  if (m.resolutionSource?.trim()) {
    lines.push('## Resolution');
    lines.push('');
    lines.push(m.resolutionSource.trim());
    lines.push('');
  }

  return lines.join('\n');
}

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
