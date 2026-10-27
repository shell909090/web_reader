import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { httpGet } from '../lib.ts';

test('httpGet accepts a 32 KiB response header through redirects', async () => {
  const server = createServer((req, res) => {
    res.setHeader('X-Large-Header', 'a'.repeat(32 * 1024));
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/news' });
      res.end();
    } else {
      res.end('<html>News</html>');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const result = await httpGet(`${base}/redirect`);
    assert.equal(result.status, 200);
    assert.equal(result.html, '<html>News</html>');
    assert.equal(result.finalUrl, `${base}/news`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
