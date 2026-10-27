import type { LogLevel, ProfileName } from '../../lib.ts';
import type { SourceRequest } from './sources.ts';

export type ParsedArgs =
  | {
      mode: 'list';
      sources: SourceRequest[];
      limit: number;
      concurrency: number;
      out: string | null;
      loglevel: LogLevel;
      profile: ProfileName;
    }
  | { mode: 'detail'; urls: string[]; out: string | null; loglevel: LogLevel; profile: ProfileName }
  | {
      mode: 'query';
      source: string;
      keywords: string[];
      limit: number;
      out: string | null;
      loglevel: LogLevel;
      profile: ProfileName;
    };
