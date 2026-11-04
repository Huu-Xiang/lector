import { db } from '../db';
import { normalizeGlossWord } from './gloss-cache';

/** Bump when the example-sentence prompt or model changes enough to invalidate stored sentences. */
export const EXAMPLE_PROMPT_VERSION = 1;

const MAX_SENTENCE_CHARS = 300;
const MAX_TRANSLATION_CHARS = 300;
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export interface ExampleSentence {
  sentence: string;
  /** English translation, or null when the model gave none. */
  translation: string | null;
}

export interface ExampleSentenceCache {
  get(language: string, word: string): ExampleSentence | null;
  put(language: string, word: string, example: ExampleSentence): void;
}

function isSingleLine(text: string, max: number): boolean {
  return text.length > 0 && text.length <= max && !/[\r\n]/.test(text);
}

export function isCacheableExample(example: ExampleSentence): boolean {
  return (
    isSingleLine(example.sentence.trim(), MAX_SENTENCE_CHARS) &&
    (example.translation === null ||
      isSingleLine(example.translation.trim(), MAX_TRANSLATION_CHARS))
  );
}

export const sharedExampleSentenceCache: ExampleSentenceCache = {
  get(language, word) {
    const key = [language, normalizeGlossWord(word), EXAMPLE_PROMPT_VERSION];
    const row = db
      .prepare(
        `SELECT sentence, translation, createdAt FROM shared_example_sentence
         WHERE language = ? AND word = ? AND promptVersion = ?`,
      )
      .get(...key) as
      | { sentence: string; translation: string | null; createdAt: string }
      | undefined;
    if (!row) return null;
    if (Date.now() - Date.parse(row.createdAt) > MAX_AGE_MS) return null;
    db.prepare(
      `UPDATE shared_example_sentence SET hits = hits + 1
       WHERE language = ? AND word = ? AND promptVersion = ?`,
    ).run(...key);
    return { sentence: row.sentence, translation: row.translation };
  },

  put(language, word, example) {
    if (!isCacheableExample(example)) return;
    db.prepare(
      `INSERT OR REPLACE INTO shared_example_sentence
         (language, word, promptVersion, sentence, translation, hits, createdAt)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      language,
      normalizeGlossWord(word),
      EXAMPLE_PROMPT_VERSION,
      example.sentence.trim(),
      example.translation === null ? null : example.translation.trim(),
      new Date().toISOString(),
    );
  },
};
