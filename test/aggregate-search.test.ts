import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchCandidates,
  selectSearch,
  mergeSearchResults,
  shuffleProviders,
} from '../src/search/aggregate.ts';
import { SearchUnavailable, statusFailure } from '../src/search/errors.ts';
import { SEARCH_IDS } from '../src/search/config.ts';
import { loadPlugin } from '../src/plugin-loader.ts';
import { makeLogger, type Item } from '../lib.ts';
import { search } from '../src/mcp-tools.ts';

const item = (source: string, path: string, rank = 1): Item => ({
  source,
  title: path,
  url: `https://example.com/${path}`,
  notes: '',
  rank,
});

test('candidates use configuration only and exclude vertical search', () => {
  assert.deepEqual(searchCandidates({}), [
    'duckduckgo',
    'exa',
    'parallel',
    'firecrawl',
    'keenable',
  ]);
  assert.deepEqual(
    searchCandidates(Object.fromEntries(SEARCH_IDS.map((id) => [id, { enabled: false }]))),
    [],
  );
  const ids = searchCandidates({
    brave: { api_key: 'key' },
    tavily: { api_key: '  ' },
    searxng: { base_url: 'https://example.com' },
    wolframalpha: { app_id: 'key' },
  });
  assert.ok(ids.includes('brave'));
  assert.ok(ids.includes('searxng'));
  assert.ok(!ids.includes('tavily'));
});

test('any samples without replacement, switches only on availability errors and accepts empty success', async () => {
  assert.deepEqual(
    shuffleProviders(['brave', 'exa'], () => 0),
    ['exa', 'brave'],
  );
  const calls: string[] = [];
  const warnings: string[] = [];
  const rows = await selectSearch(
    'any',
    ['brave', 'exa', 'tavily'],
    async (id) => {
      calls.push(id);
      if (id === 'brave') throw new SearchUnavailable('network unavailable');
      return [];
    },
    2,
    (w) => warnings.push(w),
    () => 0.999,
  );
  assert.deepEqual(rows, []);
  assert.deepEqual(calls, ['brave', 'exa']);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0]!.includes('private'));
  for (const error of [
    statusFailure('brave', 403),
    statusFailure('brave', 429),
    new Error('invalid response'),
  ]) {
    let count = 0;
    await assert.rejects(
      selectSearch(
        'any',
        ['brave', 'exa'],
        async () => {
          count++;
          throw error;
        },
        1,
        () => {},
        () => 0.999,
      ),
      /search failed|access failed/,
    );
    assert.equal(count, 1);
  }
  assert.equal(
    (
      await selectSearch(
        'any',
        ['exa'],
        async () => [item('exa', 'a'), item('exa', 'b')],
        1,
        () => {},
      )
    ).length,
    1,
  );
});

test('all interleaves in provider order, deduplicates tracking URLs and retains contributors', async () => {
  const groups = [
    [item('brave', 'same?utm_source=x'), item('brave', 'b', 2)],
    [item('exa', 'same#fragment'), item('exa', 'c', 2)],
  ];
  const merged = mergeSearchResults(groups, 3);
  assert.deepEqual(
    merged.map((row) => row.title),
    ['same?utm_source=x', 'b', 'c'],
  );
  assert.deepEqual(merged[0]!.contributors, [
    { source: 'brave', rank: 1 },
    { source: 'exa', rank: 1 },
  ]);
  const called: string[] = [];
  let running = 0;
  let maximum = 0;
  const warnings: string[] = [];
  const result = await selectSearch(
    'all',
    ['brave', 'exa', 'tavily'],
    async (id) => {
      called.push(id);
      running++;
      maximum = Math.max(maximum, running);
      await new Promise((resolve) => setTimeout(resolve, id === 'brave' ? 20 : 1));
      running--;
      if (id === 'tavily') throw new Error('secret');
      return groups[id === 'brave' ? 0 : 1]!;
    },
    1,
    (w) => warnings.push(w),
  );
  assert.equal(called.length, 3);
  assert.equal(maximum, 2);
  assert.deepEqual(result, merged.slice(0, 1));
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0]!.includes('secret'));
});

