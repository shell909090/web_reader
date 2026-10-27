import { CONFIG } from '../config.ts';
import { PROFILES, getActiveProfile } from './profiles.ts';
import { fetchOnce } from './transport.ts';
import type { HttpGetOpts, HttpResponse } from '../types.ts';

/** Build default request headers from the currently active profile. */
function buildDefaultHeaders(): Record<string, string> {
  const profile = PROFILES[getActiveProfile()];
  return {
    'User-Agent': profile.ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    ...profile.headers,
  };
}
/** Sleep for a randomised back-off before a retry (base + up to 500ms jitter). */
function sleep(baseMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, baseMs + Math.random() * 500));
}

// Only retry on transient network failures; logic errors (e.g. redirect loops) should propagate.
function isRetriableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof TypeError) return true; // undici/node fetch throws TypeError for network failures
  return false;
}

/** Fetch a URL with automatic GBK decoding, redirect following, and 5xx/network retry. */
export async function httpGet(url: string, opts?: HttpGetOpts): Promise<HttpResponse> {
  const timeoutMs = opts?.timeoutMs ?? CONFIG.HTTP_TIMEOUT_MS;
  const mergedHeaders: Record<string, string> = { ...buildDefaultHeaders(), ...opts?.headers };

  const attempt = async (): Promise<HttpResponse> => fetchOnce(url, mergedHeaders, timeoutMs);

  let result: HttpResponse;
  try {
    result = await attempt();
  } catch (err) {
    if (!isRetriableError(err)) throw err;
    await sleep(1000);
    result = await attempt();
    return result;
  }

  // 5xx: retry once
  if (result.status >= 500) {
    await sleep(1000);
    try {
      result = await attempt();
    } catch (err) {
      if (!isRetriableError(err)) throw err;
      throw new Error(`Network error on retry for ${url}`, { cause: err });
    }
  }

  return result;
}
