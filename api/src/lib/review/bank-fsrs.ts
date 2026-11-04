import { db, type ClozeMasteryLevel, type ClozeSentenceRow } from '../../db';
import { seedFromLegacy, type CardState, type ReviewCard } from './scheduler';
import { stageOf, type ReviewStage } from './stages';

export interface BankFsrsColumns {
  fsrsState: CardState | null;
  fsrsDue: string | null;
  fsrsStability: number | null;
  fsrsDifficulty: number | null;
  fsrsElapsedDays: number | null;
  fsrsScheduledDays: number | null;
  fsrsLearningSteps: number | null;
  fsrsReps: number | null;
  fsrsLapses: number | null;
  fsrsLastReview: string | null;
  fsrsUpdatedAt: string | null;
}

export type BankFsrsRow = ClozeSentenceRow & BankFsrsColumns;

const MASTERY_FOR_STAGE: Record<ReviewStage, ClozeMasteryLevel> = {
  new: 0,
  learning: 25,
  familiar: 75,
  mastered: 100,
};

export function masteryForCard(card: ReviewCard): ClozeMasteryLevel {
  return MASTERY_FOR_STAGE[stageOf(card)];
}

export function bankFsrsNeedsSeed(row: BankFsrsRow): boolean {
  if (row.fsrsState === null || row.fsrsDue === null || row.fsrsUpdatedAt === null) return true;
  return row.lastReviewed !== null && row.lastReviewed > row.fsrsUpdatedAt;
}

export function loadBankCard(row: BankFsrsRow, now: number): ReviewCard {
  if (bankFsrsNeedsSeed(row)) return seedFromLegacy(row, now);
  return {
    state: row.fsrsState as CardState,
    due: Date.parse(row.fsrsDue as string),
    stability: row.fsrsStability ?? 0,
    difficulty: row.fsrsDifficulty ?? 0,
    elapsedDays: row.fsrsElapsedDays ?? 0,
    scheduledDays: row.fsrsScheduledDays ?? 0,
    learningSteps: row.fsrsLearningSteps ?? 0,
    reps: row.fsrsReps ?? 0,
    lapses: row.fsrsLapses ?? 0,
    lastReview: row.fsrsLastReview === null ? null : Date.parse(row.fsrsLastReview),
  };
}

export function writeBankCard(
  userId: string,
  id: string,
  language: string,
  card: ReviewCard,
  updatedAt: string,
): void {
  db.prepare(
    `UPDATE clozeSentences SET fsrsState = ?, fsrsDue = ?, fsrsStability = ?, fsrsDifficulty = ?,
       fsrsElapsedDays = ?, fsrsScheduledDays = ?, fsrsLearningSteps = ?, fsrsReps = ?,
       fsrsLapses = ?, fsrsLastReview = ?, fsrsUpdatedAt = ?
     WHERE id = ? AND userId = ? AND language = ?`,
  ).run(
    card.state,
    new Date(card.due).toISOString(),
    card.stability,
    card.difficulty,
    card.elapsedDays,
    card.scheduledDays,
    card.learningSteps,
    card.reps,
    card.lapses,
    card.lastReview === null ? null : new Date(card.lastReview).toISOString(),
    updatedAt,
    id,
    userId,
    language,
  );
}
