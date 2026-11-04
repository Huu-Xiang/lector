import { db } from '../../db';
import { reserveDailyStatsRows } from '../daily-stats-limits';
import { entitlements, type LimitVerdict } from '../entitlements';
import { localDay, type QuestionType } from './queue';
import {
  FSRS_CONFIG_VERSION,
  FSRS_MODEL,
  ratingForAnswer,
  type ReviewAnswer,
  type Scheduler,
} from './scheduler';
import { readerStateForStage, stageOf, type ReviewStage } from './stages';
import { syncWordState } from './sync-word-state';
import { fsrsColumns, reviewCardOf, type WordCardRow } from './word-card-rows';

export interface AnswerDeps {
  scheduler: Scheduler;
  logRowLimit: (userId: string) => number | null;
}

export const defaultLogRowLimit = (userId: string) =>
  entitlements.resolveEntitlements(userId).limits.maxWordReviewLogRows;

export interface AnswerInput {
  roundId: string;
  eventId: string;
  cardId: string;
  rawAnswer: ReviewAnswer;
  questionType: QuestionType;
}

export interface UndoInput {
  roundId: string;
  eventId: string;
  newEventId: string;
}

export interface AnswerResult {
  cardId: string;
  eventId: string;
  stage: ReviewStage;
  due: string;
  requeue: boolean;
}

export class AnswerError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export class StatsLimitError extends Error {
  constructor(readonly verdict: Exclude<LimitVerdict, { allowed: true }>) {
    super('Daily stats limit reached');
  }
}

export const QUESTION_TYPES: readonly QuestionType[] = [
  'choose_meaning',
  'recognition',
  'fill_in',
  'typed_fill_in',
  'dictation',
];
export const RAW_ANSWERS: readonly ReviewAnswer[] = [
  'dont_know',
  'fuzzy',
  'know',
  'right',
  'wrong',
];

const CHOICE_POINTS: Partial<Record<QuestionType, number>> = {
  choose_meaning: 4,
  fill_in: 6,
  typed_fill_in: 8,
  dictation: 8,
};
const RECOGNITION_KNOW_POINTS = 3;

function answerFitsQuestion(answer: ReviewAnswer, questionType: QuestionType): boolean {
  return questionType === 'recognition'
    ? answer === 'dont_know' || answer === 'fuzzy' || answer === 'know'
    : answer === 'right' || answer === 'wrong';
}

function pointsFor(questionType: QuestionType, answer: ReviewAnswer): number {
  if (questionType === 'recognition') return answer === 'know' ? RECOGNITION_KNOW_POINTS : 0;
  return answer === 'right' ? (CHOICE_POINTS[questionType] ?? 0) : 0;
}

interface LogRow {
  eventId: string;
  cardId: string;
  rating: string;
  roundId: string | null;
  rawAnswer: ReviewAnswer;
  questionType: QuestionType;
  wasRequeue: number;
  undoneAt: string | null;
  reviewedAt: string;
  prevState: WordCardRow['state'];
  prevDue: string;
  prevStability: number;
  prevDifficulty: number;
  prevElapsedDays: number;
  prevScheduledDays: number;
  prevLearningSteps: number;
  prevReps: number;
  prevLapses: number;
  prevLastReview: string | null;
}

function storedResult(userId: string, row: LogRow): AnswerResult {
  const card = db
    .prepare('SELECT * FROM wordCards WHERE userId = ? AND id = ?')
    .get(userId, row.cardId) as WordCardRow | undefined;
  if (!card) throw new AnswerError(404, 'Card not found');
  return {
    cardId: row.cardId,
    eventId: row.eventId,
    stage: stageOf(reviewCardOf(card)),
    due: card.due,
    requeue: row.rating === 'again',
  };
}

function loggedEvent(userId: string, eventId: string): LogRow | undefined {
  return db
    .prepare('SELECT * FROM wordReviewLog WHERE userId = ? AND eventId = ?')
    .get(userId, eventId) as LogRow | undefined;
}

