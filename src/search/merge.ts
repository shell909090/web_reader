import type { Item, SearchResult } from '../types.ts';
import { newsIdentity } from '../first-seen.ts';

/** Interleave rankings and retain every contributor before applying the final limit. */
export function mergeSearchResults(groups: SearchResult[][], limit: number): Item[] {
  const merged = new Map<string, Item>();
  const length = Math.max(0, ...groups.map((group) => group.length));
  for (let rank = 0; rank < length; rank++) {
    for (const group of groups) {
      const item = group[rank];
      if (!item?.url) continue;
      const key = newsIdentity(item.url);
      const contributor = { source: item.source, rank: item.rank ?? rank + 1 };
      const existing = merged.get(key);
      if (existing) {
        (existing.contributors as unknown[]).push(contributor);
      } else {
        merged.set(key, { ...item, contributors: [contributor] });
      }
    }
  }
  return [...merged.values()].slice(0, limit);
}
