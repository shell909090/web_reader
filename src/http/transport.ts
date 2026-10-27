import undici, { Agent, type RequestInit, type Response } from 'undici';
import { CONFIG } from '../config.ts';
import type { HttpResponse } from '../types.ts';

const MAX_REDIRECTS = 5;
const httpDispatcher = new Agent({ maxHeaderSize: CONFIG.HTTP_MAX_HEADER_SIZE });

/** Extract charset from Content-Type header value, fallback to 'utf-8'. */
function parseCharset(contentType: string | null): string {
  if (!contentType) return 'utf-8';
  const match = contentType.match(/charset=([^\s;]+)/i);
  if (!match) return 'utf-8';
  const cs = match[1].toLowerCase().replace(/^["']|["']$/g, '');
  // Normalize CJK legacy encodings to 'gbk' which TextDecoder supports
  if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb18030') return 'gbk';
  return cs;
}

/** Perform a single fetch attempt with redirect tracking and GBK-aware decoding. */
export async function fetchOnce(
  url: string,
  mergedHeaders: Record<string, string>,
  timeoutMs: number,
): Promise<HttpResponse> {
  let currentUrl = url;
  let redirectsLeft = MAX_REDIRECTS;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      const requestOptions: RequestInit & { dispatcher: Agent } = {
        dispatcher: httpDispatcher,
        headers: mergedHeaders,
        redirect: 'manual',
        signal: controller.signal,
      };
      response = await undici.fetch(currentUrl, requestOptions);
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;

    // Manual redirect handling
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        // No location header; treat as final response with empty body
        return { status, html: '', finalUrl: currentUrl };
      }
      if (redirectsLeft === 0) {
        throw new Error(`Too many redirects (>${MAX_REDIRECTS}) starting from ${url}`);
      }
      redirectsLeft--;
      // Resolve relative redirects against current URL
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    const charset = parseCharset(response.headers.get('content-type'));
    const buffer = await response.arrayBuffer();
    const html = new TextDecoder(charset).decode(buffer);

    return { status, html, finalUrl: currentUrl };
  }
}
