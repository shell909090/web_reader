import { load } from 'cheerio';
import type { Ctx, Item } from '../types.ts';
import { providerConfig } from './config.ts';
import { searchResponse, webItems } from './common.ts';

const layouts = {
  duckduckgo: {
    card: '.result',
    link: '.result__a',
    summary: '.result__snippet',
    base: 'https://html.duckduckgo.com',
  },
  bing: { card: 'li.b_algo', link: 'h2 a', summary: '.b_caption p', base: 'https://www.bing.com' },
  baidu: {
    card: '#content_left .result, #content_left .c-container',
    link: 'h3 a',
    summary: '.c-abstract, .content-right_8Zs40',
    base: 'https://www.baidu.com',
  },
  sogou: {
    card: '.vrwrap, .rb',
    link: 'h3 a',
    summary: '.str_info, .str-text-info',
    base: 'https://www.sogou.com',
  },
};
type WebSource = keyof typeof layouts;

function resultUrl(href: string, base: string): string | undefined {
  try {
    const url = new URL(href, base);
    const target = new URL(url.searchParams.get('uddg') ?? url.href);
    return ['https:', 'http:'].includes(target.protocol) ? target.href : undefined;
  } catch {
    return undefined;
  }
}

/** Parse supplied search HTML without performing follow-up requests. */
export function parseWebSearch(source: WebSource, html: string, limit: number): Item[] {
  const $ = load(html);
  if (
    $('#challenge-form, .anomaly-modal, #captcha').length ||
    /验证码|安全验证|verify you are human/i.test($('title').text())
  )
    throw new Error(`${source}: verification required; search stopped`);
  const layout = layouts[source];
  const rows: { title: string; url: string; description: string }[] = [];
  $(layout.card).each((_, element) => {
    const card = $(element);
    const link = card.find(layout.link).first();
    const title = link.text().trim();
    const url = resultUrl(link.attr('href') ?? '', layout.base);
    if (title && url)
      rows.push({ title, url, description: card.find(layout.summary).text().trim() });
  });
  if (!rows.length && !$('.no-results, .no-results__message').length)
    throw new Error(`${source}: unrecognized search page (possibly blocked)`);
  return webItems(source, rows, limit);
}

/** Search DuckDuckGo's HTML endpoint without bypassing challenges. */
export async function duckduckgo(ctx: Ctx, query: string, limit: number): Promise<Item[]> {
  providerConfig('duckduckgo');
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);
  return parseWebSearch('duckduckgo', await searchResponse(ctx, 'duckduckgo', url.href), limit);
}

function restricted(source: WebSource): never {
  providerConfig(source);
  throw new Error(
    `${source}: automated search is disabled because the site's robots.txt disallows it; no request sent`,
  );
}

/** Preserve Bing capability while refusing prohibited automated requests. */
export async function bing(_ctx: Ctx, _query: string, _limit: number): Promise<Item[]> {
  return restricted('bing');
}
/** Preserve Baidu capability while refusing prohibited automated requests. */
export async function baidu(_ctx: Ctx, _query: string, _limit: number): Promise<Item[]> {
  return restricted('baidu');
}
/** Preserve Sogou capability while refusing prohibited automated requests. */
export async function sogou(_ctx: Ctx, _query: string, _limit: number): Promise<Item[]> {
  return restricted('sogou');
}
