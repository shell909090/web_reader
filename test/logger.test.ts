import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeLogger } from '../lib.ts';

function captureStderr(fn: () => void): string {
  const lines: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  // Override stderr.write to capture output
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = (chunk: string) => {
    lines.push(chunk);
    return true;
  };
  try {
    fn();
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stderr as any).write = orig;
  }
  return lines.join('');
}

describe('makeLogger', () => {
  test('TC-L1: info level outputs [INFO] to stderr', () => {
    const log = makeLogger('info');
    const out = captureStderr(() => log.info('hello'));
    assert.ok(out.includes('[INFO]'));
    assert.ok(out.includes('hello'));
  });

  test('TC-L2: debug suppressed at info level', () => {
    const log = makeLogger('info');
    const out = captureStderr(() => log.debug('secret'));
    assert.equal(out, '', 'debug should produce no output at info level');
  });

  test('TC-L3: debug visible at debug level', () => {
    const log = makeLogger('debug');
    const out = captureStderr(() => log.debug('verbose'));
    assert.ok(out.includes('[DEBUG]'));
    assert.ok(out.includes('verbose'));
  });

  test('TC-L4: warn and error always output at info level', () => {
    const log = makeLogger('info');
    const out = captureStderr(() => {
      log.warn('caution');
      log.error('problem');
    });
    assert.ok(out.includes('[WARN]') && out.includes('caution'));
    assert.ok(out.includes('[ERROR]') && out.includes('problem'));
  });

  test('TC-L5: meta object is JSON-serialised in output', () => {
    const log = makeLogger('info');
    const out = captureStderr(() => log.info('msg', { key: 'val' }));
    assert.ok(out.includes('"key"'));
    assert.ok(out.includes('"val"'));
  });

  test('TC-L6: warn level suppresses info and debug', () => {
    const log = makeLogger('warn');
    const out = captureStderr(() => {
      log.debug('d');
      log.info('i');
      log.warn('w');
    });
    assert.ok(!out.includes('[DEBUG]') && !out.includes('[INFO]'));
    assert.ok(out.includes('[WARN]'));
  });

  test('TC-L7: error level suppresses everything below', () => {
    const log = makeLogger('error');
    const out = captureStderr(() => {
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');
    });
    assert.ok(!out.includes('[DEBUG]') && !out.includes('[INFO]') && !out.includes('[WARN]'));
    assert.ok(out.includes('[ERROR]'));
  });
});
