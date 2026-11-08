import * as cheerio from 'cheerio';
import { beijingTime, newsTime } from './timestamps.ts';

/** Interpret explicitly configured Chinese publisher wall clocks as Beijing time. */
export function publisherTime(value: unknown, source: string): string | undefined {
  const explicit = newsTime(value);
  if (explicit || typeof value !== 'string') return explicit;
  if (!['sina', 'people', 'caixin', 'oschina', 'xinhua'].includes(source)) return undefined;
  const text = value.trim().replace(/年|月/g, '-').replace(/日\s*/, 'T').replace(' ', 'T');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text)
    ? newsTime(text + '+08:00')
    : undefined;
}

function articleNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(articleNodes);
  if (!value || typeof value !== 'object') return [];
  const node = value as Record<string, unknown>;
  const type = String(node['@type']);
  if (/^(?:Article|NewsArticle|ReportageNewsArticle|BlogPosting)$/i.test(type)) return [node];
  return articleNodes(node['@graph']);
}

function structuredDates($: cheerio.CheerioAPI, source: string): string[] {
  const dates: string[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const nodes = articleNodes(JSON.parse($(el).text()));
      for (const node of nodes) {
        const date = publisherTime(node.datePublished, source);
        if (date) dates.push(date);
      }
    } catch {
      /* Invalid embedded JSON does not invalidate the news item. */
    }
  });
  return dates;
}

function infoqTime($: cheerio.CheerioAPI): string | undefined {
  try {
    const data: unknown = JSON.parse($('#__NUXT_DATA__').text());
    if (!Array.isArray(data)) return undefined;
    const values = data.filter(
      (v): v is Record<string, unknown> =>
        !!v && typeof v === 'object' && 'publish_time' in v && 'article_title' in v,
    );
    if (values.length !== 1) return undefined;
    const timestamp: unknown = data[Number(values[0].publish_time)];
    return typeof timestamp === 'number' && timestamp > 1e12 && timestamp < 1e13
      ? beijingTime(timestamp)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Extract publication metadata only, never update, comment or arbitrary page timestamps. */
export function publicationMetadata(html: string, source: string): string | undefined {
  const $ = cheerio.load(html);
  const dates = structuredDates($, source);
  $(
    'meta[property="article:published_time"], meta[property="og:published_time"], meta[name="parsely-pub-date"]',
  ).each((_i, el) => {
    const date = publisherTime($(el).attr('content'), source);
    if (date) dates.push(date);
  });
  if (source === 'infoq') return infoqTime($);
  if (source === 'xinhua') {
    const date = $('meta[name="publishdate"]').attr('content');
    const time = $('.header-time .time').first().text().trim();
    return publisherTime(`${date} ${time}`, source);
  }
  const selectors: Record<string, string> = {
    people: '#newstime',
    caixin: '#pubtime_baidu',
  };
  const local = selectors[source];
  if (local) {
    const date = publisherTime($(local).first().text(), source);
    if (date) dates.push(date);
  }
  const unique = [...new Set(dates)];
  return unique.length === 1 ? unique[0] : undefined;
}
