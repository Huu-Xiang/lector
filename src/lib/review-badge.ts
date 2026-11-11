import type { ReviewCounts } from '@/types';

const BADGE_CAP = 99;

export function reviewReadyCount(counts: ReviewCounts | null): number {
  if (!counts) return 0;
  return Math.max(0, counts.dueNow) + Math.max(0, counts.newAvailable);
}

export function reviewBadgeText(count: number): string {
  return count > BADGE_CAP ? `${BADGE_CAP}+` : String(count);
}
