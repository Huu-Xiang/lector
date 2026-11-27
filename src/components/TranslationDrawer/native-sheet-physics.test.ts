import { describe, expect, it } from 'vitest';
import {
  MAX_OVERSCROLL,
  NATIVE_SHEET_DEFAULT,
  NATIVE_SHEET_EXPANDED,
  nativeSheetDetent,
  nativeSheetVelocity,
  nativeSheetVisualHeight,
} from './native-sheet-physics';

describe('native sheet physics', () => {
  it('snaps slow releases around the midpoint to stable detents', () => {
    expect(nativeSheetDetent(56, 0)).toBe(NATIVE_SHEET_DEFAULT);
    expect(nativeSheetDetent(56.1, 0)).toBe(NATIVE_SHEET_EXPANDED);
    expect(nativeSheetDetent(85, 0)).toBe(78);
  });
  it('uses flick direction without dismissing an expanded sheet above default', () => {
    expect(nativeSheetDetent(40, -0.46)).toBe(78);
    expect(nativeSheetDetent(33, 0.66)).toBe('dismiss');
    expect(nativeSheetDetent(60, 1)).toBe(NATIVE_SHEET_DEFAULT);
    expect(nativeSheetDetent(78, 0.46)).toBe(NATIVE_SHEET_DEFAULT);
    expect(nativeSheetDetent(60, 0.45)).toBe(NATIVE_SHEET_EXPANDED);
    expect(nativeSheetDetent(40, -0.45)).toBe(NATIVE_SHEET_DEFAULT);
    expect(nativeSheetDetent(34, 1)).toBe(NATIVE_SHEET_DEFAULT);
    expect(nativeSheetDetent(15, 0)).toBe('dismiss');
    expect(nativeSheetDetent(20, 0)).toBe(34);
  });
  it('measures only recent velocity and ignores stationary or zero-time samples', () => {
    expect(
      nativeSheetVelocity([
        { clientY: 300, timeStamp: 0 },
        { clientY: 200, timeStamp: 150 },
        { clientY: 175, timeStamp: 200 },
      ]),
    ).toBe(-0.5);
    expect(
      nativeSheetVelocity([
        { clientY: 200, timeStamp: 150 },
        { clientY: 175, timeStamp: 400 },
      ]),
    ).toBe(0);
    expect(
      nativeSheetVelocity([
        { clientY: 20, timeStamp: 1 },
        { clientY: 10, timeStamp: 1 },
      ]),
    ).toBe(0);
    expect(nativeSheetVelocity([])).toBe(0);
  });
  it('damps overscroll smoothly below the six-dvh ceiling', () => {
    expect(nativeSheetVisualHeight(34)).toBe(34);
    expect(nativeSheetVisualHeight(78)).toBe(78);
    expect(nativeSheetVisualHeight(79)).toBeGreaterThan(78);
    expect(nativeSheetVisualHeight(79)).toBeLessThan(79);
    expect(nativeSheetVisualHeight(10000)).toBeLessThan(78 + MAX_OVERSCROLL);
    expect(nativeSheetVisualHeight(-20)).toBe(8);
  });
});
