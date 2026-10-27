import { parseArgs } from 'node:util';
import { CONFIG } from '../../lib.ts';

export type RawArgs = {
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
};
export function parseOptions(argv: string[]): RawArgs | null {
  try {
    return parseArgs({
      args: argv,
      options: {
        sources: { type: 'string', short: 's' },
        query: { type: 'string', short: 'q' },
        limit: { type: 'string', short: 'n', default: String(CONFIG.DEFAULT_LIMIT) },
        out: { type: 'string', short: 'o' },
        concurrency: { type: 'string', short: 'c', default: String(CONFIG.DEFAULT_CONCURRENCY) },
        loglevel: { type: 'string', short: 'l', default: 'warn' },
        profile: { type: 'string', short: 'p', default: 'default' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    process.stderr.write(`[ERROR] ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }
}
