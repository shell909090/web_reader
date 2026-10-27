import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import undici, { Response } from 'undici';
import { main } from '../read.ts';
import { parseCLI } from '../src/cli/args.ts';
import { parseSourceTokens } from '../src/cli/sources.ts';
import { readUrls, search } from '../src/mcp-tools.ts';

const article = readFileSync(new URL('fixtures/bbc/detail.html', import.meta.url), 'utf8');

test('source presets preserve order and merge explicitly requested categories', () => {
  assert.deepEqual(parseSourceTokens('fin,cnbc:tech,cnbc:markets'), [
    { id: 'caixin', categories: [] },
    { id: 'yahoo', categories: [] },
    { id: 'cnbc', categories: ['markets', 'tech', 'markets'] },
  ]);
});

test('CLI mode precedence and numeric argument validation remain stable', (t) => {
  t.mock.method(process.stderr, 'write', () => true);
  assert.equal(parseCLI(['-q', 'wiki', '-s', 'hn', 'topic'])?.mode, 'query');
  assert.equal(parseCLI(['https://example.com/article', '-n', '0'])?.mode, 'detail');
  assert.equal(parseCLI(['-s', 'all'])?.mode, 'list');
  for (const argv of [
    ['-s', 'hn', '-n', '0'],
    ['-s', 'hn', '-n', '1.5'],
    ['-s', 'hn', '-c', '-1'],
    ['-s', ' , '],
    ['-s', 'unknown'],
    ['-q', ' ', 'topic'],
    ['-q', 'wiki', 'topic', '-n', 'NaN'],
  ])
    assert.equal(parseCLI(argv), null, JSON.stringify(argv));
});

test('detail mode writes successful articles even when another URL fails', async (t) => {
  t.mock.method(process.stderr, 'write', () => true);
  t.mock.method(
    undici,
    'fetch',
    async (url: Parameters<typeof undici.fetch>[0]) =>
      new Response(String(url).endsWith('/bad') ? '<html/>' : article),
  );
  const dir = await mkdtemp(join(tmpdir(), 'reader-detail-'));
  const out = join(dir, 'articles.md');
  try {
    assert.equal(
      await main(['-o', out, 'https://example.com/story', 'https://example.com/bad']),
      0,
    );
    const content = await readFile(out, 'utf8');
    assert.ok(content.startsWith('---\n# story\n'));
    assert.ok(content.length > 200);
    assert.ok(!content.includes('# bad'));
    assert.equal(await main(['-o', out, 'https://example.com/bad']), 3);
    assert.equal(await readFile(out, 'utf8'), '');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detail mode accepts piped URLs and rejects empty input', async (t) => {
  t.mock.method(process.stdout, 'write', () => true);
  t.mock.method(process.stderr, 'write', () => true);
  const request = t.mock.method(undici, 'fetch', async () => new Response(article));
  const input = t.mock.method(process.stdin, Symbol.asyncIterator, async function* () {
    yield Buffer.from('https://example.com/piped\n\n');
  });
  assert.equal(await main([]), 0);
  assert.equal(request.mock.callCount(), 1);
  input.mock.mockImplementation(async function* () {
    yield Buffer.from('');
  });
  assert.equal(await main([]), 2);
});

test('MCP article results retain per-URL error text and successful Markdown', async (t) => {
  t.mock.method(
    undici,
    'fetch',
    async (url: Parameters<typeof undici.fetch>[0]) =>
      new Response(String(url).endsWith('/bad') ? '<html/>' : article),
  );
  const result = await readUrls({ urls: ['https://example.com/good', 'https://example.com/bad'] });
  assert.ok(result.content[0].text.includes('# good'));
  assert.ok(result.content[0].text.includes('# Error fetching https://example.com/bad'));
});

test('MCP search preserves source errors and parsed search results', async (t) => {
  t.mock.method(process.stderr, 'write', () => true);
  assert.equal((await search({ source: 'unknown', query: 'topic' })).isError, true);
  assert.equal((await search({ source: 'yahoo', query: 'topic' })).isError, true);
  t.mock.method(
    undici,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          query: {
            search: [{ title: 'Test article', snippet: 'A <b>matching</b> result', pageid: 1 }],
          },
        }),
      ),
  );
  const result = await search({ source: 'wiki', query: 'topic', limit: 2 });
  assert.deepEqual(
    JSON.parse(result.content[0].text).map((item: { title: string }) => item.title),
    ['Test article'],
  );
});
