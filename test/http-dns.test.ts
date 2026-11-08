import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookup, Resolver } from 'node:dns/promises';
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseHosts } from '../src/http/hosts.ts';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { requestLookup } from '../src/http/dns.ts';

/** Adapt the socket lookup callback for assertions. */
function resolve(
  hostname: string,
  options: LookupOptions,
  signal = new AbortController().signal,
): Promise<{ address: string | LookupAddress[]; family?: number }> {
  return new Promise((accept, reject) => {
    requestLookup(signal)(hostname, options, (error, address, family) => {
      if (error) reject(error);
      else accept({ address, family });
    });
  });
}

test('request DNS preserves system hosts and all-address ordering', async () => {
  const expected = await lookup('localhost', { all: true });
  assert.deepEqual(
    new Set((await resolve('localhost', { all: true })).address as LookupAddress[]),
    new Set(expected),
  );
});

for (const family of [4, 6]) {
  test(`request DNS preserves single-address IPv${family} results`, async () => {
    const expected = await lookup('localhost', { family });
    assert.deepEqual(await resolve('localhost', { family }), expected);
  });
}

test('request DNS propagates resolver error codes', async () => {
  await assert.rejects(resolve('invalid hostname!', {}), { code: 'EBADNAME' });
});

test('request DNS can be cancelled before completion', { timeout: 5000 }, async () => {
  const controller = new AbortController();
  const result = resolve('localhost', { all: true }, controller.signal);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
});

test('request DNS rejects an already cancelled request', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(resolve('localhost', {}, controller.signal), { name: 'AbortError' });
});

test('literals bypass DNS and incompatible families fail', async () => {
  assert.deepEqual(await resolve('127.0.0.1', {}), { address: '127.0.0.1', family: 4 });
  await assert.rejects(resolve('127.0.0.1', { family: 6 }), { code: 'ENOTFOUND' });
});

test('DNS combines A/AAAA and honors requested families and ordering', async (t) => {
  t.mock.method(Resolver.prototype, 'resolve4', async () => ['192.0.2.1']);
  t.mock.method(Resolver.prototype, 'resolve6', async () => ['2001:db8::1']);
  assert.deepEqual((await resolve('test.invalid', { all: true })).address, [
    { address: '192.0.2.1', family: 4 },
    { address: '2001:db8::1', family: 6 },
  ]);
  assert.equal((await resolve('test.invalid', { family: 4 })).family, 4);
  assert.equal((await resolve('test.invalid', { family: 6 })).family, 6);
  assert.equal((await resolve('test.invalid', { order: 'ipv6first' })).family, 6);
});

test('one missing DNS family does not discard the available family', async (t) => {
  t.mock.method(Resolver.prototype, 'resolve4', async () => ['192.0.2.1']);
  t.mock.method(Resolver.prototype, 'resolve6', async () => {
    throw Object.assign(new Error('missing'), { code: 'ENODATA' });
  });
  assert.equal((await resolve('test.invalid', {})).address, '192.0.2.1');
});

test('both failed DNS queries propagate their error', async (t) => {
  const fail = async (): Promise<never> => {
    throw Object.assign(new Error('missing'), { code: 'ENOTFOUND' });
  };
  t.mock.method(Resolver.prototype, 'resolve4', fail);
  t.mock.method(Resolver.prototype, 'resolve6', fail);
  await assert.rejects(resolve('test.invalid', {}), { code: 'ENOTFOUND' });
});

test('hosts parser supports aliases, comments, IPv6 and duplicate entries', () => {
  assert.deepEqual(
    parseHosts('127.0.0.1 Local alias # note\n::1 ALIAS\nbad alias\n127.0.0.1 alias', 'Alias'),
    [
      { address: '127.0.0.1', family: 4 },
      { address: '::1', family: 6 },
    ],
  );
});

