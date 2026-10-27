import type { Item } from '../types.ts';
import { extractText } from './rss.ts';

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function postUrl(block: string): string {
  return (
    block.match(/rel="alternate"[^>]+href="([^"]+)"/)?.[1] ??
    block.match(/href="(https?:\/\/www\.reddit\.com\/r\/[^"]+)"/)?.[1] ??
    ''
  );
}

function externalUrl(html: string): string | undefined {
  return (
    html.match(/href=&quot;(https?:\/\/(?!www\.reddit\.com)[^&\s]+)&quot;/)?.[1] ??
    html.match(/href="(https?:\/\/(?!www\.reddit\.com)[^"\s]+)"/)?.[1]
  );
}

function discussionSummary(html: string): string | undefined {
  const text = decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 20 ? text.slice(0, 400) : undefined;
}

function isNews(title: string): boolean {
  const bare = title.replace(/^\[[A-Z]\]\s*/i, '');
  return !/^(daily|weekly|monthly|self.promo|self.promotion|hiring|mod\b|automod|scheduled|who.s hiring|career)/i.test(
    bare,
  );
}

function postMetadata(block: string, redditUrl: string) {
  const date = extractText(block, 'updated').slice(0, 10);
  const sub = redditUrl.match(/\/r\/([^/]+)/)?.[1] ?? '';
  const notes = date ? `r/${sub} · ${date}` : `r/${sub}`;
  return { notes, published_at: date || undefined };
}

function postDetails(
  block: string,
  redditUrl: string,
): Pick<Item, 'url' | 'notes' | 'published_at'> & { summary?: string; reddit_url?: string } {
  const content = extractText(block, 'content');
  const extUrl = externalUrl(content);
  const summary = extUrl ? undefined : discussionSummary(content);
  const { notes, published_at } = postMetadata(block, redditUrl);
  return {
    url: extUrl ?? redditUrl,
    notes: extUrl ? notes : `${notes} (discussion)`,
    ...(extUrl ? { reddit_url: redditUrl } : {}),
    ...(summary ? { summary } : {}),
    published_at,
  };
}

export function parseFeed(xml: string, source: string): Item[] {
  const items: Item[] = [];
  for (const match of xml.matchAll(/<entry>([\s\S]+?)<\/entry>/gi)) {
    const block = match[1];
    const title = decodeEntities(extractText(block, 'title'));
    if (title.length < 5 || !isNews(title)) continue;
    const redditUrl = postUrl(block);
    if (!redditUrl.includes('/r/')) continue;
    items.push({ source, title, ...postDetails(block, redditUrl) });
  }
  return items;
}
