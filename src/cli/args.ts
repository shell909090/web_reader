import { PROFILE_NAMES, type LogLevel, type ProfileName } from '../../lib.ts';
import { parseOptions, type RawArgs } from './options.ts';
import { parseListArgs, parseQueryArgs } from './mode-args.ts';
import type { ParsedArgs } from './types.ts';

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
export type CommonArgs = {
  config?: string;
  out: string | null;
  loglevel: LogLevel;
  profile: ProfileName;
};

function commonArgs(v: RawArgs['values']): CommonArgs | null {
  const loglevel = (v.loglevel as string).toLowerCase() as LogLevel;
  if (!LOG_LEVELS.includes(loglevel)) {
    process.stderr.write(
      `[ERROR] --loglevel must be one of ${LOG_LEVELS.join('|')}, got: ${loglevel}\n`,
    );
    return null;
  }
  const profile = (v.profile as string).toLowerCase() as ProfileName;
  if (!PROFILE_NAMES.includes(profile)) {
    process.stderr.write(
      `[ERROR] --profile must be one of ${PROFILE_NAMES.join('|')}, got: ${profile}\n`,
    );
    return null;
  }
  return {
    ...(v.config !== undefined ? { config: String(v.config) } : {}),
    loglevel,
    profile,
    out: v.out !== undefined ? (v.out as string) : null,
  };
}

/** Parse and validate CLI arguments without changing mode precedence. */
export function parseCLI(argv: string[]): ParsedArgs | null {
  const raw = parseOptions(argv);
  if (!raw || raw.values.help) return null;
  const common = commonArgs(raw.values);
  if (!common) return null;
  if (raw.values.query !== undefined) return parseQueryArgs(raw, common);
  if (raw.values.sources) return parseListArgs(raw, common);
  if (raw.values['only-main-content'] && raw.values['no-only-main-content']) {
    process.stderr.write('[ERROR] Content switches are mutually exclusive\n');
    return null;
  }
  const contentMode = raw.values['content-mode'];
  if (
    contentMode !== undefined &&
    (!['auto', 'article', 'full'].includes(String(contentMode)) ||
      raw.values['only-main-content'] ||
      raw.values['no-only-main-content'])
  ) {
    process.stderr.write(
      '[ERROR] --content-mode requires auto|article|full and cannot be combined with content switches\n',
    );
    return null;
  }
  const onlyMainContent = raw.values['no-only-main-content']
    ? false
    : raw.values['only-main-content']
      ? true
      : undefined;
  return {
    mode: 'detail',
    ...(contentMode === undefined
      ? {}
      : { contentMode: contentMode as 'auto' | 'article' | 'full' }),
    urls: raw.positionals,
    ...common,
    ...(onlyMainContent === undefined ? {} : { onlyMainContent }),
  };
}
