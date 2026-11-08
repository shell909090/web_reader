import { test } from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../plugins/bsky.ts';
import { makeLogger, type Ctx } from '../lib.ts';

for (const status of [401, 403]) {
  test(`Bluesky HTTP ${status} is reported without claiming a proven authentication cause`, async () => {
    const ctx: Ctx = {
      mode: 'http',
      log: makeLogger('error'),
      httpGet: async (url) => ({ status, html: 'Access denied', finalUrl: url }),
    };
    await assert.rejects(plugin.search!(ctx, 'science', 3), (error: Error) => {
      assert.ok(error.message.includes(`HTTP ${status}`));
      assert.ok(error.message.includes('does not establish the cause'));
      assert.ok(!error.message.includes('search requires authentication'));
      return true;
    });
  });
}
