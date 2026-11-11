import { beforeEach, describe, expect, it } from 'vitest';
import { forgetTabScroll, isTabPath, recordTabScroll, savedTabScroll } from './tab-scroll';

beforeEach(() => forgetTabScroll());

describe('tab scroll memory', () => {
  it('remembers the last offset recorded for a tab', () => {
    recordTabScroll('/', 120);
    recordTabScroll('/', 840);
    expect(savedTabScroll('/')).toBe(840);
  });

  it('starts a tab never visited at the top', () => {
    expect(savedTabScroll('/vocab')).toBe(0);
  });

  it('keeps each tab apart', () => {
    recordTabScroll('/', 500);
    recordTabScroll('/vocab', 90);
    expect(savedTabScroll('/')).toBe(500);
    expect(savedTabScroll('/vocab')).toBe(90);
  });

  it('ignores paths that are not tabs', () => {
    recordTabScroll('/read/abc', 300);
    expect(isTabPath('/read/abc')).toBe(false);
    expect(savedTabScroll('/read/abc')).toBe(0);
    expect(isTabPath('/stats')).toBe(true);
  });
});
