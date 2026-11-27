import { describe, expect, it } from 'vitest';
import { readerChromeHidden } from './chrome';

describe('reader chrome direction thresholds', () => {
  it('hides only after leaving the top and making a deliberate downward scroll', () => {
    expect(readerChromeHidden(56, 20, false)).toBe(false);
    expect(readerChromeHidden(100, 12, false)).toBe(false);
    expect(readerChromeHidden(100, 13, false)).toBe(true);
  });
  it('reveals near the top or on a deliberate upward scroll', () => {
    expect(readerChromeHidden(31, 0, true)).toBe(false);
    expect(readerChromeHidden(100, -9, true)).toBe(false);
    expect(readerChromeHidden(100, -8, true)).toBe(true);
  });
});