function adjustStats(
  userId: string,
  language: string,
  date: string,
  clozeDelta: number,
  pointsDelta: number,
): void {
  if (clozeDelta === 0 && pointsDelta === 0) return;
  const verdict = reserveDailyStatsRows(userId, [{ date, language }], () => {
    db.prepare(
      `INSERT OR IGNORE INTO dailyStats
        (userId, date, language, wordsRead, newWordsSaved, wordsMarkedKnown, minutesRead, clozePracticed, points, dictionaryLookups)
       VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0)`,
    ).run(userId, date, language);
    db.prepare(
      `UPDATE dailyStats
          SET clozePracticed = MAX(0, clozePracticed + ?), points = MAX(0, points + ?)
        WHERE userId = ? AND date = ? AND language = ?`,
    ).run(clozeDelta, pointsDelta, userId, date, language);
  });
  if (!verdict.allowed) throw new StatsLimitError(verdict);
}

function pruneLog(userId: string, limit: number | null, keepEventId: string): void {
  if (limit === null) return;
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM wordReviewLog WHERE userId = ?')
    .get(userId) as { total: number };
  if (total <= limit) return;
  db.prepare(
    `DELETE FROM wordReviewLog WHERE rowid IN (
       SELECT rowid FROM wordReviewLog
        WHERE userId = ?1
          AND rowid NOT IN (SELECT MAX(rowid) FROM wordReviewLog WHERE userId = ?1 GROUP BY cardId)
        ORDER BY rowid LIMIT ?2)`,
  ).run(userId, total - limit);
  const { left } = db
    .prepare('SELECT COUNT(*) AS left FROM wordReviewLog WHERE userId = ?')
    .get(userId) as { left: number };
  if (left <= limit) return;
  db.prepare(
    `DELETE FROM wordReviewLog WHERE rowid IN (
       SELECT rowid FROM wordReviewLog WHERE userId = ?1 AND eventId != ?2 ORDER BY rowid LIMIT ?3)`,
  ).run(userId, keepEventId, left - limit);
}

function applyAnswer(
  deps: AnswerDeps,
  userId: string,
  input: AnswerInput,
  now: number,
): AnswerResult {
  const { roundId, eventId, cardId, rawAnswer, questionType } = input;
  const round = db
    .prepare('SELECT cardIds FROM reviewRounds WHERE userId = ? AND id = ?')
    .get(userId, roundId) as { cardIds: string } | undefined;
  if (!round || !(JSON.parse(round.cardIds) as string[]).includes(cardId)) {
    throw new AnswerError(400, 'The card was not served in this round');
  }
  if (!answerFitsQuestion(rawAnswer, questionType)) {
    throw new AnswerError(400, 'The answer does not fit the question type');
  }
  const card = db
    .prepare('SELECT * FROM wordCards WHERE userId = ? AND id = ?')
    .get(userId, cardId) as WordCardRow | undefined;
  if (!card) throw new AnswerError(404, 'Card not found');
  if (card.retiredAt !== null) throw new AnswerError(409, 'The card has left review');

  const wasRequeue =
    db
      .prepare(
        'SELECT 1 FROM wordReviewLog WHERE userId = ? AND roundId = ? AND cardId = ? AND undoneAt IS NULL',
      )
      .get(userId, roundId, cardId) !== null;
  const rating = ratingForAnswer(rawAnswer);
  const next = deps.scheduler.review(reviewCardOf(card), rating, now);
  const stage = stageOf(next);
  const nowIso = new Date(now).toISOString();

  db.prepare(
    `INSERT INTO wordReviewLog
       (userId, eventId, cardId, language, roundId, rating, rawAnswer, questionType, wasRequeue,
        prevState, prevDue, prevStability, prevDifficulty, prevElapsedDays, prevScheduledDays,
        prevLearningSteps, prevReps, prevLapses, prevLastReview, modelVersion, configVersion,
        source, reviewedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'review', ?)`,
  ).run(
    userId,
    eventId,
    cardId,
    card.language,
    roundId,
    rating,
    rawAnswer,
    questionType,
    wasRequeue ? 1 : 0,
    ...fsrsColumns(reviewCardOf(card)),
    FSRS_MODEL,
    FSRS_CONFIG_VERSION,
    nowIso,
  );

  if (!wasRequeue) {
    adjustStats(
      userId,
      card.language,
      localDay(userId, now),
      1,
      pointsFor(questionType, rawAnswer),
    );
  }

  db.prepare(
    `UPDATE wordCards SET state = ?, due = ?, stability = ?, difficulty = ?, elapsedDays = ?,
       scheduledDays = ?, learningSteps = ?, reps = ?, lapses = ?, lastReview = ?,
       introducedAt = COALESCE(introducedAt, ?), updatedAt = ?
     WHERE userId = ? AND id = ?`,
  ).run(...fsrsColumns(next), nowIso, nowIso, userId, cardId);

  const vocab = db
    .prepare('SELECT id, type, createdAt FROM vocab WHERE id = ? AND userId = ?')
    .get(card.vocabId, userId) as { id: string; type: WordCardRow['type']; createdAt: string };
  syncWordState({
    userId,
    language: card.language,
    wordKey: card.wordKey,
    state: readerStateForStage(stage),
    source: 'review',
    vocab,
    now,
  });
  pruneLog(userId, deps.logRowLimit(userId), eventId);

  return {
    cardId,
    eventId,
    stage,
    due: new Date(next.due).toISOString(),
    requeue: rating === 'again',
  };
}

