import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLogger, type Ctx, type HttpGetOpts } from '../lib.ts';
import { loadPlugin } from '../src/plugin-loader.ts';
import { SEARCH_IDS } from '../src/search/config.ts';
import { parseWebSearch } from '../src/search/web.ts';
import { search } from '../src/mcp-tools.ts';

const log = makeLogger('error');
function context(data: unknown, inspect?: (url: string, opts?: HttpGetOpts) => void): Ctx {
  return {
    mode: 'http',
    log,
    httpGet: async (url, opts) => {
      inspect?.(url, opts);
      return {
        status: 200,
        html: typeof data === 'string' ? data : JSON.stringify(data),
        finalUrl: url,
      };
    },
  };
}
const rows = [
  { title: 'First', url: 'https://example.com/one' },
  { title: 'Second', url: 'https://example.com/two' },
];

test('official APIs preserve order and send credentials only to search endpoints', async () => {
  for (const id of ['brave', 'tavily', 'exa'] as const) {
    process.env[`${id.toUpperCase()}_API_KEY`] = 'test-secret';
    const data =
      id === 'brave'
        ? { query: { original: 'example' }, web: { results: rows } }
        : { results: rows };
    let calls = 0;
    const ctx = context(data, (url, opts) => {
      calls++;
      assert.equal(opts?.sensitive, true);
      assert.ok(JSON.stringify(opts?.headers).includes('test-secret'));
      assert.ok(!url.includes('test-secret'));
      if (id !== 'brave') assert.equal(opts?.method, 'POST');
    });
    const plugin = await loadPlugin(id, log);
    assert.ok(plugin?.search);
    assert.equal(plugin.list, undefined);
    const results = await plugin.search(ctx, 'example', 1);
    assert.equal(calls, 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'First');
    assert.equal(results[0].url, rows[0].url);
    await assert.rejects(
      plugin.search(context({ error: 'test-secret' }), 'x', 2),
      /invalid search response/,
    );
    const empty = id === 'brave' ? { query: { original: 'x' } } : { results: [] };
    assert.deepEqual(await plugin.search(context(empty), 'x', 2), []);
    delete process.env[`${id.toUpperCase()}_API_KEY`];
    await assert.rejects(plugin.search(ctx, 'x', 2), /missing api_key/);
  }
});

test('knowledge answers have no fabricated URL or news timestamps', async () => {
  process.env.WOLFRAMALPHA_APP_ID = 'test-app';
  const plugin = await loadPlugin('wolframalpha', log);
  const result = await plugin!.search!(
    context({
      queryresult: {
        success: true,
        error: false,
        pods: [{ title: 'Result', subpods: [{ plaintext: '4' }] }],
      },
    }),
    '2+2',
    1,
  );
  assert.equal(result[0].kind, 'answer');
  assert.equal(result[0].url, undefined);
  assert.match(String(result[0].answer), /4/);
  assert.deepEqual(
    await plugin!.search!(context({ queryresult: { success: false, error: false } }), 'x', 1),
    [],
  );
  await assert.rejects(
    plugin!.search!(context({ queryresult: { success: false, error: true } }), 'x', 1),
    /rejected/,
  );
  await assert.rejects(
    plugin!.search!(context({ queryresult: { success: true, error: false, pods: [] } }), 'x', 1),
    /no readable/,
  );
  delete process.env.WOLFRAMALPHA_APP_ID;
  await assert.rejects(plugin!.search!(context({}), 'x', 1), /missing app_id/);
});

