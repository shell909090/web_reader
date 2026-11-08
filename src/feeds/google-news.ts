import { newsTime } from '../timestamps.ts';
import type { Item } from '../types.ts';
import { extractText, rssLink, rssBlocks } from './rss.ts';

function publicationDate(block: string): string | undefined {
  return newsTime(extractText(block, 'pubDate'));
}

function parseItem(block: string): Item | null {
  const rawTitle = extractText(block, 'title');
  if (rawTitle.length < 5) return null;
  const title = rawTitle.replace(/ - [^-]+$/, '').trim();
  const url = rssLink(block);
  if (!url) return null;
  const publisher = block.match(/<source[^>]*>([^<]+)<\/source>/i)?.[1]?.trim() ?? '';
  const published_at = publicationDate(block);
  const notes = [publisher, published_at].filter(Boolean).join(' · ') || 'Google News';
  return { source: 'gnews', title, url, notes, published_at };
}

export function parseFeed(xml: string): Item[] {
  return rssBlocks(xml)
    .map(parseItem)
    .filter((item): item is Item => item !== null);
}
