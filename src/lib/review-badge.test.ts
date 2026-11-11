import { describe, expect, it } from 'vitest';
import { reviewBadgeText, reviewReadyCount } from './review-badge';

describe('reviewReadyCount', () => {
  it('adds due and new cards, as the review page and the due email do', () => {
    expect(reviewReadyCount({ dueNow: 3, newAvailable: 5, nextDue: null })).toBe(8);
  });

  it('is zero before the counts load', () => {
    expect(reviewReadyCount(null)).toBe(0);
  });

  it('ignores a negative count', () => {
    expect(reviewReadyCount({ dueNow: -2, newAvailable: 4, nextDue: null })).toBe(4);
  });
});

describe('reviewBadgeText', () => {
  it('shows the number up to 99', () => {
    expect(reviewBadgeText(7)).toBe('7');
    expect(reviewBadgeText(99)).toBe('99');
  });

  it('caps larger numbers', () => {
    expect(reviewBadgeText(100)).toBe('99+');
  });
});
