import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { httpGet, makeLogger } from '../lib.ts';
import { searxng } from '../src/search/searxng.ts';

async function address(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  return `http://127.0.0.1:${addr.port}`;
}

test('search HTTP preserves POST bodies, refuses credential redirects and exposes retry timing', async () => {
  let targetCalls = 0;
  const target = createServer((_req, res) => {
    targetCalls++;
    res.end('leak');
  });
  const other = await address(target);
  const server = createServer(async (req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: other });
      res.end();
      return;
    }
    if (req.url === '/limited') {
      res.writeHead(429, { 'Retry-After': '60' });
      res.end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ method: req.method, body, token: req.headers['x-api-key'] }));
  });
  const base = await address(server);
  try {
    const response = await httpGet(base, {
      method: 'POST',
      body: '{"query":"example"}',
      headers: { 'x-api-key': 'private' },
      sensitive: true,
    });
    assert.deepEqual(JSON.parse(response.html), {
      method: 'POST',
      body: '{"query":"example"}',
      token: 'private',
    });
    await assert.rejects(
      httpGet(base + '/redirect', { sensitive: true, headers: { Authorization: 'private' } }),
      /Cross-origin/,
    );
    assert.equal(targetCalls, 0);
    const limited = await httpGet(base + '/limited', { sensitive: true });
    assert.equal(limited.status, 429);
    assert.equal(limited.retryAfter, '60');
  } finally {
    server.close();
    target.close();
  }
});

test('SearXNG speaks its JSON protocol to a real local HTTP server', async () => {
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    assert.equal(url.pathname, '/search');
    assert.equal(url.searchParams.get('q'), 'test query');
    assert.equal(url.searchParams.get('format'), 'json');
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        results: [{ title: 'Example', url: 'https://example.com/', content: 'A summary' }],
      }),
    );
  });
  const base = await address(server);
  process.env.SEARXNG_BASE_URL = base;
  try {
    const results = await searxng(
      { mode: 'http', httpGet, log: makeLogger('error') },
      'test query',
      3,
    );
    assert.equal(results[0].title, 'Example');
    assert.equal(results[0].summary, 'A summary');
  } finally {
    delete process.env.SEARXNG_BASE_URL;
    server.close();
  }
});
