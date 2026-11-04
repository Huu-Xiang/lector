import { createHash } from 'crypto';
import { db } from '../db';

/** Bump when the sentence-translation prompt or model changes enough to invalidate stored answers. */
export const SENTENCE_TRANSLATION_PROMPT_VERSION = 1;

export const MAX_SOURCE_SENTENCE_CHARS = 400;
const MAX_TRANSLATION_CHARS = 600;
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export interface SentenceTranslationCache {
  get(language: string, nativeLanguage: string, sentence: string): string | null;
  put(language: string, nativeLanguage: string, sentence: string, translation: string): void;
}

function normalizeSentence(sentence: string): string {
  return sentence.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function sentenceHash(sentence: string): string {
  return createHash('sha256').update(normalizeSentence(sentence)).digest('hex');
}

/** A stored answer must be one non-empty line of bounded length. */
export function isCacheableSentenceTranslation(translation: string): boolean {
  const text = translation.trim();
  return text.length > 0 && text.length <= MAX_TRANSLATION_CHARS && !/[\r\n]/.test(text);
}

export const sharedSentenceTranslationCache: SentenceTranslationCache = {
  get(language, nativeLanguage, sentence) {
    const key = [
      language,
      nativeLanguage,
      sentenceHash(sentence),
      SENTENCE_TRANSLATION_PROMPT_VERSION,
    ];
    const row = db
      .prepare(
        `SELECT translation, createdAt FROM shared_sentence_translation
         WHERE language = ? AND nativeLanguage = ? AND sentenceHash = ? AND promptVersion = ?`,
      )
      .get(...key) as { translation: string; createdAt: string } | undefined;
    if (!row) return null;
    if (Date.now() - Date.parse(row.createdAt) > MAX_AGE_MS) return null;
    db.prepare(
      `UPDATE shared_sentence_translation SET hits = hits + 1
       WHERE language = ? AND nativeLanguage = ? AND sentenceHash = ? AND promptVersion = ?`,
    ).run(...key);
    return row.translation;
  },

  put(language, nativeLanguage, sentence, translation) {
    const source = normalizeSentence(sentence);
    if (source === '' || source.length > MAX_SOURCE_SENTENCE_CHARS) return;
    if (!isCacheableSentenceTranslation(translation)) return;
    db.prepare(
      `INSERT OR REPLACE INTO shared_sentence_translation
         (language, nativeLanguage, sentenceHash, promptVersion, sourceText, translation, hits, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      language,
      nativeLanguage,
      sentenceHash(source),
      SENTENCE_TRANSLATION_PROMPT_VERSION,
      source,
      translation.trim(),
      new Date().toISOString(),
    );
  },
};
