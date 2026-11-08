import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { newsTime } from '../src/timestamps.ts';
import { newsIdentity, recordFirstSeen } from '../src/first-seen.ts';
import { publicationMetadata, publisherTime } from '../src/publication-metadata.ts';
import { withNewsTimes } from '../src/news-times.ts';
import { makeLogger, type Item, type Ctx } from '../lib.ts';

const item = (source = 'bbc', url = 'https://example.com/article'): Item => ({
  source,
  title: 'A news article',
  url,
  notes: '',
});

test('four-field timestamp format preserves instants and rejects guessed dates', () => {
  assert.equal(newsTime('2026-11-08T23:30:45.123Z'), '2026-11-09T07:30:45+08:00');
  assert.equal(newsTime('2026-11-08T10:20-05:00'), '2026-11-08T23:20:00+08:00');
  assert.equal(newsTime('Sun, 08 Nov 2026 10:00:00 +0800'), '2026-11-08T10:00:00+08:00');
  assert.equal(newsTime('Fri, 06 Nov 2026 00:30:00 +0800'), '2026-11-06T00:30:00+08:00');
  for (const value of [
    undefined,
    null,
    12,
    '2026-11',
    '2026-11-08',
    '2026-11-08 10:00:00',
    '2026-02-30T10:00:00Z',
    '2026-11-08T25:00:00Z',
    '2026-11-08T10:00:00+99:00',
    '32 Nov 2026 10:00 GMT',
    '31 Feb 2026 10:00 GMT',
    '08 Bad 2026 10:00 GMT',
  ])
    assert.equal(newsTime(value), undefined);
  assert.equal(publisherTime('2026年11月08日10:26', 'people'), '2026-11-08T10:26:00+08:00');
  assert.equal(publisherTime('2026-11-08 10:26:12', 'oschina'), '2026-11-08T10:26:12+08:00');
  assert.equal(publisherTime('2026-11-08 10:26:12', 'bbc'), undefined);
  assert.equal(publisherTime('2026-11-08', 'people'), undefined);
});

