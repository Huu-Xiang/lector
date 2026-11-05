import { backfillWordCards } from './backfill';
import { getCounts, type ReviewCounts } from './queue';
import { reconcileWordCards } from './reconcile';

/** Brings the word cards up to date, then counts what is due. Used by GET /api/review/counts and the reminder worker. */
export function reviewCounts(userId: string, language: string, at: number): ReviewCounts {
  backfillWordCards(userId, language, at);
  reconcileWordCards(userId, language, at);
  return getCounts(userId, language, at);
}
