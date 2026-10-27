import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);

export class ExtractError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ExtractError';
  }
}

// Module-level TurndownService instance (cheaper than per-call construction).
const _td = (() => {
  const TurndownService = _require('turndown') as typeof import('turndown');
  const instance = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  return instance;
})();

const TRAILING_NOISE_RE =
  /\n(?:#+\s*)?(?:Read (?:more|also|next)|Related(?: articles?| reading)?|更多阅读|相关阅读|推荐阅读|延伸阅读|推荐文章)[\s\S]*/i;
const MULTI_BLANK_RE = /\n{3,}/g;

/** Extract the main article body from raw HTML and return it as Markdown. */
export function extractMarkdown(html: string, url: string): string {
  // Dynamic require to avoid circular ESM/CJS issues with jsdom and readability
  const { JSDOM, VirtualConsole } = _require('jsdom') as typeof import('jsdom');
  const { Readability } = _require('@mozilla/readability') as typeof import('@mozilla/readability');

  // Suppress CSS/resource parse errors (common with complex modern sites like Reddit)
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => undefined);

  const dom = new JSDOM(html, { url, virtualConsole: vc });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article?.content) {
    throw new ExtractError(`Readability found no article content at ${url}`);
  }

  let md = _td.turndown(article.content);
  md = md.replace(TRAILING_NOISE_RE, '');
  md = md.replace(MULTI_BLANK_RE, '\n\n');
  md = md.trim();

  if (md.length < 200) {
    throw new ExtractError(`Extracted content too short (${md.length} chars) at ${url}`);
  }

  return md;
}
