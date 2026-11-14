import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';

import {
  SEARCH_IDS,
  providerSchema,
  schema,
  type ProviderConfig,
  type SearchConfig,
} from './config-schema.ts';
export { SEARCH_IDS, type ProviderConfig, type SearchConfig } from './config-schema.ts';
let active: SearchConfig | undefined;

function fileConfig(path: string, explicit: boolean): SearchConfig {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch (error) {
    if (!explicit && (error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    // File-system errors may contain a user-supplied path with secrets.
    // eslint-disable-next-line preserve-caught-error
    throw new Error('Cannot read search configuration file');
  }
  try {
    return schema.parse(parse(content)).providers ?? {};
  } catch {
    throw new Error('Invalid search configuration: check TOML, provider names and field types');
  }
}

function environmentProvider(id: string, env: NodeJS.ProcessEnv): ProviderConfig {
  const values: Record<string, unknown> = {};
  for (const field of ['api_key', 'app_id', 'base_url']) {
    const value = env[`${id}_${field}`.toUpperCase()];
    if (value !== undefined) values[field] = value;
  }
  const enabled = env[`${id}_ENABLED`.toUpperCase()];
  if (enabled !== undefined) {
    if (!['true', 'false'].includes(enabled))
      throw new Error(`${id.toUpperCase()}_ENABLED must be true or false`);
    values.enabled = enabled === 'true';
  }
  try {
    return providerSchema.parse(values);
  } catch {
    throw new Error(`Invalid environment configuration for ${id}`);
  }
}

/** Load optional TOML and overlay explicitly set environment fields. */
export function loadSearchConfig(
  path?: string,
  env: NodeJS.ProcessEnv = process.env,
): SearchConfig {
  const config = fileConfig(
    path ?? join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'web_reader', 'config.toml'),
    path !== undefined,
  );
  for (const id of SEARCH_IDS) config[id] = { ...config[id], ...environmentProvider(id, env) };
  return config;
}

/** Set process configuration shared by CLI and MCP. */
export function configureSearch(path?: string): void {
  active = loadSearchConfig(path);
}

/** Resolve one provider without requiring unrelated credentials. */
export function providerConfig(id: (typeof SEARCH_IDS)[number]): ProviderConfig {
  const config = (active ?? loadSearchConfig())[id] ?? {};
  if (config.enabled === false) throw new Error(`${id}: provider is disabled`);
  return config;
}

/** Require a credential only when its provider is called. */
export function credential(
  config: ProviderConfig,
  id: string,
  field: 'api_key' | 'app_id' = 'api_key',
): string {
  const value = config[field]?.trim();
  if (!value)
    throw new Error(
      `${id}: missing ${field}; set providers.${id}.${field} or ${id.toUpperCase()}_${field.toUpperCase()}`,
    );
  return value;
}
