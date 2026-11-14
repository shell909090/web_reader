import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSearchConfig, configureSearch, providerConfig } from '../src/search/config.ts';
import { apiUrl } from '../src/search/common.ts';
import { parseCLI } from '../src/cli/args.ts';

test('TOML alone, environment alone and field overlays are interchangeable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'search-config-'));
  const path = join(dir, 'config.toml');
  try {
    writeFileSync(
      path,
      '[providers.brave]\napi_key = "file-key"\nenabled = true\n[providers.searxng]\nbase_url = "http://localhost:8888"\n',
    );
    assert.equal(loadSearchConfig(path, {}).brave?.api_key, 'file-key');
    const merged = loadSearchConfig(path, { BRAVE_API_KEY: 'env-key' });
    assert.equal(merged.brave?.api_key, 'env-key');
    assert.equal(merged.brave?.enabled, true);
    assert.equal(merged.searxng?.base_url, 'http://localhost:8888');
    assert.equal(loadSearchConfig(path, { BRAVE_API_KEY: '' }).brave?.api_key, '');
    assert.equal(
      loadSearchConfig(undefined, { XDG_CONFIG_HOME: dir, BRAVE_API_KEY: 'only-env' }).brave
        ?.api_key,
      'only-env',
    );
    assert.equal(loadSearchConfig(path, { BRAVE_ENABLED: 'false' }).brave?.enabled, false);
    assert.throws(() => loadSearchConfig(path, { BRAVE_ENABLED: 'yes' }), /true or false/);
    assert.throws(
      () => loadSearchConfig(path, { SEARXNG_BASE_URL: 'bad' }),
      /environment configuration/,
    );
    assert.throws(
      () => loadSearchConfig(path, { SEARXNG_BASE_URL: 'https://user:secret@example.com' }),
      /environment configuration/,
    );
    mkdirSync(join(dir, 'web_reader'));
    writeFileSync(join(dir, 'web_reader', 'config.toml'), '[providers.exa]\napi_key = "xdg-key"');
    assert.equal(loadSearchConfig(undefined, { XDG_CONFIG_HOME: dir }).exa?.api_key, 'xdg-key');
    assert.equal(loadSearchConfig(path, { XDG_CONFIG_HOME: dir }).exa?.api_key, undefined);
    assert.throws(() => loadSearchConfig(join(dir, 'missing'), {}), /Cannot read/);
    for (const content of [
      'not toml',
      '[providers.brave]\nenabled = "yes"',
      '[providers.typo]\napi_key = "secret"',
    ]) {
      writeFileSync(path, content);
      assert.throws(() => loadSearchConfig(path, {}), /Invalid search configuration/);
    }
    writeFileSync(path, '[providers.brave]\nenabled = false');
    configureSearch(path);
    assert.throws(() => providerConfig('brave'), /disabled/);
    assert.deepEqual(providerConfig('exa'), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('configuration syntax is shared and credentials cannot use HTTP', () => {
  assert.equal(
    parseCLI(['--config', '/tmp/example.toml', '-q', 'brave', 'example'])?.config,
    '/tmp/example.toml',
  );
  assert.throws(() => apiUrl('http://example.com', '', 'search'), /HTTPS/);
  assert.equal(apiUrl(undefined, 'https://example.com', 'search'), 'https://example.com/search');
  const all = parseCLI(['-s', 'all']);
  assert.ok(all?.mode === 'list');
  assert.ok(!all.sources.some((source) => source.id === 'brave'));
  const explicit = parseCLI(['-s', 'brave']);
  assert.ok(explicit?.mode === 'list');
});
