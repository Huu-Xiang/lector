import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const fns = [
    'getAllCollections',
    'getAllGroups',
    'getStreak',
    'getSettingCached',
    'getTodayStats',
    'getCollectionCounts',
    'getReviewCounts',
    'getJournalEntries',
    'getAllVocab',
    'getFluencyStats',
    'getReadingStats',
    'getAllDailyStats',
    'getAppWideActivity',
    'getClozeTotals',
  ];
  const data: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const f of fns) data[f] = vi.fn(async () => undefined);
  return { data, snapshot: vi.fn(async () => undefined) };
});

vi.mock('@/lib/data-layer', () => m.data);
vi.mock('@/lib/onboarding', () => ({ getOnboardingSnapshotCached: m.snapshot }));

import { markVisited, preloadTabs, resetTabPreload } from './tab-preload';

beforeEach(() => {
  resetTabPreload();
  vi.clearAllMocks();
});

describe('preloadTabs', () => {
  it('prefetches and loads every tab except the current one', async () => {
    const prefetch = vi.fn();
    await preloadTabs('u1', '/', prefetch);
    expect(prefetch.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/journal',
      '/practice',
      '/stats',
      '/vocab',
    ]);
    expect(m.data.getTodayStats).toHaveBeenCalled();
    expect(m.data.getJournalEntries).toHaveBeenCalledWith(50);
    expect(m.data.getFluencyStats).toHaveBeenCalled();
    expect(m.snapshot).not.toHaveBeenCalled();
    expect(m.data.getAllGroups).not.toHaveBeenCalled();
  });

  it('skips tabs already visited this session', async () => {
    markVisited('/vocab');
    markVisited('/stats');
    const prefetch = vi.fn();
    await preloadTabs('u1', '/practice', prefetch);
    expect(prefetch.mock.calls.map((c) => c[0]).sort()).toEqual(['/', '/journal']);
    expect(m.data.getAllVocab).not.toHaveBeenCalled();
    expect(m.data.getFluencyStats).not.toHaveBeenCalled();
    expect(m.data.getReviewCounts).not.toHaveBeenCalled();
    expect(m.snapshot).toHaveBeenCalled();
  });

  it('runs once per user per session', async () => {
    const prefetch = vi.fn();
    await preloadTabs('u1', '/', prefetch);
    const calls = prefetch.mock.calls.length;
    await preloadTabs('u1', '/', prefetch);
    expect(prefetch).toHaveBeenCalledTimes(calls);
  });

  it('runs again for a different user', async () => {
    const prefetch = vi.fn();
    await preloadTabs('u1', '/', prefetch);
    await preloadTabs('u2', '/', prefetch);
    expect(prefetch).toHaveBeenCalledTimes(8);
  });

  it('keeps going when a loader rejects and never throws', async () => {
    m.data.getTodayStats.mockRejectedValueOnce(new Error('boom'));
    m.data.getJournalEntries.mockImplementationOnce(() => {
      throw new Error('sync boom');
    });
    const prefetch = vi.fn(() => {
      throw new Error('prefetch boom');
    });
    await expect(preloadTabs('u1', '/', prefetch)).resolves.toBeUndefined();
    expect(m.data.getAllVocab).toHaveBeenCalled();
    expect(m.data.getFluencyStats).toHaveBeenCalled();
  });
});
