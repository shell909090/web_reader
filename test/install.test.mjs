import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, readlink, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const targets = ['.claude', '.codex'];

async function temporaryHome(t) {
  const home = await mkdtemp(join(tmpdir(), 'web-reader install '));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

function install(home) {
  return spawnSync('bash', [join(root, 'scripts/install-skill.sh'), root], {
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
}

test('skill installation links both agent directories and is idempotent', async (t) => {
  const home = await temporaryHome(t);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = install(home);
    assert.equal(result.status, 0, result.stderr);
    for (const agent of targets) {
      const destination = join(home, agent, 'skills/web-reader');
      assert.equal(await readlink(destination), join(root, 'web_reader'));
      assert.match(await readFile(join(destination, 'SKILL.md'), 'utf8'), /name: web-reader/);
    }
  }
});

for (const agent of targets) {
  for (const kind of ['directory', 'wrong-link', 'dangling-link']) {
    test(`skill installation preserves ${agent} ${kind} conflicts`, async (t) => {
      const home = await temporaryHome(t);
      const destination = join(home, agent, 'skills/web-reader');
      const other = join(home, 'unrelated');
      await mkdir(dirname(destination), { recursive: true });
      if (kind === 'directory') {
        await mkdir(destination);
      } else {
        if (kind === 'wrong-link') await mkdir(other);
        await symlink(other, destination);
      }
      const result = install(home);
      assert.notEqual(result.status, 0);
      if (kind === 'directory') {
        await access(destination);
        await assert.rejects(readlink(destination));
      } else {
        assert.equal(await readlink(destination), other);
      }
    });
  }
}

test('npm command entry remains executable after skill directory migration', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.bin.web_reader, './bin/web_reader');
  await access(join(root, manifest.bin.web_reader), constants.X_OK);
});
