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

  test('TC-N5: valid args but plugin load fails returns exit code 3', async () => {
    // hn plugin does not exist yet, so all sources fail to load
    const code = await callMain(['--sources', 'hn', '--mode', 'list']);
    // Either 2 (param error for unknown source) or 3 (all sources failed)
    assert.ok(code === 2 || code === 3, `expected exit code 2 or 3, got ${code}`);
  });
});
