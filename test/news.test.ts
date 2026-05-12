import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function callMain(argv: string[]): Promise<number> {
  const mod = await import('../news.ts');
  return (mod as { main: (argv: string[]) => Promise<number> }).main(argv);
}

const hnFixture = readFileSync(new URL('fixtures/hn/list.html', import.meta.url), 'utf-8');

describe('main() exit codes', () => {
  test('TC-N1: --help returns exit code 0', async () => {
    const code = await callMain(['--help']);
    assert.equal(code, 0);
  });

  test('TC-N2: missing --sources returns exit code 2', async () => {
    const code = await callMain(['--mode', 'list']);
    assert.equal(code, 2);
  });

  test('TC-N3: unknown source returns exit code 2 or 3', async () => {
    const code = await callMain(['--sources', 'nonexistent-source-xyz']);
    assert.ok(code === 2 || code === 3, `expected exit code 2 or 3, got ${code}`);
  });

  test('TC-N4: invalid --mode returns exit code 2', async () => {
    const code = await callMain(['--sources', 'hn', '--mode', 'invalid']);
    assert.equal(code, 2);
  });

  // TC-N5: exercise the full dispatch path using mocked fetch (no real network)
  test(
    'TC-N5: hn list mode with mocked fetch succeeds → exit code 0',
    { timeout: 10000 },
    async () => {
      const origFetch = globalThis.fetch;
      const tmpOut = await mkdtemp(join(tmpdir(), 'news-main-test-'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = async () =>
        new Response(hnFixture, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      try {
        const code = await callMain([
          '--sources',
          'hn',
          '--mode',
          'list',
          '--out',
          tmpOut,
          '--limit',
          '5',
        ]);
        assert.equal(code, 0);
      } finally {
        globalThis.fetch = origFetch;
        await rm(tmpOut, { recursive: true, force: true });
      }
    },
  );
});
