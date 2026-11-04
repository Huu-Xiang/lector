import { randomUUID } from 'crypto';
import { db, type VocabType } from '../../db';
import { dateStringInTimeZone, getConfiguredTimeZone } from '../dates';
import { LANGUAGES, isValidLanguageCode } from '../languages';
import { chooseMeanings, dictionarySense, fillMeaning, type SenseLookup } from './meanings';
import { stageOf, type ReviewStage } from './stages';
import { reviewCardOf, type WordCardRow } from './word-card-rows';

export type QuestionType =
  | 'choose_meaning'
  | 'recognition'
  | 'fill_in'
  | 'typed_fill_in'
  | 'dictation';
export type ReviewGoal = 'recognize' | 'recognize_spell';

export const DAILY_NEW_CARD_CAP = 20;
export const DEFAULT_ROUND_SIZE = 20;
export const MAX_ROUND_SIZE = 50;

const DAY_MS = 86_400_000;
const NO_FILL_IN_LANGUAGES = new Set(['zh', 'ko']);

export interface QuestionContext {
  stage: ReviewStage;
  type: VocabType;
  language: string;
  goal: ReviewGoal;
  reps: number;
}

export function questionTypeFor({
  stage,
  type,
  language,
  goal,
  reps,
}: QuestionContext): QuestionType {
  if (stage === 'new') return 'choose_meaning';
  if (stage === 'learning') return 'recognition';
  if (type === 'phrase' || NO_FILL_IN_LANGUAGES.has(language)) return 'recognition';
  if (goal === 'recognize') return stage === 'familiar' ? 'fill_in' : 'recognition';
  if (stage === 'familiar') return 'typed_fill_in';
  const hasAudio =
    isValidLanguageCode(language) && LANGUAGES[language].pronunciation.audio !== 'none';
  return hasAudio && reps % 2 === 1 ? 'dictation' : 'typed_fill_in';
}

export function readReviewGoal(userId: string): ReviewGoal {
  const row = db
    .prepare('SELECT value FROM settings WHERE userId = ? AND key = ?')
    .get(userId, 'reviewGoal') as { value: string } | undefined;
  if (!row) return 'recognize';
  try {
    return JSON.parse(row.value) === 'recognize_spell' ? 'recognize_spell' : 'recognize';
  } catch {
    return 'recognize';
  }
}

export function localDay(userId: string, ms: number): string {
  return dateStringInTimeZone(new Date(ms), getConfiguredTimeZone(userId));
}

interface CardWithVocab extends WordCardRow {
  text: string;
  sentence: string;
  translation: string;
  vocabCreatedAt: string;
}

function activeCards(userId: string, language: string): CardWithVocab[] {
  return db
    .prepare(
      `SELECT c.*, v.text, v.sentence, v.translation, v.createdAt AS vocabCreatedAt
         FROM wordCards c JOIN vocab v ON v.id = c.vocabId AND v.userId = c.userId
        WHERE c.userId = ? AND c.language = ? AND c.retiredAt IS NULL`,
    )
    .all(userId, language) as CardWithVocab[];
}

function introducedToday(userId: string, language: string, now: number): number {
  const today = localDay(userId, now);
  const rows = db
    .prepare(
      'SELECT introducedAt FROM wordCards WHERE userId = ? AND language = ? AND introducedAt >= ?',
    )
    .all(userId, language, new Date(now - 2 * DAY_MS).toISOString()) as Array<{
    introducedAt: string;
  }>;
  return rows.filter((row) => localDay(userId, Date.parse(row.introducedAt)) === today).length;
}

function selection(userId: string, language: string, now: number) {
  const cards = activeCards(userId, language);
  const nowIso = new Date(now).toISOString();
  const due = cards
    .filter((card) => card.state !== 'new' && card.due <= nowIso)
    .sort((a, b) => a.due.localeCompare(b.due));
  const today = localDay(userId, now);
  const waiting = cards.filter((card) => card.state === 'new');
  const savedToday = (card: CardWithVocab) =>
    localDay(userId, Date.parse(card.vocabCreatedAt)) === today;
  const fresh = waiting
    .filter(savedToday)
    .sort((a, b) => a.vocabCreatedAt.localeCompare(b.vocabCreatedAt));
  const older = waiting
    .filter((card) => !savedToday(card))
    .sort((a, b) => a.vocabCreatedAt.localeCompare(b.vocabCreatedAt));
  const remaining = Math.max(0, DAILY_NEW_CARD_CAP - introducedToday(userId, language, now));
  const nextDue = cards
    .filter((card) => card.state !== 'new' && card.due > nowIso)
    .reduce<string | null>((min, card) => (min === null || card.due < min ? card.due : min), null);
  return { due, newCards: [...fresh, ...older].slice(0, remaining), nextDue };
}

export interface ReviewCounts {
  dueNow: number;
  newAvailable: number;
  nextDue: string | null;
}

export function getCounts(userId: string, language: string, now: number): ReviewCounts {
  const { due, newCards, nextDue } = selection(userId, language, now);
  return { dueNow: due.length, newAvailable: newCards.length, nextDue };
}

export interface QueueItem {
  cardId: string;
  word: string;
  type: VocabType;
  stage: ReviewStage;
  questionType: QuestionType;
  sentence: string;
  translation: string;
  choices?: string[];
}

export function buildRound(
  userId: string,
  language: string,
  size: number,
  now: number,
  lookup: SenseLookup = dictionarySense,
) {
  const { due, newCards } = selection(userId, language, now);
  const goal = readReviewGoal(userId);
  const pool = activeCards(userId, language).filter((card) => card.translation.trim() !== '');
  const items: QueueItem[] = [];
  for (const card of [...due, ...newCards]) {
    if (items.length >= size) break;
    let translation = card.translation;
    if (translation.trim() === '') {
      const sense = card.vocabId
        ? fillMeaning(userId, card.vocabId, card.text, language, lookup)
        : null;
      if (!sense) continue;
      translation = sense;
      pool.push({ ...card, translation });
    }
    const stage = stageOf(reviewCardOf(card));
    let questionType = questionTypeFor({
      stage,
      type: card.type,
      language,
      goal,
      reps: card.reps,
    });
    let choices: string[] | undefined;
    if (questionType === 'choose_meaning') {
      const options = chooseMeanings({ id: card.id, text: card.text, translation }, pool);
      if (options) choices = options;
      else questionType = 'recognition';
    }
    items.push({
      cardId: card.id,
      word: card.text,
      type: card.type,
      stage,
      questionType,
      sentence: card.sentence,
      translation,
      ...(choices ? { choices } : {}),
    });
  }
  const roundId = randomUUID();
  db.transaction(() => {
    db.prepare('DELETE FROM reviewRounds WHERE userId = ? AND createdAt < ?').run(
      userId,
      new Date(now - DAY_MS).toISOString(),
    );
    db.prepare(
      'INSERT INTO reviewRounds (userId, id, language, cardIds, createdAt) VALUES (?, ?, ?, ?, ?)',
    ).run(
      userId,
      roundId,
      language,
      JSON.stringify(items.map((item) => item.cardId)),
      new Date(now).toISOString(),
    );
  })();
  return { roundId, items };
}