test('publication metadata excludes modification, comments and conflicting article timestamps', () => {
  const script = (value: unknown): string =>
    `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
  const article = {
    '@type': 'NewsArticle',
    datePublished: '2026-11-08T01:00:00Z',
    dateModified: '2026-11-09T01:00:00Z',
  };
  assert.equal(
    publicationMetadata(script({ '@graph': [article] }), 'bbc'),
    '2026-11-08T09:00:00+08:00',
  );
  assert.equal(publicationMetadata(script([article]), 'juejin'), '2026-11-08T09:00:00+08:00');
  assert.equal(
    publicationMetadata(script({ '@type': 'Comment', datePublished: article.datePublished }), 'hf'),
    undefined,
  );
  assert.equal(
    publicationMetadata(
      script([article, { ...article, datePublished: '2026-11-09T01:00:00Z' }]),
      'bbc',
    ),
    undefined,
  );
  assert.equal(
    publicationMetadata(
      '<script type="application/ld+json">bad</script><meta property="article:modified_time" content="2026-11-08T01:00:00Z">',
      'bbc',
    ),
    undefined,
  );
  assert.equal(
    publicationMetadata(
      '<meta property="article:published_time" content="2026-11-08T01:00:00Z">',
      'ars',
    ),
    '2026-11-08T09:00:00+08:00',
  );
  assert.equal(
    publicationMetadata('<b id="newstime">2026年11月08日10:26</b>', 'people'),
    '2026-11-08T10:26:00+08:00',
  );
  assert.equal(
    publicationMetadata('<span id="pubtime_baidu">2026-11-08 17:24:17</span>', 'caixin'),
    '2026-11-08T17:24:17+08:00',
  );
  assert.equal(
    publicationMetadata('<meta property="article:published_time" content="invalid">', 'bbc'),
    undefined,
  );
  for (const value of [
    null,
    {},
    [],
    [{ publish_time: 1, article_title: 2 }, 1793777450579, 'Article'],
    [{ publish_time: 1, article_title: 2 }, 'not numeric', 'Article'],
  ]) {
    const html = `<script id="__NUXT_DATA__">${JSON.stringify(value)}</script>`;
    assert.equal(
      publicationMetadata(html, 'infoq'),
      Array.isArray(value) && value[1] === 1793777450579 ? '2026-11-04T15:30:50+08:00' : undefined,
    );
  }
});

test('first seen persists across processes, tracking variants and concurrent writers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'first-seen-test-'));
  try {
    const first = item();
    recordFirstSeen([first], dir);
    const duplicate = item('hn', 'https://example.com/article?utm_source=hn#section');
    recordFirstSeen([duplicate], dir);
    assert.equal(first.first_seen_at, duplicate.first_seen_at);
    assert.equal(
      newsIdentity('https://example.com/?b=2&a=1&fbclid=x'),
      'https://example.com/?a=1&b=2',
    );
    const moduleUrl = new URL('../src/first-seen.ts', import.meta.url).href;
    const code = `import {recordFirstSeen} from ${JSON.stringify(moduleUrl)};const a={source:'test',title:'title',url:'https://example.com/article',notes:''};recordFirstSeen([a],process.argv[1]);process.stdout.write(a.first_seen_at);`;
    const observed = execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', code, dir],
      { encoding: 'utf8' },
    );
    assert.equal(observed, first.first_seen_at);
    const run = (): Promise<string> =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          code.replaceAll('/article', '/race'),
          dir,
        ]);
        let output = '';
        child.stdout.on('data', (d) => {
          output += String(d);
        });
        child.on('error', reject);
        child.on('close', (c) => (c === 0 ? resolve(output) : reject(new Error(`exit ${c}`))));
      });
    const times = await Promise.all([run(), run()]);
    assert.equal(times[0], times[1]);
    recordFirstSeen([], dir);
    writeFileSync(join(dir, 'file'), 'not a directory');
    assert.throws(() => recordFirstSeen([item()], join(dir, 'file')));
    assert.throws(() => recordFirstSeen([item('test', 'not a URL')], dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI/MCP plugin wrapper enriches valid results and tolerates missing upstream dates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'observe-test-'));
  const previous = process.env.WEB_READER_DATA_DIR;
  process.env.WEB_READER_DATA_DIR = dir;
  try {
    const items = [
      item(),
      item('csdn', 'https://blocked.test/'),
      item('oschina', 'https://www.oschina.net/news/42'),
      item('reddit', 'https://www.reddit.com/r/test/'),
      item('polymarket'),
      { ...item('mittr'), published_at: '2026-11-08T01:00:00Z' },
    ];
    const ctx: Ctx = {
      mode: 'http',
      log: makeLogger('error'),
      httpGet: async (url) => ({
        status: url.includes('blocked') ? 403 : 200,
        html: url.includes('apiv1')
          ? JSON.stringify({ success: true, result: { pubTime: '2026-11-08 10:00:00' } })
          : '<meta property="article:published_time" content="2026-11-08T01:00:00Z">',
        finalUrl: url,
      }),
    };
    const plugin = withNewsTimes({
      id: 'test',
      list: async () => items,
      search: async () => [item()],
    });
    const result = await plugin.list(ctx, { limit: 10 });
    assert.equal(result[0].published_at, '2026-11-08T09:00:00+08:00');
    assert.equal(result[1].published_at, undefined);
    assert.equal(result[2].published_at, '2026-11-08T10:00:00+08:00');
    assert.ok(result.every((i) => i.first_seen_at));
    assert.equal((await plugin.search!(ctx, 'test', 1))[0].first_seen_at, result[0].first_seen_at);
    const failed = withNewsTimes({
      id: 'test',
      list: async () => {
        throw new Error('upstream');
      },
    });
    await assert.rejects(failed.list(ctx, { limit: 1 }), /upstream/);
    const missing = withNewsTimes({
      id: 'test',
      list: async () => [
        item('oschina', 'https://www.oschina.net/invalid'),
        item('bbc', 'https://fail.test'),
      ],
    });
    const output = await missing.list(
      {
        ...ctx,
        httpGet: async () => {
          throw new Error('network');
        },
      },
      { limit: 2 },
    );
    assert.ok(output.every((i) => !i.published_at));
  } finally {
    if (previous === undefined) delete process.env.WEB_READER_DATA_DIR;
    else process.env.WEB_READER_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Xinhua combines its explicit publication date and time without guessing missing components', () => {
  assert.equal(
    publicationMetadata(
      '<meta name="publishdate" content="2026-11-08"><div class="header-time"><span class="time">10:18:20</span></div>',
      'xinhua',
    ),
    '2026-11-08T10:18:20+08:00',
  );
  assert.equal(
    publicationMetadata('<meta name="publishdate" content="2026-11-08">', 'xinhua'),
    undefined,
  );
});

test('social timestamps never become the linked article publication time', async () => {
  const { postToItem } = await import('../src/feeds/bluesky-post.ts');
  const { parseFeed } = await import('../src/feeds/reddit.ts');
  const post = postToItem({
    uri: 'at://did:test/app.bsky.feed.post/1',
    author: { handle: 'example.test' },
    indexedAt: '2026-11-08T10:00:00Z',
    record: {
      text: 'A shared article',
      createdAt: '2026-11-07T10:00:00Z',
      embed: {
        $type: 'app.bsky.embed.external',
        external: { uri: 'https://example.com/article', title: 'A shared article' },
      },
    },
  });
  assert.equal(post?.published_at, undefined);
  const reddit = parseFeed(
    '<entry><title>A reported news article</title><link rel="alternate" href="https://www.reddit.com/r/news/comments/1"/><updated>2026-11-08T10:00:00Z</updated></entry>',
    'reddit',
  );
  assert.equal(reddit.length, 1);
  assert.equal(reddit[0].published_at, undefined);
});

test('RSS preserves publication instants and does not crash on invalid dates', async () => {
  const { parseNewsRss } = await import('../src/feeds/news-rss.ts');
  const xml = (date: string): string =>
    `<item><title>A news headline</title><link>https://example.com/article</link><pubDate>${date}</pubDate></item>`;
  const [item] = parseNewsRss(xml('Fri, 06 Nov 2026 00:30:00 +0800'), 'cnbc', 'CNBC');
  assert.equal(item.published_at, '2026-11-06T00:30:00+08:00');
  assert.ok(item.notes.includes(item.published_at));
  assert.equal(
    parseNewsRss(xml('31 Feb 2026 00:30:00 +0800'), 'mittr', 'MIT')[0].published_at,
    undefined,
  );
});