export function submitAnswer(
  deps: AnswerDeps,
  userId: string,
  input: AnswerInput,
  now: number,
): AnswerResult {
  const logged = loggedEvent(userId, input.eventId);
  if (logged) return storedResult(userId, logged);
  return db.transaction(() => applyAnswer(deps, userId, input, now))();
}

export function submitUndo(
  deps: AnswerDeps,
  userId: string,
  input: UndoInput,
  now: number,
): AnswerResult {
  const repeat = loggedEvent(userId, input.newEventId);
  if (repeat) return storedResult(userId, repeat);

  return db.transaction(() => {
    const row = loggedEvent(userId, input.eventId);
    if (!row || row.roundId !== input.roundId) throw new AnswerError(404, 'Answer not found');
    if (row.undoneAt !== null) throw new AnswerError(409, 'The answer is already undone');
    const newest = db
      .prepare(
        'SELECT eventId FROM wordReviewLog WHERE userId = ? AND cardId = ? AND undoneAt IS NULL ORDER BY rowid DESC LIMIT 1',
      )
      .get(userId, row.cardId) as { eventId: string };
    if (newest.eventId !== row.eventId) {
      throw new AnswerError(409, 'Only the newest answer of a card can be undone');
    }
    const nowIso = new Date(now).toISOString();
    const card = db
      .prepare('SELECT language FROM wordCards WHERE userId = ? AND id = ?')
      .get(userId, row.cardId) as { language: string } | undefined;
    if (!card) throw new AnswerError(404, 'Card not found');

    db.prepare(
      `UPDATE wordCards SET state = ?, due = ?, stability = ?, difficulty = ?, elapsedDays = ?,
         scheduledDays = ?, learningSteps = ?, reps = ?, lapses = ?, lastReview = ?, updatedAt = ?
       WHERE userId = ? AND id = ?`,
    ).run(
      row.prevState,
      row.prevDue,
      row.prevStability,
      row.prevDifficulty,
      row.prevElapsedDays,
      row.prevScheduledDays,
      row.prevLearningSteps,
      row.prevReps,
      row.prevLapses,
      row.prevLastReview,
      nowIso,
      userId,
      row.cardId,
    );
    db.prepare('UPDATE wordReviewLog SET undoneAt = ? WHERE userId = ? AND eventId = ?').run(
      nowIso,
      userId,
      row.eventId,
    );
    if (row.wasRequeue === 0) {
      adjustStats(
        userId,
        card.language,
        localDay(userId, Date.parse(row.reviewedAt)),
        -1,
        -pointsFor(row.questionType, row.rawAnswer),
      );
    }
    return applyAnswer(
      deps,
      userId,
      {
        roundId: input.roundId,
        eventId: input.newEventId,
        cardId: row.cardId,
        rawAnswer: row.questionType === 'recognition' ? 'dont_know' : 'wrong',
        questionType: row.questionType,
      },
      now,
    );
  })();
}
