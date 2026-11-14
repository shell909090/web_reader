import { EnvHttpProxyAgent } from 'undici';
import { CONFIG } from '../config.ts';
import { requestLookup } from './dns.ts';

/** Create an isolated dispatcher using standard proxy environment variables. */
export function requestDispatcher(signal: AbortSignal): EnvHttpProxyAgent {
  const lookup = requestLookup(signal);
  try {
    return new EnvHttpProxyAgent({
      maxHeaderSize: CONFIG.HTTP_MAX_HEADER_SIZE,
      connect: { lookup },
      proxyTls: { lookup },
      requestTls: { lookup },
    });
  } catch {
    // Constructor errors can contain proxy URLs, including authentication data.
    throw new Error('Invalid HTTP proxy configuration');
  }
}
