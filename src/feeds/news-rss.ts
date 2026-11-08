import { newsTime } from '../timestamps.ts';
import type { Item } from '../types.ts';
import { extractText, rssLink, rssBlocks } from './rss.ts';

export function parseNewsRss(
  xml: string,
  source: string,
  label: string,
  emptyLabel = label,
): Item[] {
  const items: Item[] = [];
  for (const block of rssBlocks(xml)) {
    const title = extractText(block, 'title');
    if (title.length < 5) continue;
    const url = rssLink(block);
    if (!url) continue;
    const pubDate = extractText(block, 'pubDate');
    const summary = extractText(block, 'description');
    items.push({
      source,
      title,
      url,
      notes: pubDate ? `${label} · ${newsTime(pubDate) ?? pubDate}` : emptyLabel,
      summary: summary || undefined,
      published_at: newsTime(pubDate),
    });
  }
  return items;
}
