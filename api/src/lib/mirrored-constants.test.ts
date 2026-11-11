import '../test-guard';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PLAN_NAMES } from './plan-names';
import { LANGS, SOURCES } from './source-list';
import { WELCOME_CODE } from './welcome-offer';

const SRC_LIB = path.resolve(import.meta.dir, '../../../src/lib');

function sourceOf(file: string): string {
  return readFileSync(path.join(SRC_LIB, file), 'utf8');
}

describe('constants mirrored in src/lib', () => {
  test('WELCOME_CODE matches src/lib/welcome-offer.ts', () => {
    const match = /export const WELCOME_CODE = '([^']+)'/.exec(sourceOf('welcome-offer.ts'));
    expect(match?.[1]).toBe(WELCOME_CODE);
  });

  test('PLAN_NAMES matches src/lib/plan-names.ts', () => {
    const body = /export const PLAN_NAMES = \{([^}]*)\}/.exec(sourceOf('plan-names.ts'))?.[1] ?? '';
    const names = Object.fromEntries(
      [...body.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
    );
    expect(names).toEqual({ ...PLAN_NAMES });
  });

  test.each([
    ['SOURCES', SOURCES],
    ['LANGS', LANGS],
  ] as const)('%s matches src/lib/traffic-source.ts', (name, list) => {
    const body =
      new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const`).exec(
        sourceOf('traffic-source.ts'),
      )?.[1] ?? '';
    const names = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...list]);
  });
});
