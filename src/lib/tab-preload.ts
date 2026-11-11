import {
  getAllCollections,
  getAllDailyStats,
  getAllGroups,
  getAllVocab,
  getAppWideActivity,
  getClozeTotals,
  getCollectionCounts,
  getFluencyStats,
  getJournalEntries,
  getReadingStats,
  getReviewCounts,
  getSettingCached,
  getStreak,
  getTodayStats,
} from '@/lib/data-layer';
import { getOnboardingSnapshotCached } from '@/lib/onboarding';

const TAB_LOADERS: Record<string, () => Promise<unknown>[]> = {
  '/': () => [
    getAllCollections(),
    getAllGroups(),
    getOnboardingSnapshotCached(),
    getStreak(),
    getSettingCached('readingLevels'),
    getSettingCached('readingInterests'),
  ],
  '/practice': () => [getTodayStats(), getCollectionCounts(), getReviewCounts()],
  '/journal': () => [getJournalEntries(50)],
  '/vocab': () => [getAllVocab(), getAllCollections()],
  '/stats': () => [
    getCollectionCounts(),
    getFluencyStats(),
    getReadingStats(),
    getStreak(),
    getSettingCached('timezone'),
    getAllDailyStats(),
    getAllVocab(),
    getAppWideActivity(),
    getClozeTotals(),
  ],
};

const visited = new Set<string>();
const preloadedUsers = new Set<string>();

/** Records a tab the user opened this session, so it is not preloaded. */
export function markVisited(path: string): void {
  if (path in TAB_LOADERS) visited.add(path);
}

export function resetTabPreload(): void {
  visited.clear();
  preloadedUsers.clear();
}

/**
 * Warms the cache for tabs not yet visited, one tab at a time. It runs once per
 * user per session and never throws.
 */
export async function preloadTabs(
  userId: string,
  currentPath: string,
  prefetch: (href: string) => void,
): Promise<void> {
  if (preloadedUsers.has(userId)) return;
  preloadedUsers.add(userId);
  markVisited(currentPath);
  for (const [href, load] of Object.entries(TAB_LOADERS)) {
    if (visited.has(href)) continue;
    try {
      prefetch(href);
    } catch {}
    try {
      await Promise.allSettled(load());
    } catch {}
  }
}
