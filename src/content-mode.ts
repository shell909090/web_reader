import { searchConfiguration } from './search/config.ts';

export type ContentMode = 'auto' | 'article' | 'full';

/** Resolve explicit modes and legacy booleans before configuration defaults. */
export function contentMode(value?: ContentMode | boolean): ContentMode {
  if (typeof value === 'boolean') return value ? 'article' : 'full';
  if (value) return value;
  const config = searchConfiguration().reader;
  return (
    config?.mode ??
    (config?.only_main_content === undefined
      ? 'auto'
      : config.only_main_content
        ? 'article'
        : 'full')
  );
}

/** Explain whether article extraction lost substantial main-region content. */
export function fallbackReason(region: Element, article: Element): string | undefined {
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  const remaining = normalize(article.textContent ?? '');
  const links = [...region.querySelectorAll('a')]
    .map((node) => normalize(node.textContent ?? ''))
    .filter((value) => value.length >= 8);
  const missing = links.filter((value) => !remaining.includes(value));
  if (links.length >= 5 && missing.length / links.length > 0.5)
    return 'most meaningful linked entries were removed';
  const blocks = [...region.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')]
    .map((node) => normalize(node.textContent ?? ''))
    .filter((value) => value.length >= 20);
  const lost = blocks.filter((value) => !remaining.includes(value));
  if (blocks.length >= 4 && lost.length / blocks.length > 0.6)
    return 'most main-region text blocks were removed';
  return undefined;
}
