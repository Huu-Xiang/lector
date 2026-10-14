import { db } from '../db';

/** Bump when the gloss prompt or model changes enough to invalidate stored answers. */
export const GLOSS_PROMPT_VERSION = 1;

const MAX_GLOSS_CHARS = 120;
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export interface GlossCache {
  get(language: string, nativeLanguage: string, word: string): string | null;
  put(language: string, nativeLanguage: string, word: string, gloss: string): void;
}

export function normalizeGlossWord(word: string): string {
  return word.normalize('NFC').trim().toLowerCase();
}

/** A stored answer must be a short single-line gloss, not an error or a rambling reply. */
export function isCacheableGloss(gloss: string): boolean {
  const text = gloss.trim();
  return text.length > 0 && text.length <= MAX_GLOSS_CHARS && !/[\r\n]/.test(text);
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
    if (!isCacheableGloss(gloss)) return;
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
