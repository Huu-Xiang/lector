import { expect, test } from 'bun:test';
import { percentile } from './llm-latency-probe';

test('percentile picks nearest rank', () => {
  const s = [100, 200, 300, 400, 500];
  expect(percentile(s, 50)).toBe(300);
  expect(percentile(s, 95)).toBe(500);
  expect(percentile([], 50)).toBeNaN();
});
