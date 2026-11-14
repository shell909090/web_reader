import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { makeLogger, type Ctx } from '../lib.ts';
import { callSearchTool } from '../src/search/mcp-client.ts';
import { toolData, structuredItems, exaTextItems } from '../src/search/mcp-results.ts';
import { parallel, firecrawl, exaKeyless } from '../src/search/remote.ts';
import { exa } from '../src/search/apis.ts';
import { keenable } from '../src/search/keenable.ts';
import { loadSearchConfig, providerConfig } from '../src/search/config.ts';
import { search } from '../src/mcp-tools.ts';

const ctx: Ctx = {
  mode: 'http',
  log: makeLogger('error'),
  httpGet: async () => {
    throw new Error('Unexpected HTTP request');
  },
};
const row = { title: 'Example', url: 'https://example.com/', description: 'A snippet' };
const exampleText =
  'Title: Example\nURL: https://example.com/\nPublished: N/A\nAuthor: N/A\nHighlights:\nA snippet\n';

async function start(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
}

test('keyless adapters share the MCP lifecycle, output order and CLI/MCP result contract', async () => {
  const calls: { name: string; arguments: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(405).end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    assert.equal(req.headers.authorization, undefined);
    if (message.method === 'notifications/initialized') {
      res.writeHead(202).end();
      return;
    }
    let result: unknown;
    if (message.method === 'initialize') {
      res.setHeader('Mcp-Session-Id', 'test-session');
      result = {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'fixture', version: '1' },
      };
    } else {
      assert.equal(req.headers['mcp-session-id'], 'test-session');
      assert.equal(message.method, 'tools/call');
      calls.push(message.params);
      const name = message.params.name;
      if (name === 'web_search_exa') result = { content: [{ type: 'text', text: exampleText }] };
      else if (name === 'web_search')
        result = {
          content: [],
          structuredContent: {
            results: [
              { ...row, description: undefined, excerpts: ['A snippet'] },
              { ...row, title: 'Second' },
            ],
          },
        };
      else
        result = {
          content: [
            { type: 'text', text: JSON.stringify({ success: true, data: { web: [row] } }) },
          ],
        };
    }
    if (message.params?.name === 'firecrawl_search') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.end(
        `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`,
      );
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    }
  });
  const endpoint = await start(server);
  try {
    process.env.EXA_MCP_URL = endpoint;
    process.env.PARALLEL_MCP_URL = endpoint;
    process.env.FIRECRAWL_MCP_URL = endpoint;
    for (const provider of [exa, parallel, firecrawl]) {
      const results = await provider(ctx, 'example pages', 1);
      assert.equal(results.length, 1);
      assert.equal(results[0].url, row.url);
      assert.equal(results[0].summary, row.description);
      assert.equal(results[0].rank, 1);
    }
    const output = await search({ source: 'parallel', query: 'example pages', limit: 1 });
    assert.equal(output.isError, undefined);
    assert.equal(JSON.parse(output.content[0].text)[0].source, 'parallel');
    assert.deepEqual(
      calls.map((call) => call.name),
      ['web_search_exa', 'web_search', 'firecrawl_search', 'web_search'],
    );
    assert.ok(calls.every((call) => typeof call.arguments.objective === 'string'));
    assert.equal(calls[2].arguments.scrapeOptions, undefined);
    assert.deepEqual(calls[2].arguments.sources, ['web']);
    assert.equal(calls[2].arguments.highlights, false);
    assert.equal(calls[0].arguments.numResults, 1);
    process.env.PARALLEL_ENABLED = 'false';
    await assert.rejects(parallel(ctx, 'example', 1), /disabled/);
    assert.equal(calls.length, 4);
  } finally {
    for (const name of ['EXA_MCP_URL', 'PARALLEL_MCP_URL', 'FIRECRAWL_MCP_URL', 'PARALLEL_ENABLED'])
      delete process.env[name];
    server.closeAllConnections();
    server.close();
  }
});

