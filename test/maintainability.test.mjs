import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maintainabilityIndex } from '../scripts/maintainability.mjs';

test('MI accepts small TypeScript modules and penalizes large branching modules', () => {
  const simple = 'export const value: number = 1;';
  const complex = Array.from(
    { length: 100 },
    (_, i) => `export function f${i}(x: number) { if (x > ${i}) return x; return 0; }`,
  ).join('\n');
  assert.ok(maintainabilityIndex(simple, 'simple.ts') > 30);
  assert.ok(maintainabilityIndex(complex, 'complex.ts') <= 30);
});

test('MI handles empty input and consistent line endings', () => {
  const empty = maintainabilityIndex('', 'empty.ts');
  assert.ok(Number.isFinite(empty) && empty >= 0 && empty <= 100);
  const source = 'const x = 1;\nexport const y = x + 1;';
  assert.equal(
    maintainabilityIndex(source, 'a.ts'),
    maintainabilityIndex(source.replaceAll('\n', '\r\n'), 'a.ts'),
  );
});
