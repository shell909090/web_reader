import type { Logger } from './types.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Create a logger that writes to stderr; messages below `level` are suppressed. */
export function makeLogger(level: LogLevel): Logger {
  const minRank = LOG_RANK[level];
  const write = (prefix: string, rank: number, msg: string, meta?: unknown) => {
    if (rank < minRank) return;
    const line =
      meta !== undefined ? `${prefix} ${msg} ${JSON.stringify(meta)}` : `${prefix} ${msg}`;
    process.stderr.write(line + '\n');
  };
  return {
    debug: (msg, meta) => write('[DEBUG]', 0, msg, meta),
    info: (msg, meta) => write('[INFO]', 1, msg, meta),
    warn: (msg, meta) => write('[WARN]', 2, msg, meta),
    error: (msg, meta) => write('[ERROR]', 3, msg, meta),
  };
}
