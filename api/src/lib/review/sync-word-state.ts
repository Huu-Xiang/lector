import { db, type VocabRow, type VocabType, type WordState } from '../../db';
import { foldWord, getLanguageConfig, type LanguageCode } from '../languages';
import { seedFromReaderLevel } from './scheduler';
import { stageOf, type ReviewStage } from './stages';
import { fsrsColumns, insertWordCard, reviewCardOf, type WordCardRow } from './word-card-rows';

export type WordStateSource = 'reader' | 'import' | 'anki' | 'restore' | 'review';

export interface SyncVocab {
  id: string;
  type: VocabType;
  createdAt: string;
}

export interface SyncWordStateInput {
  userId: string;
  language: string;
  wordKey: string;
  state: WordState;
  source: WordStateSource;
  /** The vocab row whose state is written. */
  vocab?: SyncVocab;
  /** The newest vocab row for the word, when the caller already has it. */
  newest?: SyncVocab;
  /** Skip the vocab and knownWords writes; the caller already made them. */
  keepRows?: boolean;
  now?: number;
}

const TARGET_STAGE: Record<WordState, ReviewStage | null> = {
  new: 'new',
  level1: 'new',
  level2: 'learning',
  level3: 'familiar',
  level4: 'mastered',
  known: null,
  ignored: null,
};

export function isRetiringState(state: WordState): boolean {
  return state === 'known' || state === 'ignored';
}

export function newestVocabForWord(
  userId: string,
  language: string,
  wordKey: string,
): SyncVocab | undefined {
  const pack = getLanguageConfig(language as LanguageCode);
  const rows = db
    .prepare('SELECT id, text, type, createdAt FROM vocab WHERE userId = ? AND language = ?')
    .all(userId, language) as Array<Pick<VocabRow, 'id' | 'text' | 'type' | 'createdAt'>>;
  let newest: SyncVocab | undefined;
  for (const row of rows) {
    if (foldWord(row.text, pack) !== wordKey) continue;
    if (!newest || row.createdAt > newest.createdAt) newest = row;
  }
  return newest;
}

function writeStateToWordRows(
  userId: string,
  language: string,
  wordKey: string,
  state: WordState,
  nowIso: string,
): void {
  const pack = getLanguageConfig(language as LanguageCode);
  const rows = db
    .prepare('SELECT id, text FROM vocab WHERE userId = ? AND language = ?')
    .all(userId, language) as Array<Pick<VocabRow, 'id' | 'text'>>;
  const update = db.prepare(
    'UPDATE vocab SET state = ?, stateUpdatedAt = ? WHERE id = ? AND userId = ?',
  );
  for (const row of rows) {
    if (foldWord(row.text, pack) === wordKey) update.run(state, nowIso, row.id, userId);
  }
}

function cardFor(userId: string, language: string, wordKey: string) {
  return db
    .prepare('SELECT * FROM wordCards WHERE userId = ? AND language = ? AND wordKey = ?')
    .get(userId, language, wordKey) as WordCardRow | undefined;
}

export function syncWordState(input: SyncWordStateInput): void {
  const { userId, language, wordKey, state, source } = input;
  const now = input.now ?? Date.now();
  const nowIso = new Date(now).toISOString();

  if (!input.keepRows) {
    if (source === 'review') {
      writeStateToWordRows(userId, language, wordKey, state, nowIso);
    } else if (input.vocab) {
      db.prepare('UPDATE vocab SET state = ?, stateUpdatedAt = ? WHERE id = ? AND userId = ?').run(
        state,
        nowIso,
        input.vocab.id,
        userId,
      );
    }
    db.prepare(
      `INSERT INTO knownWords (userId, word, language, state) VALUES (?, ?, ?, ?)
       ON CONFLICT(userId, word, language) DO UPDATE SET state = excluded.state`,
    ).run(userId, wordKey, language, state);
  }

  const card = cardFor(userId, language, wordKey);
  const candidate = input.newest ?? input.vocab;
  if (card && candidate && candidate.id !== card.vocabId) {
    const current = db
      .prepare('SELECT createdAt FROM vocab WHERE id = ? AND userId = ?')
      .get(card.vocabId, userId) as { createdAt: string } | undefined;
    if (!current || candidate.createdAt >= current.createdAt) {
      repointWordCard(userId, language, wordKey, candidate);
    }
  }
  const touch = db.prepare(
    'UPDATE wordCards SET lastSyncedAt = ?, updatedAt = ? WHERE userId = ? AND id = ?',
  );

  if (source === 'review') {
    if (card) touch.run(nowIso, nowIso, userId, card.id);
    return;
  }

  if (isRetiringState(state)) {
    if (!card) return;
    const mastered = card.retiredAt === null && stageOf(reviewCardOf(card)) === 'mastered';
    const keepActive = state === 'known' && (source === 'restore' || source === 'anki') && mastered;
    const retiredAt = keepActive ? card.retiredAt : (card.retiredAt ?? nowIso);
    db.prepare(
      'UPDATE wordCards SET retiredAt = ?, lastSyncedAt = ?, updatedAt = ? WHERE userId = ? AND id = ?',
    ).run(retiredAt, nowIso, nowIso, userId, card.id);
    return;
  }

  const level = state as 'new' | 'level1' | 'level2' | 'level3' | 'level4';
  if (card) {
    const current = reviewCardOf(card);
    if (card.retiredAt === null && stageOf(current) === TARGET_STAGE[state]) {
      touch.run(nowIso, nowIso, userId, card.id);
      return;
    }
    const seeded = seedFromReaderLevel(level, now);
    db.prepare(
      `UPDATE wordCards SET state = ?, due = ?, stability = ?, difficulty = ?, elapsedDays = ?,
         scheduledDays = ?, learningSteps = ?, reps = ?, lapses = ?, lastReview = ?,
         retiredAt = NULL, lastSyncedAt = ?, updatedAt = ?
       WHERE userId = ? AND id = ?`,
    ).run(...fsrsColumns(seeded), nowIso, nowIso, userId, card.id);
    return;
  }

  if (source === 'import') return;
  const target = input.newest ?? newestVocabForWord(userId, language, wordKey);
  if (!target) return;
  insertWordCard({
    userId,
    language,
    wordKey,
    vocabId: target.id,
    type: target.type,
    card: seedFromReaderLevel(level, now),
    now,
  });
}

export function repointWordCard(
  userId: string,
  language: string,
  wordKey: string,
  newest: SyncVocab,
): void {
  db.prepare(
    'UPDATE wordCards SET vocabId = ?, type = ? WHERE userId = ? AND language = ? AND wordKey = ?',
  ).run(newest.id, newest.type, userId, language, wordKey);
}

export function syncWordDelete(input: { userId: string; language: string; wordKey: string }) {
  const { userId, language, wordKey } = input;
  const newest = newestVocabForWord(userId, language, wordKey);
  if (newest) {
    const card = cardFor(userId, language, wordKey);
    if (card && card.vocabId !== newest.id) repointWordCard(userId, language, wordKey, newest);
    return;
  }
  db.prepare('DELETE FROM knownWords WHERE userId = ? AND word = ? AND language = ?').run(
    userId,
    wordKey,
    language,
  );
  db.prepare('DELETE FROM wordCards WHERE userId = ? AND language = ? AND wordKey = ?').run(
    userId,
    language,
    wordKey,
  );
}
