import type { Ctx, SearchResult } from '../types.ts';
import { loadPlugin } from '../plugin-loader.ts';
import { mergeSearchResults } from './merge.ts';
export { mergeSearchResults } from './merge.ts';
import { pConcurrent } from '../concurrency.ts';
import { searchConfiguration, type SearchConfig } from './config.ts';
import { SearchFailure, SearchUnavailable } from './errors.ts';

export const WEB_SEARCH_IDS = [
  'brave',
  'duckduckgo',
  'tavily',
  'exa',
  'parallel',
  'firecrawl',
  'keenable',
  'searxng',
] as const;
type Provider = (typeof WEB_SEARCH_IDS)[number];
type Invoke = (id: Provider) => Promise<SearchResult[]>;

/** Select enabled general web providers using configuration only. */
export function searchCandidates(config: SearchConfig): Provider[] {
  return WEB_SEARCH_IDS.filter((id) => {
    const entry = config[id] ?? {};
    if (entry.enabled === false) return false;
    if (id === 'brave' || id === 'tavily') return Boolean(entry.api_key?.trim());
    if (id === 'searxng') return Boolean(entry.base_url);
    return true;
  });
}

/** Shuffle without replacement so a provider is never retried by the selector. */
export function shuffleProviders(ids: Provider[], random = Math.random): Provider[] {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function failure(id: string, error: unknown): string {
  // Do not propagate arbitrary adapter or upstream text into aggregate diagnostics.
  if (error instanceof SearchFailure) return error.message;
  return `${id}: search failed; access, configuration or response error`;
}

/** Run a selector with isolated provider failures and bounded concurrency. */
export async function selectSearch(
  mode: 'any' | 'all',
  ids: Provider[],
  invoke: Invoke,
  limit: number,
  warn: (message: string) => void,
  random = Math.random,
): Promise<SearchResult[]> {
  if (!ids.length) throw new Error('No eligible web search providers; check configuration');
  const failures: string[] = [];
  if (mode === 'any') {
    for (const id of shuffleProviders(ids, random)) {
      try {
        return (await invoke(id)).slice(0, limit);
      } catch (error) {
        const message = failure(id, error);
        if (!(error instanceof SearchUnavailable)) throw new Error(message, { cause: error });
        failures.push(message);
        warn(message);
      }
    }
  } else {
    const groups = new Map<Provider, SearchResult[]>();
    await pConcurrent(ids, 2, async (id) => {
      try {
        groups.set(id, await invoke(id));
      } catch (error) {
        const message = failure(id, error);
        failures.push(message);
        warn(message);
      }
    });
    if (groups.size)
      return mergeSearchResults(
        ids.map((id) => groups.get(id) ?? []),
        limit,
      );
  }
  throw new Error(`All web search providers failed: ${failures.join('; ')}`);
}

/** Search general web providers through the same adapters as explicit queries. */
export async function aggregateSearch(
  mode: 'any' | 'all',
  ctx: Ctx,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const ids = searchCandidates(searchConfiguration());
  return selectSearch(
    mode,
    ids,
    async (id) => {
      const plugin = await loadPlugin(id, ctx.log);
      if (!plugin?.search) throw new SearchUnavailable(`${id}: adapter unavailable`);
      return plugin.search(ctx, query, limit);
    },
    limit,
    (message) => ctx.log.warn(message),
  );
}

/** Recognize aggregate selectors independently of plugin capabilities. */
export function isSearchSelector(id: string): id is 'any' | 'all' {
  return id === 'any' || id === 'all';
}
