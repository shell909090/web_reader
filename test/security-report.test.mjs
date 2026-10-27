import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSecurity } from '../scripts/security-report.mjs';

const lock = {
  packages: {
    '': { name: 'example' },
    'node_modules/runtime': { version: '1.0.0' },
    'node_modules/dev': { version: '2.0.0', dev: true },
    'node_modules/runtime/node_modules/dev': { version: '1.0.0' },
  },
};
const report = {
  Results: [
    {
      Type: 'npm',
      Target: 'package-lock.json',
      Packages: [
        { Name: 'runtime', Version: '1.0.0' },
        { Name: 'dev', Version: '2.0.0' },
        { Name: 'dev', Version: '1.0.0' },
      ],
      Vulnerabilities: [{ Severity: 'HIGH', VulnerabilityID: 'TEST-1' }],
    },
  ],
};

test('security report verifies all versions and reports vulnerabilities without failing', () => {
  const summary = summarizeSecurity(report, lock);
  assert.equal(summary.packages, 3);
  assert.equal(summary.counts.HIGH, 1);
});

test('security report rejects missing dev dependencies and nested package versions', () => {
  for (const index of [1, 2]) {
    const incomplete = JSON.parse(JSON.stringify(report));
    incomplete.Results[0].Packages.splice(index, 1);
    assert.throws(() => summarizeSecurity(incomplete, lock), /Dependency absent/);
  }
});

test('security report rejects empty or wrong scan targets', () => {
  for (const invalid of [
    {},
    { Results: [] },
    { Results: [{ Type: 'npm', Target: 'other.json' }] },
  ]) {
    assert.throws(() => summarizeSecurity(invalid, lock), /Missing/);
  }
  assert.throws(() => summarizeSecurity(report, {}), /Missing lockfile/);
});
