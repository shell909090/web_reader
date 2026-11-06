import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsRss } from '../src/feeds/news-rss.ts';
import { parseFeed } from '../src/feeds/google-news.ts';

const missingFields =
  '<item><title>Valid headline</title><link>https://example.com/story</link></item>';
const invalidItems =
  '<item><title></title><link>https://example.com/short</link></item><item><title>Missing URL headline</title></item>';

test('news RSS drops incomplete items and leaves absent metadata optional', () => {
  const items = parseNewsRss('<rss>' + invalidItems + missingFields + '</rss>', 'test', 'News');
  assert.deepEqual(items, [
    {
      source: 'test',
      title: 'Valid headline',
      url: 'https://example.com/story',
      notes: 'News',
      summary: undefined,
      published_at: undefined,
    },
  ]);
});

test('Google News keeps valid headlines without a publisher or usable date', () => {
  const invalidDate = missingFields.replace('</item>', '<pubDate>not a date</pubDate></item>');
  const items = parseFeed('<rss>' + invalidItems + missingFields + invalidDate + '</rss>');
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.equal(item.title, 'Valid headline');
    assert.equal(item.url, 'https://example.com/story');
    assert.equal(item.notes, 'Google News');
    assert.equal(item.published_at, undefined);
  }
});
