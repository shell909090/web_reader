import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type RequestListener } from 'node:http';
import { once } from 'node:events';
import { fetchOnce } from '../src/http/transport.ts';
import { httpGet } from '../lib.ts';

/** Run a request against an isolated local HTTP server. */
async function withServer(
  handler: RequestListener,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

for (const path of ['/news', '/redirect']) {
  test(`fetchOnce aborts a stalled body at ${path}`, { timeout: 5000 }, async () => {
    let bodyStarted = false;
    await withServer(
      (req, res) => {
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: '/news' });
          res.end();
          return;
        }
        res.writeHead(200);
        res.write('partial body');
        bodyStarted = true;
      },
      async (base) => {
        await assert.rejects(fetchOnce(`${base}${path}`, {}, 200), { name: 'AbortError' });
        assert.equal(bodyStarted, true);
      },
    );
  });
}

for (const recover of [true, false]) {
  test(
    `httpGet retries a stalled body once (recovery=${recover})`,
    { timeout: 10000 },
    async () => {
      let requests = 0;
      await withServer(
        (_req, res) => {
          requests++;
          res.writeHead(200);
          if (recover && requests === 2) {
            res.end('complete body');
          } else {
            res.write('partial body');
          }
        },
        async (base) => {
          const result = httpGet(base, { timeoutMs: 200 });
          if (recover) {
            assert.equal((await result).html, 'complete body');
          } else {
            await assert.rejects(result, { name: 'AbortError' });
          }
          assert.equal(requests, 2);
        },
      );
    },
  );
}
