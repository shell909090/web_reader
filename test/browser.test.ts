import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withBrowser } from '../lib.ts';
import type { Plugin } from '../lib.ts';

// ---------------------------------------------------------------------------
// Lightweight mock objects for Playwright Browser / BrowserContext / Page.
// We never import Playwright itself; these mocks satisfy the shape that
// withBrowser expects through its `launcher` injection seam.
// ---------------------------------------------------------------------------

function makeMockPage() {
  return {
    setContent: async (_html: string): Promise<void> => {},
    content: async (): Promise<string> => '<html>mock</html>',
  };
}

function makeMockContext(page: ReturnType<typeof makeMockPage>) {
  let closed = false;
  return {
    newPage: async () => page,
    close: async (): Promise<void> => {
      closed = true;
    },
    get wasClosed(): boolean {
      return closed;
    },
  };
}

function makeMockBrowser(ctx: ReturnType<typeof makeMockContext>) {
  let closed = false;
  return {
    // newContext ignores chromium launch options; we just return the shared ctx
    newContext: async (_opts?: unknown) => ctx,
    close: async (): Promise<void> => {
      closed = true;
    },
    get wasClosed(): boolean {
      return closed;
    },
  };
}

function makeMockLauncher(browser: ReturnType<typeof makeMockBrowser>) {
  let launchCount = 0;
  return {
    launch: async (_opts?: unknown) => {
      launchCount++;
      return browser;
    },
    get launchCount(): number {
      return launchCount;
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: build a minimal Plugin stub.
// ---------------------------------------------------------------------------
function makePlugin(id: string, needsBrowser: boolean): Plugin {
  return {
    id,
    needsBrowser,
    list: async () => [],
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('withBrowser', () => {
  // -------------------------------------------------------------------------
  // TC-B1: All plugins are HTTP-only (needsBrowser=false).
  //        launcher.launch must NOT be called; fn return value is forwarded.
  // -------------------------------------------------------------------------
  test('TC-B1: HTTP-only plugins do not invoke launcher.launch and forward return value', async () => {
    const page = makeMockPage();
    const ctx = makeMockContext(page);
    const browser = makeMockBrowser(ctx);
    const launcher = makeMockLauncher(browser);

    const plugins: Plugin[] = [makePlugin('rss-a', false), makePlugin('rss-b', false)];

    // Cast through unknown to satisfy the private ChromiumLauncher type that
    // withBrowser expects; our mock matches the structural shape it needs.
    const result = await withBrowser(
      plugins,
      async (_getPage) => 'expected-value',
      launcher as unknown as Parameters<typeof withBrowser>[2],
    );

    assert.equal(launcher.launchCount, 0, 'launch must not be called when no plugin needs browser');
    assert.equal(result, 'expected-value');
  });

  // -------------------------------------------------------------------------
  // TC-B2: One plugin has needsBrowser=true.
  //        launcher.launch called once; getPage returns a Page object.
  // -------------------------------------------------------------------------
  test('TC-B2: browser plugin causes launch to be called once and getPage returns page', async () => {
    const page = makeMockPage();
    const ctx = makeMockContext(page);
    const browser = makeMockBrowser(ctx);
    const launcher = makeMockLauncher(browser);

    const plugins: Plugin[] = [makePlugin('scraper-x', true)];

    let capturedPage: unknown;

    await withBrowser(
      plugins,
      async (getPage) => {
        capturedPage = await getPage('scraper-x');
      },
      launcher as unknown as Parameters<typeof withBrowser>[2],
    );

    assert.equal(launcher.launchCount, 1, 'launch must be called exactly once');
    // The page returned by getPage should be the mock page (same structural shape).
    // We use a duck-type check since the real Page type is Playwright's.
    assert.ok(
      capturedPage !== null && capturedPage !== undefined,
      'getPage should resolve to a Page object',
    );
    assert.equal(
      typeof (capturedPage as { content?: unknown }).content,
      'function',
      'returned page should have a content() method',
    );
  });

  // -------------------------------------------------------------------------
  // TC-B3: fn throws an Error.
  //        browser.close() and context.close() must still be called;
  //        withBrowser re-throws the original error.
  // -------------------------------------------------------------------------
  test('TC-B3: exception inside fn still closes browser and context, then re-throws', async () => {
    const page = makeMockPage();
    const ctx = makeMockContext(page);
    const browser = makeMockBrowser(ctx);
    const launcher = makeMockLauncher(browser);

    const plugins: Plugin[] = [makePlugin('scraper-y', true)];
    const boom = new Error('intentional test error');

    await assert.rejects(
      () =>
        withBrowser(
          plugins,
          async (_getPage) => {
            throw boom;
          },
          launcher as unknown as Parameters<typeof withBrowser>[2],
        ),
      (err: unknown) => {
        // Must re-throw the exact same error instance
        assert.strictEqual(err, boom);
        return true;
      },
    );

    assert.ok(ctx.wasClosed, 'context.close() must be called even after fn throws');
    assert.ok(browser.wasClosed, 'browser.close() must be called even after fn throws');
  });

  // -------------------------------------------------------------------------
  // TC-B4: withBrowser correctly forwards fn's return value (numeric).
  // -------------------------------------------------------------------------
  test('TC-B4: withBrowser returns the value produced by fn', async () => {
    const page = makeMockPage();
    const ctx = makeMockContext(page);
    const browser = makeMockBrowser(ctx);
    const launcher = makeMockLauncher(browser);

    const plugins: Plugin[] = [makePlugin('scraper-z', true)];

    const result = await withBrowser(
      plugins,
      async (_getPage) => 42,
      launcher as unknown as Parameters<typeof withBrowser>[2],
    );

    assert.equal(result, 42);
  });
});
