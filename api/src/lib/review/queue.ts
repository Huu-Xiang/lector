import { randomUUID } from 'crypto';
import { db, type VocabType } from '../../db';
import { dateStringInTimeZone, getConfiguredTimeZone } from '../dates';
import { LANGUAGES, isValidLanguageCode } from '../languages';
import { chooseMeanings, dictionarySense, fillMeaning, type SenseLookup } from './meanings';
import { stageOf, type ReviewStage } from './stages';
import {
  findSentence,
  type FoundSentence,
  type SentenceBlank,
  type SentenceSource,
} from './sentence-sources';
import { reviewCardOf, type WordCardRow } from './word-card-rows';
import { getNativeLanguageCode } from '../native-language';
import { matchesNative } from '../translation-lang';
import { scheduleMeaningRefresh, type MeaningRefresh, type RefreshTarget } from './meaning-refresh';
import { sharedExampleSentenceCache, type ExampleSentenceCache } from '../example-sentence-cache';
import {
  sharedSentenceTranslationCache,
  type SentenceTranslationCache,
} from '../sentence-translation-cache';
import {
  AI_SENTENCE_KEY,
  cachedExample,
  exampleAsFound,
  sentenceTranslationFor,
} from './sentence-ai';

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

export function readLearnerLevel(userId: string, language: string): string | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE userId = ? AND key = ?')
    .get(userId, 'readingLevels') as { value: string } | undefined;
  if (!row) return null;
  try {
    const level = (JSON.parse(row.value) as Record<string, unknown> | null)?.[language];
    return typeof level === 'string' ? level : null;
  } catch {
    return null;
  }
}

export function localDay(userId: string, ms: number): string {
  return dateStringInTimeZone(new Date(ms), getConfiguredTimeZone(userId));
}

interface CardWithVocab extends WordCardRow {
  text: string;
  sentence: string;
  translation: string;
  translationLang: string | null;
  vocabCreatedAt: string;
}

function activeCards(userId: string, language: string): CardWithVocab[] {
  return db
    .prepare(
      `SELECT c.*, v.text, v.sentence, v.translation, v.translationLang, v.createdAt AS vocabCreatedAt
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
  sentenceSource?: SentenceSource;
  sentenceBlank?: SentenceBlank;
  sentenceTranslation?: { text: string; lang: string };
  /** The shown non-saved sentence has no translation yet; POST /api/review/sentence-translation can fill it. */
  translationPending?: true;
  /** A fill-in card has only its saved sentence; POST /api/review/example-sentence can fetch an AI example. */
  aiExamplePending?: true;
  example?: {
    text: string;
    blank?: SentenceBlank;
    source: SentenceSource;
    translation?: { text: string; lang: string };
  };
}

const SENTENCE_TYPES = new Set<QuestionType>(['fill_in', 'typed_fill_in', 'dictation']);
const SAVED_SERVED = 'saved';

export interface RoundCaches {
  translations: SentenceTranslationCache;
  examples: ExampleSentenceCache;
  /** Passed to the AI-example matcher; replaced in tests. */
  forms?: (word: string, language: string) => string[];
}

const defaultCaches: RoundCaches = {
  translations: sharedSentenceTranslationCache,
  examples: sharedExampleSentenceCache,
};

export function buildRound(
  userId: string,
  language: string,
  size: number,
  now: number,
  lookup: SenseLookup = dictionarySense,
  finder: typeof findSentence = findSentence,
  caches: RoundCaches = defaultCaches,
  refresh: MeaningRefresh = scheduleMeaningRefresh,
) {
  const { due, newCards } = selection(userId, language, now);
  const goal = readReviewGoal(userId);
  const native = getNativeLanguageCode(userId);
  const hasNativeMeaning = (card: CardWithVocab) =>
    card.translation.trim() !== '' && matchesNative(card.translation, card.translationLang, native);
  const pool = activeCards(userId, language).filter(hasNativeMeaning);
  const stale: RefreshTarget[] = [];
  const items: QueueItem[] = [];
  const served = new Map<string, string>();
  const level = readLearnerLevel(userId, language);
  const sentenceDeps = caches.forms ? { forms: caches.forms } : undefined;
  const find = (card: CardWithVocab, skipSaved: boolean): FoundSentence | null => {
    const found = finder({
      word: card.text,
      type: card.type,
      language,
      level,
      savedSentence: card.sentence,
      lastSentenceKey: card.lastSentenceKey,
      skipSaved,
    });
    if (found) served.set(card.id, found.key);
    return found;
  };
  for (const card of [...due, ...newCards]) {
    if (items.length >= size) break;
    let translation = card.translation;
    let nativeMeaning = hasNativeMeaning(card);
    if (!nativeMeaning) {
      const sense = card.vocabId
        ? fillMeaning(userId, card.vocabId, card.text, language, lookup)
        : null;
      if (sense) {
        translation = sense;
        nativeMeaning = true;
        pool.push({ ...card, translation, translationLang: native });
      } else if (translation.trim() === '') {
        continue;
      } else {
        stale.push({ word: card.text, wordKey: card.wordKey, language });
      }
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
    if (questionType === 'choose_meaning' && !nativeMeaning) questionType = 'recognition';
    if (questionType === 'choose_meaning') {
      const options = chooseMeanings({ id: card.id, text: card.text, translation }, pool);
      if (options) choices = options;
      else questionType = 'recognition';
    }
    const fillIn = SENTENCE_TYPES.has(questionType);
    let found = fillIn
      ? find(card, false)
      : questionType === 'recognition'
        ? find(card, true)
        : null;
    let aiExamplePending = false;
    if (
      fillIn &&
      card.type !== 'phrase' &&
      card.lastSentenceKey === SAVED_SERVED &&
      (!found || found.source.kind === 'saved')
    ) {
      const request = { word: card.text, type: card.type, language };
      const example = cachedExample({ examples: caches.examples, sentenceDeps }, request);
      if (example) {
        found = exampleAsFound(example);
        served.set(card.id, AI_SENTENCE_KEY);
      } else {
        aiExamplePending = true;
      }
    }
    const resolved = found
      ? sentenceTranslationFor(found, language, native, caches.translations)
      : null;
    const translated = resolved?.translation;
    items.push({
      cardId: card.id,
      word: card.text,
      type: card.type,
      stage,
      questionType,
      sentence: fillIn && found ? found.text : card.sentence,
      translation,
      ...(choices ? { choices } : {}),
      ...(fillIn && found
        ? {
            sentenceSource: found.source,
            ...(found.blank ? { sentenceBlank: found.blank } : {}),
            ...(translated ? { sentenceTranslation: translated } : {}),
          }
        : {}),
      ...(resolved?.pending ? { translationPending: true as const } : {}),
      ...(aiExamplePending ? { aiExamplePending: true as const } : {}),
      ...(!fillIn && found
        ? {
            example: {
              text: found.text,
              ...(found.blank ? { blank: found.blank } : {}),
              source: found.source,
              ...(translated ? { translation: translated } : {}),
            },
          }
        : {}),
    });
  }
  if (stale.length > 0)
    refresh(userId, stale).catch((error) => console.error('Meaning refresh error:', error));
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
    const mark = db.prepare('UPDATE wordCards SET lastSentenceKey = ? WHERE userId = ? AND id = ?');
    for (const [cardId, key] of served) mark.run(key, userId, cardId);
  })();
  return { roundId, items };
}
