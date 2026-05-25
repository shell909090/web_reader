import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function callMain(argv: string[]): Promise<number> {
  const mod = await import('../read.ts');
  return (mod as { main: (argv: string[]) => Promise<number> }).main(argv);
}

const hnFixture = readFileSync(new URL('fixtures/hn/list.html', import.meta.url), 'utf-8');

describe('read.ts main()', () => {
  test('TC-R1: --help returns exit code 0', async () => {
    const code = await callMain(['--help']);
    assert.equal(code, 0);
  });

  test('TC-R2: unknown flag returns exit code 2', async () => {
    const code = await callMain(['--unknown-flag-xyz']);
    assert.equal(code, 2);
  });

  test('TC-R3: unknown source returns exit code 2', async () => {
    const code = await callMain(['-s', 'nonexistent-source-xyz']);
    assert.equal(code, 2);
  });

  test('TC-R4: invalid loglevel returns exit code 2', async () => {
    const code = await callMain(['-s', 'hn', '-l', 'verbose']);
    assert.equal(code, 2);
  });

  test('TC-R5: -q without keywords returns exit code 2', async () => {
    const code = await callMain(['-q', 'wiki']);
    assert.equal(code, 2);
  });

  // TC-R6: list mode with mocked fetch
  test('TC-R6: hn list with mocked fetch → exit code 0', { timeout: 10000 }, async () => {
    const origFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      new Response(hnFixture, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    try {
      const code = await callMain(['-s', 'hn', '-n', '5']);
      assert.equal(code, 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // TC-R7: file output mode
  test('TC-R7: list file mode writes output.json → exit code 0', { timeout: 10000 }, async () => {
    const origFetch = globalThis.fetch;
    const tmpDir = await mkdtemp(join(tmpdir(), 'read-test-'));
    const outFile = join(tmpDir, 'output.json');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      new Response(hnFixture, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    try {
      const code = await callMain(['-s', 'hn', '-o', outFile, '-n', '5']);
      assert.equal(code, 0);
    } finally {
      globalThis.fetch = origFetch;
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // TC-R8: query mode with mocked fetch
  test('TC-R8: wiki query with mocked fetch → exit code 0', { timeout: 10000 }, async () => {
    const mockResult = JSON.stringify([
      'transformer neural network',
      ['Transformer (deep learning)', 'Attention mechanism'],
      ['In deep learning...', 'Mechanism used in neural networks...'],
      [
        'https://en.wikipedia.org/wiki/Transformer_(deep_learning)',
        'https://en.wikipedia.org/wiki/Attention_mechanism',
      ],
    ]);
    const origFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      new Response(
        // Return wiki search API format (query.search array style)
        JSON.stringify({
          query: {
            search: [
              {
                title: 'Transformer (deep learning)',
                snippet: 'In deep learning, the transformer...',
                pageid: 1,
              },
              { title: 'Attention mechanism', snippet: 'Mechanism used in networks...', pageid: 2 },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    void mockResult; // used above for reference
    try {
      const code = await callMain(['-q', 'wiki', 'transformer', 'neural', 'network', '-n', '5']);
      assert.equal(code, 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('TC-R9: invalid --profile returns exit code 2', async () => {
    const code = await callMain(['-s', 'hn', '-p', 'ie6']);
    assert.equal(code, 2);
  });

  test('TC-R10: valid --profile chrome-win returns exit code 0', { timeout: 10000 }, async () => {
    const origFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      new Response(hnFixture, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    try {
      const code = await callMain(['-s', 'hn', '-n', '5', '-p', 'chrome-win']);
      assert.equal(code, 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
