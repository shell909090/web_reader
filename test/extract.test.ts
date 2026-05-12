import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractMarkdown, ExtractError } from '../lib.ts';

function fixture(name: string): string {
  return readFileSync(new URL(`fixtures/extract/${name}`, import.meta.url), 'utf-8');
}

describe('extractMarkdown', () => {
  test('TC-E1: bbc fixture produces non-empty markdown > 200 chars', () => {
    const html = fixture('bbc-article.html');
    const md = extractMarkdown(html, 'https://www.bbc.com/news/test');
    assert.ok(typeof md === 'string' && md.length > 200);
  });

  test('TC-E2: bbc fixture strips "Read more" trailing noise and nav text', () => {
    const html = fixture('bbc-article.html');
    const md = extractMarkdown(html, 'https://www.bbc.com/news/test');
    assert.ok(!/read more/i.test(md), 'should not contain "Read more"');
    // Nav link text should not appear verbatim in article body
    assert.ok(!md.includes('Home News Technology'), 'nav content should be stripped');
  });

  test('TC-E3: techcrunch fixture strips "Related" trailing noise', () => {
    const html = fixture('techcrunch-article.html');
    const md = extractMarkdown(html, 'https://techcrunch.com/test');
    assert.ok(!/related articles/i.test(md), 'should not contain "Related articles"');
    assert.ok(md.length > 200);
  });

  test('TC-E4: short-content fixture throws ExtractError', async () => {
    const html = fixture('short-content.html');
    await assert.rejects(
      async () => extractMarkdown(html, 'https://example.com/short'),
      (err: unknown) => {
        assert.ok(err instanceof ExtractError);
        assert.equal(err.name, 'ExtractError');
        return true;
      },
    );
  });

  test('TC-E5: empty body html throws ExtractError', async () => {
    await assert.rejects(
      async () => extractMarkdown('<html><body></body></html>', 'https://example.com/empty'),
      (err: unknown) => {
        assert.ok(err instanceof ExtractError);
        return true;
      },
    );
  });
});
