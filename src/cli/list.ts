import { httpGet, type Ctx, type Logger } from '../../lib.ts';
import type { ParsedArgs } from './types.ts';
import { loadPlugin } from '../plugin-loader.ts';
import { writeOutput } from './io.ts';
import type { Item, Plugin } from '../../lib.ts';
import { pConcurrent } from '../concurrency.ts';
import { logError } from './io.ts';

export async function runList(
  args: Extract<ParsedArgs, { mode: 'list' }>,
  log: Logger,
): Promise<number> {
  type LoadedSource = { plugin: Plugin; categories: string[] };
  const loaded: LoadedSource[] = [];
  for (const req of args.sources) {
    const plugin = await loadPlugin(req.id, log);
    if (plugin) loaded.push({ plugin, categories: req.categories });
  }

  if (loaded.length === 0) {
    log.error('No plugins could be loaded; aborting.');
    return 3;
  }

  const allItems: Item[] = [];
  const errors: string[] = [];

  const ctx: Ctx = { mode: 'http', httpGet, log };
  await pConcurrent(loaded, args.concurrency, async ({ plugin, categories }) => {
    const label = categories.length ? `${plugin.id}:${categories.join('+')}` : plugin.id;
    try {
      const items = await plugin.list(ctx, { limit: args.limit, categories });
      allItems.push(...items);
    } catch (err) {
      errors.push(label);
      logError({ source: label, stage: 'list', err });
    }
  });

  const json = JSON.stringify(allItems, null, 2) + '\n';
  await writeOutput(args.out, json);

  if (errors.length > 0) log.warn(`Failed sources: ${errors.join(', ')}`);
  if (errors.length === loaded.length) {
    log.error('All sources failed.');
    return 3;
  }
  return 0;
}
