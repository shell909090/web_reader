import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectFeedResults } from '../src/feeds/results.ts';
import { pConcurrent } from '../src/concurrency.ts';
import { makeLogger, type Item } from '../lib.ts';

test('feed aggregation keeps first-seen items and reports failed feeds without losing successes', () => {
  const first: Item = { source: 'test', title: 'First', url: 'https://example.com/a', notes: '' };
  const second = { ...first, title: 'Second', url: 'https://example.com/b' };
  const warnings: string[] = [];
  const log = {
    ...makeLogger('error'),
    warn: (message: string) => {
      warnings.push(message);
    },
  };
  const items = collectFeedResults(
    [
      { status: 'fulfilled', value: [first] },
      { status: 'rejected', reason: new Error('offline') },
      { status: 'fulfilled', value: [{ ...first, title: 'Duplicate' }, second] },
    ],
    log,
    'Feed error',
  );
  assert.deepEqual(items, [first, second]);
  assert.deepEqual(warnings, ['Feed error: offline']);
});

test('concurrency helper respects its limit and processes every item', async () => {
  let active = 0;
  let peak = 0;
  const done: number[] = [];
  await pConcurrent([1, 2, 3, 4, 5], 2, async (item) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    done.push(item);
    active--;
  });
  assert.equal(peak, 2);
  assert.deepEqual(done, [1, 2, 3, 4, 5]);
  assert.equal(active, 0);
});
