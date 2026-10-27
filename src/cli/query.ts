import { httpGet, type Ctx, type Logger } from '../../lib.ts';
import type { ParsedArgs } from './types.ts';
import { loadPlugin } from '../plugin-loader.ts';
import { writeOutput } from './io.ts';

export async function runQuery(
  args: Extract<ParsedArgs, { mode: 'query' }>,
  log: Logger,
): Promise<number> {
  const plugin = await loadPlugin(args.source, log);
  if (!plugin) {
    log.error(`Unknown or unavailable query source: ${args.source}`);
    return 2;
  }
  if (!plugin.search) {
    log.error(
      `Source "${args.source}" does not support search. Searchable: wiki, zhwiki, reddit, gnews, bsky`,
    );
    return 2;
  }
  const query = args.keywords.join(' ');
  log.debug(`Querying ${args.source}: "${query}"`);
  const ctx: Ctx = { mode: 'http', httpGet, log };
  const items = await plugin.search(ctx, query, args.limit);
  const json = JSON.stringify(items, null, 2) + '\n';
  await writeOutput(args.out, json);
  return 0;
}