test('selectors distinguish absent candidates, complete failure and successful empty responses', async () => {
  for (const mode of ['any', 'all'] as const) {
    await assert.rejects(
      selectSearch(
        mode,
        [],
        async () => [],
        1,
        () => {},
      ),
      /No eligible/,
    );
    await assert.rejects(
      selectSearch(
        mode,
        ['exa'],
        async () => {
          throw new SearchUnavailable('down');
        },
        1,
        () => {},
      ),
      /All web search providers failed/,
    );
  }
  assert.deepEqual(
    await selectSearch(
      'all',
      ['exa', 'brave'],
      async (id) => {
        if (id === 'brave') throw new Error();
        return [];
      },
      2,
      () => {},
    ),
    [],
  );
  assert.ok(statusFailure('exa', 503) instanceof SearchUnavailable);
  assert.ok(statusFailure('exa', 402) instanceof SearchUnavailable);
});

test('shared plugin entry supports selectors without list capability and MCP reports configuration failures', async () => {
  const previous = { ...process.env };
  try {
    for (const id of SEARCH_IDS) process.env[`${id.toUpperCase()}_ENABLED`] = 'false';
    for (const mode of ['any', 'all']) {
      const plugin = await loadPlugin(mode, makeLogger('error'));
      assert.ok(plugin?.search);
      assert.equal(plugin.list, undefined);
      const result = await search({ source: mode, query: 'test' });
      assert.equal(result.isError, true);
      assert.match(result.content[0]!.text, /No eligible/);
    }
    process.env.DUCKDUCKGO_ENABLED = 'true';
    const plugin = await loadPlugin('all', makeLogger('error'));
    const rows = await plugin!.search!(
      {
        mode: 'http',
        log: makeLogger('error'),
        httpGet: async () => ({
          status: 200,
          html: '<div class="no-results">No results</div>',
          finalUrl: 'https://html.duckduckgo.com/html/',
        }),
      },
      'test',
      2,
    );
    assert.deepEqual(rows, []);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test('CLI and MCP selectors share merging and partial failure diagnostics', async (t) => {
  const { default: undici, Response } = await import('undici');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { runQuery } = await import('../src/cli/query.ts');
  const previous = { ...process.env };
  const directory = await mkdtemp(join(tmpdir(), 'aggregate-search-'));
  try {
    for (const id of SEARCH_IDS) process.env[`${id.toUpperCase()}_ENABLED`] = 'false';
    process.env.DUCKDUCKGO_ENABLED = 'true';
    process.env.KEENABLE_ENABLED = 'true';
    const transport = t.mock.method(undici, 'fetch', async (url: unknown) => {
      if (String(url).includes('duckduckgo')) return new Response('', { status: 403 });
      return new Response(
        JSON.stringify({ results: [{ title: 'Example', url: 'https://example.com/a' }] }),
      );
    });
    const warnings: string[] = [];
    const log = { ...makeLogger('error'), warn: (text: string) => warnings.push(text) };
    const out = join(directory, 'results.json');
    assert.equal(
      await runQuery(
        {
          mode: 'query',
          source: 'all',
          keywords: ['example'],
          limit: 1,
          out,
          loglevel: 'error',
          profile: 'default',
        },
        log,
      ),
      0,
    );
    const cliRows = JSON.parse(await readFile(out, 'utf8'));
    const mcp = await search({ source: 'all', query: 'example', limit: 1 });
    assert.deepEqual(JSON.parse(mcp.content[0]!.text), cliRows);
    assert.equal(cliRows[0].source, 'keenable');
    assert.match(warnings[0]!, /duckduckgo.*403/);
    assert.match(mcp.content[1]!.text, /Warning: duckduckgo.*403/);
    assert.equal(transport.mock.callCount(), 4);
    process.env.DUCKDUCKGO_ENABLED = 'false';
    const any = await search({ source: 'any', query: 'example', limit: 1 });
    assert.equal(JSON.parse(any.content[0]!.text)[0].source, 'keenable');
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    await rm(directory, { recursive: true, force: true });
  }
});
