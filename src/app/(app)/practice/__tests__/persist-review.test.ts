import { describe, it, expect, vi, beforeEach } from 'vitest';

// persistReview (#232): the review row is the source of truth — a failed
// primary write returns false (no advancement) and surfaces an error; failed
// secondary writes still return true but tell the learner.

const updateClozeAfterReview = vi.fn();
const incrementDailyStat = vi.fn();
const toastError = vi.fn();

vi.mock('@/lib/data-layer', () => ({
  updateClozeAfterReview: (...args: unknown[]) => updateClozeAfterReview(...args),
  incrementDailyStat: (...args: unknown[]) => incrementDailyStat(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

import { persistReview } from '../persist-review';

const NEXT = new Date('2026-01-02T00:00:00Z');

beforeEach(() => {
  updateClozeAfterReview.mockReset().mockResolvedValue(1);
  incrementDailyStat.mockReset().mockResolvedValue(true);
  toastError.mockReset();
});

describe('persistReview (#232)', () => {
  it('returns true on the happy path and records stats', async () => {
    const ok = await persistReview('s1', 'huis', true, 8, 25, NEXT);
    expect(ok).toBe(true);
    expect(updateClozeAfterReview).toHaveBeenCalledWith('s1', true, 25, NEXT);
    expect(incrementDailyStat).toHaveBeenCalledWith('clozePracticed');
    expect(incrementDailyStat).toHaveBeenCalledWith('points', 8);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('the bug this fixes: a failed primary write returns false, toasts, and touches nothing else', async () => {
    updateClozeAfterReview.mockResolvedValue(0);

    const ok = await persistReview('s1', 'huis', true, 8, 25, NEXT);

    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    // No stats writes for an unsaved review.
    expect(incrementDailyStat).not.toHaveBeenCalled();
  });

  it('leaves the known-word write to the server at mastery 100', async () => {
    const ok = await persistReview('s1', 'huis!', true, 8, 100, NEXT);
    expect(ok).toBe(true);
    expect(updateClozeAfterReview).toHaveBeenCalledWith('s1', true, 100, NEXT);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('awards no points stat when none were earned', async () => {
    await persistReview('s1', 'huis', false, 0, 0, NEXT);
    expect(incrementDailyStat).toHaveBeenCalledWith('clozePracticed');
    expect(incrementDailyStat).not.toHaveBeenCalledWith('points', expect.anything());
  });

  it('a failed secondary write still returns true but surfaces a toast', async () => {
    incrementDailyStat.mockResolvedValue(false);

    const ok = await persistReview('s1', 'huis', true, 8, 25, NEXT);

    expect(ok).toBe(true); // the review row saved — the round may continue
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