test('SearXNG validates configuration, preserves instance subpaths and reports upstream failures', async () => {
  const plugin = await loadPlugin('searxng', log);
  await assert.rejects(plugin!.search!(context({}), 'x', 2), /missing base_url/);
  process.env.SEARXNG_BASE_URL = 'http://localhost:8888/private/';
  const ctx = context({ results: rows }, (url) =>
    assert.equal(new URL(url).pathname, '/private/search'),
  );
  assert.equal((await plugin!.search!(ctx, 'x', 1)).length, 1);
  assert.deepEqual(await plugin!.search!(context({ results: [] }), 'x', 1), []);
  await assert.rejects(
    plugin!.search!(context({ results: [], unresponsive_engines: [['bing', 'blocked']] }), 'x', 1),
    /upstream engines failed/,
  );
  const partial = await plugin!.search!(
    context({ results: rows, unresponsive_engines: [['bing', 'blocked']] }),
    'x',
    1,
  );
  assert.equal(partial.length, 1);
  delete process.env.SEARXNG_BASE_URL;
});

test('web parsers extract ranked links and reject challenges and unexpected pages', () => {
  const pages = {
    duckduckgo:
      '<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F">Title</a><div class="result__snippet">Summary</div></div>',
    bing: '<li class="b_algo"><h2><a href="https://example.com/">Title</a></h2><div class="b_caption"><p>Summary</p></div></li>',
    baidu:
      '<div id="content_left"><div class="result"><h3><a href="https://example.com/">Title</a></h3><div class="c-abstract">Summary</div></div></div>',
    sogou:
      '<div class="vrwrap"><h3><a href="https://example.com/">Title</a></h3><div class="str_info">Summary</div></div>',
  };
  for (const [id, html] of Object.entries(pages)) {
    const result = parseWebSearch(id as keyof typeof pages, html, 1)[0];
    assert.equal(result.url, 'https://example.com/');
    assert.equal(result.rank, 1);
    assert.equal(result.summary, 'Summary');
  }
  assert.deepEqual(parseWebSearch('duckduckgo', '<div class="no-results">None</div>', 5), []);
  assert.throws(
    () => parseWebSearch('duckduckgo', '<form id="challenge-form"></form>', 5),
    /verification/,
  );
  assert.throws(() => parseWebSearch('bing', '<title>安全验证</title>', 5), /verification/);
  assert.throws(() => parseWebSearch('duckduckgo', '<div>Unknown page</div>', 5), /unrecognized/);
  assert.throws(
    () =>
      parseWebSearch(
        'duckduckgo',
        '<div class="result"><a class="result__a" href="javascript:alert(1)">Bad</a></div>',
        5,
      ),
    /unrecognized/,
  );
});

test('restricted engines never send requests, even when explicitly enabled', async () => {
  for (const id of ['bing', 'baidu', 'sogou']) {
    const plugin = await loadPlugin(id, log);
    const ctx = context('', () => assert.fail('must not request prohibited path'));
    await assert.rejects(plugin!.search!(ctx, 'example', 3), /robots.txt/);
  }
});

test('DuckDuckGo makes one request and stops on refusal, rate limiting or malformed data', async () => {
  const plugin = await loadPlugin('duckduckgo', log);
  const result = await plugin!.search!(
    context(
      '<div class="result"><a class="result__a" href="https://example.com">Example</a></div>',
    ),
    'example',
    3,
  );
  assert.equal(result.length, 1);
  for (const status of [403, 429]) {
    const ctx: Ctx = {
      ...context(''),
      httpGet: async () => ({ status, html: 'secret', finalUrl: '', retryAfter: '60' }),
    };
    await assert.rejects(plugin!.search!(ctx, 'x', 1), new RegExp(String(status)));
  }
  const ctx: Ctx = {
    ...context(''),
    httpGet: async () => {
      throw new Error('secret');
    },
  };
  await assert.rejects(
    plugin!.search!(ctx, 'x', 1),
    (error: Error) => !error.message.includes('secret'),
  );
});

test('provider discovery and MCP missing-credential errors are explicit', async () => {
  for (const id of SEARCH_IDS) assert.ok((await loadPlugin(id, log))?.search);
  assert.equal(await loadPlugin('../read', log), null);
  const response = await search({ source: 'brave', query: 'x' });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /missing api_key/);
});
