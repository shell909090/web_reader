import type { RawArgs } from './options.ts';
import type { CommonArgs } from './args.ts';
import type { ParsedArgs } from './types.ts';
import { KNOWN_SOURCES, parseSourceTokens, type SourceRequest } from './sources.ts';

function positiveInteger(value: unknown): boolean {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}

export function parseQueryArgs(raw: RawArgs, common: CommonArgs): ParsedArgs | null {
  const source = (raw.values.query as string).trim();
  if (!source) {
    process.stderr.write('[ERROR] -q requires a source name\n');
    return null;
  }
  if (!raw.positionals.length) {
    process.stderr.write('[ERROR] -q requires keywords\n');
    return null;
  }
  if (!positiveInteger(raw.values.limit)) {
    process.stderr.write('[ERROR] --limit must be a positive integer\n');
    return null;
  }
  return {
    mode: 'query',
    source,
    keywords: raw.positionals,
    limit: Number(raw.values.limit),
    ...common,
  };
}

function listSources(value: string): SourceRequest[] | null {
  if (value === 'all') return [...KNOWN_SOURCES].map((id) => ({ id, categories: [] }));
  const sources = parseSourceTokens(value);
  if (sources?.length === 0) {
    process.stderr.write('[ERROR] --sources cannot be empty\n');
    return null;
  }
  return sources;
}

export function parseListArgs(raw: RawArgs, common: CommonArgs): ParsedArgs | null {
  const sources = listSources(raw.values.sources as string);
  if (!sources) return null;
  for (const name of ['limit', 'concurrency']) {
    if (!positiveInteger(raw.values[name])) {
      process.stderr.write(
        `[ERROR] --${name} must be a positive integer, got: ${raw.values[name]}\n`,
      );
      return null;
    }
  }
  return {
    mode: 'list',
    sources,
    limit: Number(raw.values.limit),
    concurrency: Number(raw.values.concurrency),
    ...common,
  };
}
