import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

async function callMain(argv: string[]): Promise<number> {
  const mod = await import('../news.ts');
  return (mod as { main: (argv: string[]) => Promise<number> }).main(argv);
}

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

  // cnbc-ai plugin is not yet implemented; tests plugin-load-failure path → exit code 3
  test('TC-N5: all-sources-fail when plugin file missing returns exit code 3', async () => {
    const code = await callMain(['--sources', 'cnbc-ai', '--mode', 'list']);
    assert.equal(code, 3, `expected 3 (all sources failed), got ${code}`);
  });
});
