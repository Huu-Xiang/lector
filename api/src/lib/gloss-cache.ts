import { db } from '../db';

/** Bump when the gloss prompt or model changes enough to invalidate stored answers. */
export const GLOSS_PROMPT_VERSION = 2;

export const MAX_GLOSS_CHARS = 120;
export const MAX_MONOLINGUAL_GLOSS_CHARS = 240;
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export interface GlossCache {
  get(language: string, nativeLanguage: string, word: string): string | null;
  put(language: string, nativeLanguage: string, word: string, gloss: string): void;
}

export function normalizeGlossWord(word: string): string {
  return word.normalize('NFC').trim().toLowerCase();
}

export function isMonolingualCacheNamespace(nativeLanguage: string): boolean {
  return nativeLanguage.startsWith('mono:');
}

export function maxGlossCharsFor(nativeLanguage?: string): number {
  return nativeLanguage && isMonolingualCacheNamespace(nativeLanguage)
    ? MAX_MONOLINGUAL_GLOSS_CHARS
    : MAX_GLOSS_CHARS;
}

/** A stored answer must be a short single-line gloss, not an error or a rambling reply. */
export function isCacheableGloss(gloss: string, maxChars = MAX_GLOSS_CHARS): boolean {
  const text = gloss.trim();
  return text.length > 0 && text.length <= maxChars && !/[\r\n]/.test(text);
}

export const sharedGlossCache: GlossCache = {
  get(language, nativeLanguage, word) {
    const key = [language, nativeLanguage, normalizeGlossWord(word), GLOSS_PROMPT_VERSION];
    const row = db
      .prepare(
        `SELECT gloss, createdAt FROM shared_gloss_cache
         WHERE language = ? AND nativeLanguage = ? AND word = ? AND promptVersion = ?`,
      )
      .get(...key) as { gloss: string; createdAt: string } | undefined;
    if (!row) return null;
    if (Date.now() - Date.parse(row.createdAt) > MAX_AGE_MS) return null;
    db.prepare(
      `UPDATE shared_gloss_cache SET hits = hits + 1
       WHERE language = ? AND nativeLanguage = ? AND word = ? AND promptVersion = ?`,
    ).run(...key);
    return row.gloss;
  },

  put(language, nativeLanguage, word, gloss) {
    if (!isCacheableGloss(gloss, maxGlossCharsFor(nativeLanguage))) return;
    db.prepare(
      `INSERT OR REPLACE INTO shared_gloss_cache
         (language, nativeLanguage, word, promptVersion, gloss, hits, createdAt)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      language,
      nativeLanguage,
      normalizeGlossWord(word),
      GLOSS_PROMPT_VERSION,
      gloss.trim(),
      new Date().toISOString(),
    );
  },
};