test('MCP refusal, malformed response and tool errors are not empty successful results', async () => {
  for (const status of [401, 403, 429]) {
    let count = 0;
    const server = createServer((_req, res) => {
      count++;
      res.writeHead(status, { 'Content-Type': 'text/plain' }).end('secret-token');
    });
    const endpoint = await start(server);
    try {
      await assert.rejects(
        callSearchTool({ source: 'test', endpoint, tool: 'search', args: {}, timeoutMs: 1000 }),
        (error: Error) =>
          error.message.includes(String(status)) && !error.message.includes('secret-token'),
      );
      assert.equal(count, 1);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  }
  for (const invalid of [true, false]) {
    const server = createServer(async (req, res) => {
      if (req.method === 'GET') {
        res.writeHead(405).end();
        return;
      }
      let body = '';
      for await (const chunk of req) body += chunk;
      const message = JSON.parse(body);
      if (message.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      const result =
        message.method === 'initialize'
          ? {
              protocolVersion: '2025-03-26',
              capabilities: { tools: {} },
              serverInfo: { name: 'test', version: '1' },
            }
          : { isError: true, content: [{ type: 'text', text: 'secret-token' }] };
      res.end(
        invalid
          ? 'not json secret-token'
          : JSON.stringify({ jsonrpc: '2.0', id: message.id, result }),
      );
    });
    const endpoint = await start(server);
    try {
      await assert.rejects(
        callSearchTool({ source: 'test', endpoint, tool: 'search', args: {}, timeoutMs: 1000 }),
        (error: Error) => /failed/.test(error.message) && !error.message.includes('secret-token'),
      );
    } finally {
      server.closeAllConnections();
      server.close();
    }
  }
});

test('MCP timeout and redirects terminate without forwarding credentials or following links', async () => {
  let redirected = 0;
  const other = createServer((_req, res) => {
    redirected++;
    res.end();
  });
  const otherUrl = await start(other);
  const redirect = createServer((_req, res) => res.writeHead(307, { Location: otherUrl }).end());
  const endpoint = await start(redirect);
  try {
    await assert.rejects(
      callSearchTool({ source: 'test', endpoint, tool: 'search', args: {}, timeoutMs: 500 }),
    );
    assert.equal(redirected, 0);
  } finally {
    redirect.closeAllConnections();
    redirect.close();
    other.closeAllConnections();
    other.close();
  }
  const stalled = createServer();
  const stalledUrl = await start(stalled);
  const begin = Date.now();
  try {
    await assert.rejects(
      callSearchTool({
        source: 'test',
        endpoint: stalledUrl,
        tool: 'search',
        args: {},
        timeoutMs: 100,
      }),
    );
    assert.ok(Date.now() - begin < 1500);
  } finally {
    stalled.closeAllConnections();
    stalled.close();
  }
  for (const endpoint of [
    'http://example.com/mcp',
    'https://user:secret@example.com/mcp',
    'https://example.com/mcp?key=secret',
  ]) {
    await assert.rejects(callSearchTool({ source: 'test', endpoint, tool: 'search', args: {} }));
  }
  await assert.rejects(
    callSearchTool({
      source: 'test',
      endpoint: 'http://localhost/mcp',
      tool: 'search',
      args: {},
      headers: { Authorization: 'secret' },
    }),
    /HTTPS/,
  );
});

test('MCP output variants preserve order and distinguish empty data from invalid output', async () => {
  assert.deepEqual(toolData({ content: [{ type: 'text', text: '{"results":[]}' }] }), {
    results: [],
  });
  assert.deepEqual(structuredItems('parallel', [], 1), []);
  assert.deepEqual(exaTextItems('No search results found.', 1), []);
  assert.equal(
    exaTextItems(exampleText + exampleText.replace('Example', 'Second'), 1)[0].summary,
    'A snippet',
  );
  assert.equal(
    exaTextItems('Title: Old format\nURL: https://example.com/\nText: Legacy content', 1)[0]
      .summary,
    'Legacy content',
  );
  assert.equal(
    structuredItems('test', [{ url: row.url, title: null, text: 'Content' }], 1)[0].title,
    row.url,
  );
  assert.throws(() => structuredItems('test', {}, 1), /invalid/);
  assert.throws(() => exaTextItems('rate limited', 1), /unrecognized/);
  assert.throws(() => exaTextItems('Title: Incomplete\nText: Bad', 1), /invalid/);
});

test('Keenable keyless HTTP uses application identification and keyed requests never fall back', async () => {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const httpCtx: Ctx = {
    ...ctx,
    httpGet: async (url, opts) => {
      calls.push({ url, headers: opts?.headers ?? {}, body: opts?.body ?? '' });
      return {
        status: 200,
        finalUrl: url,
        html: JSON.stringify({ results: [{ ...row, snippet: 'Excerpt' }] }),
      };
    },
  };
  const keyless = await keenable(httpCtx, 'example pages', 1);
  assert.equal(keyless[0].summary, 'Excerpt');
  assert.equal(new URL(calls[0].url).pathname, '/v1/search/public');
  assert.equal(calls[0].headers['X-Keenable-Title'], 'web_reader');
  assert.equal(calls[0].headers['X-API-Key'], undefined);
  process.env.KEENABLE_API_KEY = 'test-key';
  try {
    await keenable(httpCtx, 'example pages', 1);
    assert.equal(new URL(calls[1].url).pathname, '/v1/search');
    assert.equal(calls[1].headers['X-API-Key'], 'test-key');
    let count = 0;
    await assert.rejects(
      keenable(
        {
          ...ctx,
          httpGet: async () => {
            count++;
            return { status: 403, html: '', finalUrl: '' };
          },
        },
        'example',
        1,
      ),
      /403/,
    );
    assert.equal(count, 1);
  } finally {
    delete process.env.KEENABLE_API_KEY;
  }
  assert.deepEqual(
    await keenable(
      { ...ctx, httpGet: async () => ({ status: 200, html: '{"results":[]}', finalUrl: '' }) },
      'example',
      1,
    ),
    [],
  );
  await assert.rejects(
    keenable(
      { ...ctx, httpGet: async () => ({ status: 200, html: '{"error":"bad"}', finalUrl: '' }) },
      'example',
      1,
    ),
    /invalid/,
  );
});

test('new provider credentials and MCP URLs accept environment-only configuration', () => {
  const config = loadSearchConfig(undefined, {
    XDG_CONFIG_HOME: '/nonexistent-test-config',
    PARALLEL_API_KEY: 'p',
    FIRECRAWL_API_KEY: 'f',
    KEENABLE_API_KEY: 'k',
    EXA_MCP_URL: 'https://example.com/mcp',
  });
  assert.equal(config.parallel?.api_key, 'p');
  assert.equal(config.firecrawl?.api_key, 'f');
  assert.equal(config.keenable?.api_key, 'k');
  assert.equal(config.exa?.mcp_url, 'https://example.com/mcp');
  assert.ok(providerConfig('exa'));
});

test('provider response envelopes support structured Exa and reject invalid or failed payloads', async () => {
  let output: unknown = { results: [row] };
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(405).end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    if (message.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    const result =
      message.method === 'initialize'
        ? {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: 'test', version: '1' },
          }
        : { content: [], structuredContent: output };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  const endpoint = await start(server);
  process.env.PARALLEL_MCP_URL = endpoint;
  process.env.FIRECRAWL_MCP_URL = endpoint;
  try {
    assert.equal((await exaKeyless('example', 1, { mcp_url: endpoint }))[0].title, 'Example');
    output = { results: [] };
    assert.deepEqual(await parallel(ctx, 'empty', 1), []);
    output = { success: true, data: { web: [] } };
    assert.deepEqual(await firecrawl(ctx, 'empty', 1), []);
    output = { wrong: [] };
    await assert.rejects(exaKeyless('invalid', 1, { mcp_url: endpoint }), /invalid/);
    await assert.rejects(parallel(ctx, 'invalid', 1), /invalid/);
    await assert.rejects(firecrawl(ctx, 'invalid', 1), /invalid/);
    output = { success: false, data: { web: [] } };
    await assert.rejects(firecrawl(ctx, 'failure', 1), /unsuccessful/);
    process.env.PARALLEL_API_KEY = 'test-key';
    process.env.FIRECRAWL_API_KEY = 'test-key';
    await assert.rejects(parallel(ctx, 'credential security', 1), /HTTPS/);
    await assert.rejects(firecrawl(ctx, 'credential security', 1), /HTTPS/);
  } finally {
    for (const name of [
      'PARALLEL_MCP_URL',
      'FIRECRAWL_MCP_URL',
      'PARALLEL_API_KEY',
      'FIRECRAWL_API_KEY',
    ])
      delete process.env[name];
    server.closeAllConnections();
    server.close();
  }
});
