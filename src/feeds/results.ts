import type { Item, Logger } from '../types.ts';

/** Keep first-seen URLs from successful feeds, reporting each failed feed. */
export function collectFeedResults(
  results: PromiseSettledResult<Item[]>[],
  log: Logger,
  label: string,
): Item[] {
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const result of results) {
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      log.warn(`${label}: ${reason}`);
      continue;
    }
    for (const item of result.value) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
    }
  }
  return items;
}
