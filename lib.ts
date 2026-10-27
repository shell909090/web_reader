// Public facade retained for plugins and external integrations.
export { CONFIG } from './src/config.ts';
export * from './src/types.ts';
export * from './src/http/profiles.ts';
export { httpGet } from './src/http/client.ts';
export { ExtractError, extractMarkdown } from './src/extract.ts';
export { makeLogger, type LogLevel } from './src/logger.ts';
export { writeListJson, writeArticleMd } from './src/output.ts';
