import { describe, expect, it } from 'vitest';
import { swipeDirection, swipeOffset, swipeStaysOpen, SWIPE_ACTION_WIDTH } from './swipe';

describe('native vocabulary swipe', () => {
  it('waits for the deadzone and preserves vertical scrolling', () => {
    expect(swipeDirection(10, 9)).toBeNull();
    expect(swipeDirection(-8, 30)).toBe('vertical');
    expect(swipeDirection(-30, 8)).toBe('horizontal');
    expect(swipeDirection(20, 20)).toBe('vertical');
  });

  it('bounds reveal distance and allows closing an open row', () => {
    expect(swipeOffset(0, -300)).toBe(-SWIPE_ACTION_WIDTH);
    expect(swipeOffset(0, 40)).toBe(0);
    expect(swipeOffset(-SWIPE_ACTION_WIDTH, 300)).toBe(0);
    expect(swipeStaysOpen(-60)).toBe(true);
    expect(swipeStaysOpen(-10)).toBe(false);
  });
});
