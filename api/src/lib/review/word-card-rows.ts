import { randomUUID } from 'crypto';
import { db, type VocabType, type WordState } from '../../db';
import { foldWord, getLanguageConfig, type LanguageCode } from '../languages';
import { FSRS_CONFIG_VERSION, FSRS_MODEL, type CardState, type ReviewCard } from './scheduler';

export interface WordCardRow {
  userId: string;
  id: string;
  language: string;
  wordKey: string;
  vocabId: string | null;
  type: VocabType;
  state: CardState;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReview: string | null;
  retiredAt: string | null;
  introducedAt: string | null;
  lastSentenceKey: string | null;
  lastSyncedAt: string | null;
  modelVersion: string;
  configVersion: number;
  createdAt: string;
  updatedAt: string;
}

export function reviewCardOf(row: WordCardRow): ReviewCard {
  return {
    state: row.state,
    due: Date.parse(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    learningSteps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    lastReview: row.lastReview === null ? null : Date.parse(row.lastReview),
  };
}

export function fsrsColumns(card: ReviewCard) {
  return [
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
  ] as const;
}

export function insertWordCard(input: {
  userId: string;
  language: string;
  wordKey: string;
  vocabId: string;
  type: VocabType;
  card: ReviewCard;
  now: number;
}): void {
  const nowIso = new Date(input.now).toISOString();
  db.prepare(
    `INSERT INTO wordCards
       (userId, id, language, wordKey, vocabId, type, state, due, stability, difficulty,
        elapsedDays, scheduledDays, learningSteps, reps, lapses, lastReview, lastSyncedAt,
        modelVersion, configVersion, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId, language, wordKey) DO NOTHING`,
  ).run(
    input.userId,
    randomUUID(),
    input.language,
    input.wordKey,
    input.vocabId,
    input.type,
    ...fsrsColumns(input.card),
    nowIso,
    FSRS_MODEL,
    FSRS_CONFIG_VERSION,
    nowIso,
    nowIso,
  );
}

export interface NewestVocab {
  id: string;
  type: VocabType;
  state: WordState;
  stateUpdatedAt: string;
  createdAt: string;
}

export function vocabRowsByKey(userId: string, language: string): Map<string, NewestVocab[]> {
  const pack = getLanguageConfig(language as LanguageCode);
  const rows = db
    .prepare(
      'SELECT id, text, type, state, stateUpdatedAt, createdAt FROM vocab WHERE userId = ? AND language = ?',
    )
    .all(userId, language) as Array<NewestVocab & { text: string }>;
  const byKey = new Map<string, NewestVocab[]>();
  for (const row of rows) {
    const key = foldWord(row.text, pack);
    const group = byKey.get(key);
    if (group) group.push(row);
    else byKey.set(key, [row]);
  }
  return byKey;
}

export function newestOf(rows: NewestVocab[]): NewestVocab | undefined {
  let newest: NewestVocab | undefined;
  for (const row of rows) if (!newest || row.createdAt > newest.createdAt) newest = row;
  return newest;
}

export function newestVocabByKey(userId: string, language: string): Map<string, NewestVocab> {
  const newest = new Map<string, NewestVocab>();
  for (const [key, rows] of vocabRowsByKey(userId, language)) newest.set(key, newestOf(rows)!);
  return newest;
}
