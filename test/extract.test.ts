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

  test('TC-E4: short-content fixture throws ExtractError', () => {
    const html = fixture('short-content.html');
    assert.throws(
      () => extractMarkdown(html, 'https://example.com/short', 'article'),
      (err: unknown) => {
        assert.ok(err instanceof ExtractError);
        assert.equal(err.name, 'ExtractError');
        return true;
      },
    );
  });

  test('TC-E5: empty body html throws ExtractError', () => {
    assert.throws(
      () => extractMarkdown('<html><body></body></html>', 'https://example.com/empty'),
      (err: unknown) => {
        assert.ok(err instanceof ExtractError);
        return true;
      },
    );
  });
});

test('Full-page mode preserves navigation, linked entries and content after Related', () => {
  const html =
    '<body><nav><a href="/home">Home</a></nav><main><h1>Updates</h1><a href="/model">Model evaluation</a><h2>Related</h2><p>Still useful</p></main><footer>Footer</footer><script>SECRET_SCRIPT</script></body>';
  const md = extractMarkdown(html, 'https://example.com/updates', false);
  for (const text of [
    '[Home](https://example.com/home)',
    '[Model evaluation](https://example.com/model)',
    'Related',
    'Still useful',
    'Footer',
  ])
    assert.ok(md.includes(text));
  assert.ok(!md.includes('SECRET_SCRIPT'));
});

test('Full-page mode rejects an empty page', () => {
  assert.throws(() => extractMarkdown('<body></body>', 'https://example.com', false), ExtractError);
});

test('Auto mode preserves linked changelog entries and excludes page chrome', () => {
  const entries = Array.from(
    { length: 12 },
    (_, i) =>
      `<div><h3>Update ${i}</h3><a href="/models/${i}">Model ${i} evaluation results available</a><p>Provider performance results now available</p></div>`,
  ).join('');
  const html = `<body><nav>Navigation noise</nav><main><h1>Changelog</h1>${entries}</main><footer>Footer noise</footer></body>`;
  const messages: string[] = [];
  const md = extractMarkdown(html, 'https://example.com', 'auto', (message) =>
    messages.push(message),
  );
  for (let i = 0; i < 12; i++) assert.ok(md.includes(`Model ${i} evaluation results available`));
  assert.ok(!md.includes('Navigation noise'));
  assert.ok(!md.includes('Footer noise'));
  assert.ok(messages.length > 0);
});

test('Auto mode accepts a short useful main region and rejects empty pages', () => {
  const md = extractMarkdown(
    '<main><h1>Status</h1><p>All systems operational.</p></main>',
    'https://example.com',
    'auto',
  );
  assert.ok(md.includes('All systems operational.'));
  assert.throws(
    () => extractMarkdown('<body></body>', 'https://example.com', 'auto'),
    ExtractError,
  );
});
