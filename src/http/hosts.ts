import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import type { LookupAddress } from 'node:dns';

/** Find exact, case-insensitive aliases in a hosts file without consulting NSS. */
export function parseHosts(text: string, hostname: string): LookupAddress[] {
  const result: LookupAddress[] = [];
  for (const line of text.split('\n')) {
    const [address, ...aliases] = line.split('#')[0].trim().split(/\s+/);
    const family = isIP(address);
    if (family && aliases.some((alias) => alias.toLowerCase() === hostname.toLowerCase())) {
      if (!result.some((entry) => entry.address === address)) result.push({ address, family });
    }
  }
  return result;
}

/** Read local host overrides on each request so changes take effect without a restart. */
export async function localAddresses(hostname: string): Promise<LookupAddress[]> {
  const path =
    process.platform === 'win32'
      ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
      : '/etc/hosts';
  try {
    return parseHosts(await readFile(path, 'utf8'), hostname);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
