import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { httpGet } from '../lib.ts';

// Helper: build a minimal Response-like object that satisfies the fetch API
function makeResponse(
  status: number,
  body: BodyInit,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

// Helper: build a redirect Response (3xx). fetch with redirect:'manual' returns
// an opaque redirect response; we simulate it with a real Response that has the
// correct status and Location header.
function makeRedirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('httpGet', () => {
  // -------------------------------------------------------------------------
  // TC-1: 200 normal response
  // -------------------------------------------------------------------------
  test('TC-1: 200 normal response returns status, html, and finalUrl', async () => {
    const targetUrl = 'https://example.com/page';
    const bodyHtml = '<html><body>Hello</body></html>';

    globalThis.fetch = async (_input: RequestInfo | URL) => {
      return makeResponse(200, bodyHtml, { 'content-type': 'text/html; charset=utf-8' });
    };

    const result = await httpGet(targetUrl);

    assert.equal(result.status, 200);
    assert.ok(result.html.length > 0, 'html should be non-empty');
    assert.equal(result.finalUrl, targetUrl);
    assert.ok(result.html.includes('Hello'));
  });

  // -------------------------------------------------------------------------
  // TC-2: 3xx redirect followed automatically; finalUrl is the landing URL
  // -------------------------------------------------------------------------
  test('TC-2: 3xx redirect is followed and finalUrl reflects the final URL', async () => {
    const firstUrl = 'https://example.com/old';
    const finalUrl = 'https://example.com/new';
    let callCount = 0;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      callCount++;
      const url = input.toString();
      if (url === firstUrl) {
        return makeRedirect(301, finalUrl);
      }
      // second call: the redirected URL
      return makeResponse(200, '<html>new page</html>', {
        'content-type': 'text/html; charset=utf-8',
      });
    };

    const result = await httpGet(firstUrl);

    assert.equal(result.status, 200);
    assert.equal(result.finalUrl, finalUrl);
    assert.equal(callCount, 2);
  });

  // -------------------------------------------------------------------------
  // TC-3: Too many redirects (>5) throws an Error
  // -------------------------------------------------------------------------
  test('TC-3: more than 5 redirects throws an Error', async () => {
    let n = 0;
    globalThis.fetch = async (_input: RequestInfo | URL) => {
      n++;
      return makeRedirect(301, `https://example.com/loop${n}`);
    };

    await assert.rejects(
      () => httpGet('https://example.com/start'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('redirects'));
        return true;
      },
    );
  });

  // -------------------------------------------------------------------------
  // TC-4: 4xx is returned without retry
  // -------------------------------------------------------------------------
  test('TC-4: 4xx response is returned immediately with no retry', async () => {
    let callCount = 0;

    globalThis.fetch = async (_input: RequestInfo | URL) => {
      callCount++;
      return makeResponse(404, '<html>Not Found</html>', {
        'content-type': 'text/html; charset=utf-8',
      });
    };

    const result = await httpGet('https://example.com/missing');

    assert.equal(result.status, 404);
    assert.equal(callCount, 1, 'fetch should be called exactly once for 4xx');
  });

  // -------------------------------------------------------------------------
  // TC-5: 5xx triggers one retry; if second call succeeds, return its result
  // -------------------------------------------------------------------------
  test(
    'TC-5: 5xx on first attempt retries once and returns success on second',
    { timeout: 5000 },
    async () => {
      let callCount = 0;

      globalThis.fetch = async (_input: RequestInfo | URL) => {
        callCount++;
        if (callCount === 1) {
          return makeResponse(500, 'Server Error', { 'content-type': 'text/plain' });
        }
        return makeResponse(200, '<html>OK</html>', {
          'content-type': 'text/html; charset=utf-8',
        });
      };

      const result = await httpGet('https://example.com/', { timeoutMs: 30_000 });

      assert.equal(result.status, 200);
      assert.equal(callCount, 2, 'fetch should be called exactly twice (initial + 1 retry)');
    },
  );

  // -------------------------------------------------------------------------
  // TC-6: 5xx on both attempts; the second 5xx result is returned
  // -------------------------------------------------------------------------
  test('TC-6: 5xx on both attempts returns the last 5xx result', { timeout: 5000 }, async () => {
    let callCount = 0;

    globalThis.fetch = async (_input: RequestInfo | URL) => {
      callCount++;
      return makeResponse(503, 'Service Unavailable', { 'content-type': 'text/plain' });
    };

    const result = await httpGet('https://example.com/', { timeoutMs: 30_000 });

    assert.equal(result.status, 503);
    assert.equal(callCount, 2);
  });

  // -------------------------------------------------------------------------
  // TC-7: Timeout (AbortError) on first attempt triggers one retry
  // -------------------------------------------------------------------------
  test('TC-7: timeout on first attempt triggers one retry', { timeout: 5000 }, async () => {
    let callCount = 0;

    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // Simulate the request hanging until aborted by the AbortController
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            if (signal.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
      }
      // Second attempt succeeds immediately
      return makeResponse(200, '<html>OK after timeout</html>', {
        'content-type': 'text/html; charset=utf-8',
      });
    };

    // Use a very short timeout so the test finishes quickly
    const result = await httpGet('https://example.com/', { timeoutMs: 50 });

    assert.equal(result.status, 200);
    assert.equal(callCount, 2, 'fetch should be called twice (timeout + retry)');
  });

  // -------------------------------------------------------------------------
  // TC-8: Timeout on both attempts re-throws
  // -------------------------------------------------------------------------
  test('TC-8: timeout on both attempts propagates an error', { timeout: 5000 }, async () => {
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal) {
          if (signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }
      });
    };

    await assert.rejects(() => httpGet('https://example.com/', { timeoutMs: 50 }));
  });

  // -------------------------------------------------------------------------
  // TC-9: gb2312 / GBK charset is decoded correctly
  // -------------------------------------------------------------------------
  test('TC-9: gb2312 charset in Content-Type causes GBK decoding of response body', async () => {
    // "你好" in GB2312/GBK: 0xC4E3 0xBAC3
    const gb2312Bytes = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]);

    globalThis.fetch = async (_input: RequestInfo | URL) => {
      return new Response(gb2312Bytes.buffer, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=gb2312' },
      });
    };

    const result = await httpGet('https://example.com/cn');

    assert.equal(result.status, 200);
    assert.ok(result.html.includes('你好'), `html should contain "你好" but got: ${result.html}`);
  });

  // -------------------------------------------------------------------------
  // TC-10: Custom headers are forwarded in the request
  // -------------------------------------------------------------------------
  test('TC-10: custom headers supplied in opts are merged into the request', async () => {
    let capturedHeaders: Headers | undefined;

    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return makeResponse(200, '<html/>', { 'content-type': 'text/html' });
    };

    await httpGet('https://example.com/', { headers: { 'X-Custom': 'test-value' } });

    assert.ok(capturedHeaders !== undefined);
    assert.equal(capturedHeaders.get('X-Custom'), 'test-value');
  });
});
