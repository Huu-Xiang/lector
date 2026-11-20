import { toast } from 'sonner';
import {
  updateClozeAfterReview,
  incrementDailyStat,
  type ClozeMasteryLevel,
} from '@/lib/data-layer';

/**
 * Persist one graded practice answer (#232).
 *
 * The clozeSentences review row is the source of truth: if that write fails,
 * nothing may advance — no points, no round progress, no feedback screen
 * claiming success — so this returns false and surfaces the error. The
 * daily-stat writes are best-effort: the review is saved, the
 * round can continue, but the learner is told their stats didn't update.
 */
export interface PersistReviewMessages {
  saveFailed: string;
  statsFailed: string;
}

const DEFAULT_MESSAGES: PersistReviewMessages = {
  saveFailed: 'Could not save your answer — check your connection and try again.',
  statsFailed: 'Your answer was saved, but updating your stats failed.',
};

export async function persistReview(
  sentenceId: string,
  _clozeWord: string,
  isCorrect: boolean,
  earnedPoints: number,
  newMastery: ClozeMasteryLevel,
  nextReview: Date,
  messages: PersistReviewMessages = DEFAULT_MESSAGES,
): Promise<boolean> {
  const saved = await updateClozeAfterReview(sentenceId, isCorrect, newMastery, nextReview);
  if (!saved) {
    toast.error(messages.saveFailed);
    return false;
  }

  let secondaryOk = true;
  secondaryOk = (await incrementDailyStat('clozePracticed')) && secondaryOk;
  if (earnedPoints > 0) {
    secondaryOk = (await incrementDailyStat('points', earnedPoints)) && secondaryOk;
  }
  if (!secondaryOk) {
    toast.error(messages.statsFailed);
  }

  return true;
}
