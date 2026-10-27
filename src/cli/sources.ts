export const KNOWN_SOURCES = [
  'hn',
  'bbc',
  'techcrunch',
  'sina',
  'ars',
  'theverge',
  'infoq',
  'people',
  'csdn',
  'wiki',
  'zhwiki',
  'reddit',
  'caixin',
  'thepaper',
  'xinhua',
  'mittr',
  'yahoo',
  'cnbc',
  'nytimes',
  'hf',
  'oschina',
  'juejin',
  'gnews',
  'bsky',
  'polymarket',
] as const;

/** Named source presets — expanded before plugin loading. */
const SETS: Record<string, string[]> = {
  news: ['bbc', 'nytimes', 'xinhua', 'thepaper'],
  tech: ['hn', 'ars', 'mittr', 'infoq'],
  fin: ['caixin', 'yahoo', 'cnbc:markets'],
};
/** One entry per unique source ID with all requested categories merged. */
export type SourceRequest = { id: string; categories: string[] };
/** Parse "id", "id:category", or set name tokens, grouping categories per source ID. */
export function parseSourceTokens(input: string): SourceRequest[] | null {
  const tokens = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap(expandSource);

  const grouped = new Map<string, string[]>();
  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    const id = colon >= 0 ? tok.slice(0, colon) : tok;
    const cat = colon >= 0 ? tok.slice(colon + 1) : '';
    if (!(KNOWN_SOURCES as readonly string[]).includes(id)) {
      process.stderr.write(`[ERROR] Unknown source: ${id}\n`);
      return null;
    }
    if (!grouped.has(id)) grouped.set(id, []);
    if (cat) grouped.get(id)!.push(cat);
  }
  return [...grouped.entries()].map(([id, categories]) => ({ id, categories }));
}

function expandSource(token: string): string[] {
  if (SETS[token] && !token.includes(':')) return SETS[token];
  return [token];
}
