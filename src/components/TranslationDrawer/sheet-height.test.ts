import { describe, it, expect } from 'vitest';
import {
  clampSheetVh,
  parseSheetVh,
  sheetVhFromPointer,
  SHEET_VH_MAX,
  SHEET_VH_MIN,
} from './sheet-height';

describe('sheet height', () => {
  it('clamps to the allowed range', () => {
    expect(clampSheetVh(5)).toBe(SHEET_VH_MIN);
    expect(clampSheetVh(99)).toBe(SHEET_VH_MAX);
    expect(clampSheetVh(50)).toBe(50);
  });

  it('parses a stored value and ignores junk', () => {
    expect(parseSheetVh('60')).toBe(60);
    expect(parseSheetVh('200')).toBe(SHEET_VH_MAX);
    expect(parseSheetVh('abc')).toBeNull();
    expect(parseSheetVh(null)).toBeNull();
  });

  it('turns a pointer position into a height from the bottom edge', () => {
    expect(sheetVhFromPointer(500, 1000)).toBe(50);
    expect(sheetVhFromPointer(1000, 1000)).toBe(0);
  });
});
