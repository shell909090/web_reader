import { Resolver } from 'node:dns/promises';
import dns from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { localAddresses } from './hosts.ts';

/** Query both address families without using the uncancellable system resolver. */
async function queryAddresses(
  hostname: string,
  family: number,
  signal: AbortSignal,
): Promise<LookupAddress[]> {
  const resolver = new Resolver({ timeout: 2000, tries: 2 });
  resolver.setServers(dns.getServers());
  const cancel = (): void => resolver.cancel();
  signal.throwIfAborted();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const queries: Promise<LookupAddress[]>[] = [];
    if (family !== 6)
      queries.push(
        resolver.resolve4(hostname).then((ips) => ips.map((address) => ({ address, family: 4 }))),
      );
    if (family !== 4)
      queries.push(
        resolver.resolve6(hostname).then((ips) => ips.map((address) => ({ address, family: 6 }))),
      );
    const results = await Promise.allSettled(queries);
    signal.throwIfAborted();
    const addresses = results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    );
    if (addresses.length) return addresses;
    const failure = results.find((result) => result.status === 'rejected');
    throw failure && failure.status === 'rejected'
      ? failure.reason
      : new Error(`No addresses for ${hostname}`);
  } finally {
    signal.removeEventListener('abort', cancel);
    resolver.cancel();
  }
}

/** Honor literals and hosts overrides before querying DNS, with IPv4 first by default. */
async function resolveHost(
  hostname: string,
  options: LookupOptions,
  signal: AbortSignal,
): Promise<LookupAddress[]> {
  signal.throwIfAborted();
  const literal = isIP(hostname);
  const local = literal ? [{ address: hostname, family: literal }] : await localAddresses(hostname);
  signal.throwIfAborted();
  const family = Number(options.family) || 0;
  const addresses = local.length
    ? local.filter((entry) => !family || entry.family === family)
    : await queryAddresses(hostname, family, signal);
  if (!addresses.length)
    throw Object.assign(new Error(`No matching address for ${hostname}`), { code: 'ENOTFOUND' });
  if (options.order === 'ipv6first') addresses.sort((a, b) => b.family - a.family);
  return addresses;
}

/** Bind an asynchronous, cancellable resolver to one HTTP request. */
export function requestLookup(signal: AbortSignal): LookupFunction {
  return (hostname, options, callback) => {
    resolveHost(hostname, options, signal).then(
      (addresses) =>
        options.all
          ? callback(null, addresses)
          : callback(null, addresses[0].address, addresses[0].family),
      (error: NodeJS.ErrnoException) => callback(error, ''),
    );
  };
}
