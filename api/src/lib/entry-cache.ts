import { db } from '../db';
import { normalizeGlossWord } from './gloss-cache';

/** Bump when the localize prompt or model changes enough to invalidate stored answers. */
export const ENTRY_PROMPT_VERSION = 1;

export const MAX_ENTRY_SENSES = 12;
export const MAX_ENTRY_GLOSS_CHARS = 300;
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export interface EntryCache {
  /** Translated glosses, one per source sense, in source order. */
  get(language: string, nativeLanguage: string, word: string): string[] | null;
  put(language: string, nativeLanguage: string, word: string, glosses: string[]): void;
}

export function isCacheableGlosses(glosses: unknown, expected: number): glosses is string[] {
  return (
    Array.isArray(glosses) &&
    glosses.length === expected &&
    glosses.every(
      (gloss) =>
        typeof gloss === 'string' &&
        gloss.trim().length > 0 &&
        gloss.length <= MAX_ENTRY_GLOSS_CHARS &&
        !/[\r\n]/.test(gloss),
    )
  );
}

export const sharedEntryCache: EntryCache = {
  get(language, nativeLanguage, word) {
    const key = [language, nativeLanguage, normalizeGlossWord(word), ENTRY_PROMPT_VERSION];
    const row = db
      .prepare(
        `SELECT glosses, createdAt FROM shared_entry_cache
         WHERE language = ? AND nativeLanguage = ? AND word = ? AND promptVersion = ?`,
      )
      .get(...key) as { glosses: string; createdAt: string } | undefined;
    if (!row || Date.now() - Date.parse(row.createdAt) > MAX_AGE_MS) return null;
    let glosses: unknown;
    try {
      glosses = JSON.parse(row.glosses);
    } catch {
      return null;
    }
    if (!isCacheableGlosses(glosses, Array.isArray(glosses) ? glosses.length : -1)) return null;
    db.prepare(
      `UPDATE shared_entry_cache SET hits = hits + 1
       WHERE language = ? AND nativeLanguage = ? AND word = ? AND promptVersion = ?`,
    ).run(...key);
    return glosses;
  },

  put(language, nativeLanguage, word, glosses) {
    if (!isCacheableGlosses(glosses, glosses.length) || glosses.length === 0) return;
    db.prepare(
      `INSERT OR REPLACE INTO shared_entry_cache
         (language, nativeLanguage, word, promptVersion, glosses, hits, createdAt)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      language,
      nativeLanguage,
      normalizeGlossWord(word),
      ENTRY_PROMPT_VERSION,
      JSON.stringify(glosses.map((gloss) => gloss.trim())),
      new Date().toISOString(),
    );
  },
};