test('stalled DNS is cancelled and CLI process exits promptly', { timeout: 10000 }, async () => {
  const server = createSocket('udp4');
  server.bind(0, '127.0.0.1');
  await once(server, 'listening');
  let packets = 0;
  server.on('message', () => packets++);
  try {
    const code = `
      import dns from 'node:dns';
      import {httpGet} from ${JSON.stringify(new URL('../lib.ts', import.meta.url).href)};
      dns.setServers(['127.0.0.1:${server.address().port}']);
      try { await httpGet('http://stalled.invalid/', {timeoutMs: 200}); process.exit(1); }
      catch (error) {
        if (error.name !== 'AbortError') throw error;
        console.log(JSON.stringify(process.getActiveResourcesInfo()));
        process.exit(0);
      }
    `;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '-e', code],
      { timeout: 5000, killSignal: 'SIGKILL' },
    );
    assert.ok(packets >= 2, `DNS requests reached the silent server: ${packets}, ${stdout}`);
    assert.ok(!stdout.includes('GetAddrInfoReqWrap'));
    assert.ok(!stdout.includes('QueryReqWrap'));
  } finally {
    server.close();
  }
});

test(
  'a cancelled DNS attempt can retry successfully without delaying exit',
  { timeout: 10000 },
  async () => {
    const dnsServer = createSocket('udp4');
    const httpServer = createServer((_req, response) => response.end('recovered'));
    dnsServer.bind(0, '127.0.0.1');
    httpServer.listen(0, '127.0.0.1');
    await Promise.all([once(dnsServer, 'listening'), once(httpServer, 'listening')]);
    let firstQueryAt = 0;
    let dropped = 0;
    dnsServer.on('message', (query, peer) => {
      firstQueryAt ||= Date.now();
      if (Date.now() - firstQueryAt < 300) {
        dropped++;
        return;
      }
      let end = 12;
      while (query[end]) end += query[end] + 1;
      const isA = query.readUInt16BE(end + 1) === 1;
      const question = Buffer.from(query.subarray(0, end + 5));
      question.writeUInt16BE(0x8180, 2);
      question.writeUInt16BE(isA ? 1 : 0, 6);
      question.writeUInt16BE(0, 8);
      question.writeUInt16BE(0, 10);
      const answer = isA ? Buffer.from('c00c000100010000003c00047f000001', 'hex') : Buffer.alloc(0);
      dnsServer.send(Buffer.concat([question, answer]), peer.port, peer.address);
    });
    try {
      const address = httpServer.address();
      assert.ok(address && typeof address !== 'string');
      const code = `
      import dns from 'node:dns';
      import {httpGet} from ${JSON.stringify(new URL('../lib.ts', import.meta.url).href)};
      dns.setServers(['127.0.0.1:${dnsServer.address().port}']);
      const response = await httpGet('http://recovery.example:${address.port}/', {timeoutMs: 200});
      console.log(response.html);
      process.exit(0);
    `;
      const { stdout } = await promisify(execFile)(
        process.execPath,
        ['--input-type=module', '-e', code],
        { timeout: 5000, killSignal: 'SIGKILL' },
      );
      assert.equal(stdout.trim(), 'recovered');
      assert.ok(dropped >= 2);
    } finally {
      dnsServer.close();
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  },
);

test('cancelling one lookup leaves another resolver running', async (t) => {
  const pending = new Map<Resolver, (value: string[]) => void>();
  t.mock.method(Resolver.prototype, 'resolve4', function (this: Resolver) {
    return new Promise<string[]>((accept) => pending.set(this, accept));
  });
  t.mock.method(Resolver.prototype, 'cancel', function (this: Resolver) {
    pending.get(this)?.([]);
  });
  const first = new AbortController();
  const firstResult = resolve('first.example', { family: 4 }, first.signal);
  const secondResult = resolve('second.example', { family: 4 });
  while (pending.size < 2) await new Promise<void>((accept) => setImmediate(accept));
  first.abort();
  await assert.rejects(firstResult, { name: 'AbortError' });
  for (const accept of pending.values()) accept(['192.0.2.2']);
  assert.equal((await secondResult).address, '192.0.2.2');
});
