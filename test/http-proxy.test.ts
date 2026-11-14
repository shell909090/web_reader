import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import type { Duplex } from 'node:stream';
import { once } from 'node:events';
import { fetchOnce } from '../src/http/transport.ts';

const names = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'];
async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

function proxyServer(target: string, visits: string[], sockets: Set<Duplex>): Server {
  const proxy = createServer();
  proxy.on('connect', (req, socket, head) => {
    visits.push(req.url!);
    sockets.add(socket);
    if (req.url!.endsWith(':443')) {
      socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    const upstream = connect(Number(new URL(target).port), '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    sockets.add(upstream);
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  return proxy;
}

test('HTTP/HTTPS proxy selection, lowercase precedence, NO_PROXY and direct access', async () => {
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  const sockets = new Set<Duplex>();
  const target = createServer((req, res) => {
    assert.equal(req.headers['proxy-authorization'], undefined);
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/final' });
      res.end();
    } else res.end('reachable');
  });
  const targetUrl = await listen(target);
  const firstVisits: string[] = [],
    secondVisits: string[] = [];
  const first = proxyServer(targetUrl, firstVisits, sockets);
  const second = proxyServer(targetUrl, secondVisits, sockets);
  const firstUrl = await listen(first),
    secondUrl = await listen(second);
  try {
    assert.equal((await fetchOnce(targetUrl, {}, 2000)).html, 'reachable');
    process.env.HTTP_PROXY = firstUrl;
    assert.equal(
      (await fetchOnce('http://unresolvable.invalid/redirect', {}, 2000)).html,
      'reachable',
    );
    assert.equal(firstVisits.length, 2);
    process.env.HTTPS_PROXY = secondUrl;
    await assert.rejects(fetchOnce('https://unresolvable.invalid/', {}, 2000));
    assert.deepEqual(secondVisits, ['unresolvable.invalid:443']);
    delete process.env.HTTPS_PROXY;
    await assert.rejects(fetchOnce('https://unresolvable.invalid/', {}, 2000));
    assert.equal(firstVisits.at(-1), 'unresolvable.invalid:443');
    process.env.http_proxy = secondUrl;
    assert.equal((await fetchOnce('http://unresolvable.invalid/', {}, 2000)).html, 'reachable');
    assert.equal(secondVisits.at(-1), 'unresolvable.invalid:80');
    const before = firstVisits.length + secondVisits.length;
    process.env.NO_PROXY = '127.0.0.1';
    assert.equal((await fetchOnce(targetUrl, {}, 2000)).html, 'reachable');
    assert.equal(firstVisits.length + secondVisits.length, before);
    process.env.no_proxy = '*';
    assert.equal((await fetchOnce(targetUrl, {}, 2000)).html, 'reachable');
    assert.equal(firstVisits.length + secondVisits.length, before);
    process.env.http_proxy = 'http://user:secret@[';
    await assert.rejects(
      fetchOnce(targetUrl, {}, 2000),
      (error: Error) => error.message === 'Invalid HTTP proxy configuration',
    );
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    for (const socket of sockets) socket.destroy();
    first.close();
    second.close();
    target.close();
  }
});

test('a stalled proxy CONNECT is cancelled within the request timeout', async () => {
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  const sockets = new Set<Duplex>();
  const proxy = createServer();
  proxy.on('connect', (_req, socket) => sockets.add(socket));
  process.env.HTTP_PROXY = await listen(proxy);
  const start = Date.now();
  try {
    await assert.rejects(fetchOnce('http://unresolvable.invalid/', {}, 150));
    assert.ok(Date.now() - start < 2000);
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    for (const socket of sockets) socket.destroy();
    proxy.close();
  }
});
