import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeListJson, writeArticleMd } from '../lib.ts';
import type { Item } from '../lib.ts';

let tmpDir: string;

async function makeTmp(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'news-test-'));
  return tmpDir;
}

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('writeListJson', () => {
  test('TC-W1: writes list.json with correct content and encoding', async () => {
    const dir = await makeTmp();
    const items: Item[] = [
      { source: 'hn', title: 'Hello World', url: 'https://example.com', notes: '100 points' },
      { source: 'bbc', title: '中文标题', url: 'https://bbc.com/news/1', notes: 'BBC' },
    ];

    await writeListJson(dir, items);

    const raw = await readFile(join(dir, 'list.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Item[];
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].source, 'hn');
    assert.equal(parsed[1].title, '中文标题');
    // Verify 2-space indent
    assert.ok(raw.includes('  "source"'), 'should use 2-space indent');
  });

  test('TC-W2: creates directory if it does not exist', async () => {
    const dir = join(await makeTmp(), 'nested', 'sub');
    await writeListJson(dir, []);
    const raw = await readFile(join(dir, 'list.json'), 'utf-8');
    assert.deepEqual(JSON.parse(raw), []);
  });
});

describe('writeArticleMd', () => {
  test('TC-W3: filename format is {source}-{NNNN}.md (4-digit zero-padded)', async () => {
    const dir = await makeTmp();
    const path = await writeArticleMd(dir, 'bbc', 1, 'Test Article', 'Body text here.');
    assert.equal(path, 'bbc-0001.md');
  });

  test('TC-W4: first line is # title, second line blank, then markdown body', async () => {
    const dir = await makeTmp();
    await writeArticleMd(dir, 'hn', 3, 'My Title', 'Line one.\n\nLine two.');
    const content = await readFile(join(dir, 'hn-0003.md'), 'utf-8');
    assert.ok(content.startsWith('# My Title\n\n'), 'must start with # title + blank line');
    assert.ok(content.includes('Line one.'));
  });

  test('TC-W5: index pads correctly for large numbers', async () => {
    const dir = await makeTmp();
    const path = await writeArticleMd(dir, 'tc', 42, 'Title', 'body');
    assert.equal(path, 'tc-0042.md');
  });

  test('TC-W6: creates directory if it does not exist', async () => {
    const dir = join(await makeTmp(), 'out');
    const path = await writeArticleMd(dir, 'src', 1, 'T', 'body');
    assert.equal(path, 'src-0001.md');
    const content = await readFile(join(dir, 'src-0001.md'), 'utf-8');
    assert.ok(content.length > 0);
  });
});
