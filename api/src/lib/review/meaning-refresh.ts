import { db } from '../../db';
import {
  localizableEntry,
  localizeEntry,
  defaultLocalizeDeps,
  type LocalizeDeps,
} from '../localize-entry';
import { getNativeLanguageCode } from '../native-language';
import { matchesNative } from '../translation-lang';
import { vocabRowsByKey } from './word-card-rows';

export const MAX_REFRESH_PER_FETCH = 10;

export interface RefreshTarget {
  word: string;
  wordKey: string;
  language: string;
}

export type MeaningRefresh = (userId: string, targets: readonly RefreshTarget[]) => Promise<void>;

const inFlight = new Set<string>();

function applyMeaning(
  userId: string,
  target: RefreshTarget,
  translation: string,
  nativeCode: string,
): number {
  if (getNativeLanguageCode(userId) !== nativeCode || translation.trim() === '') return 0;
  const read = db.prepare(
    'SELECT translation, translationLang FROM vocab WHERE userId = ? AND id = ?',
  );
  const write = db.prepare(
    'UPDATE vocab SET translation = ?, translationLang = ? WHERE userId = ? AND id = ?',
  );
  let changed = 0;
  for (const { id } of vocabRowsByKey(userId, target.language).get(target.wordKey) ?? []) {
    const row = read.get(userId, id) as
      | { translation: string; translationLang: string | null }
      | undefined;
    if (!row || matchesNative(row.translation, row.translationLang, nativeCode)) continue;
    write.run(translation, nativeCode, userId, id);
    changed++;
  }
  return changed;
}

/**
 * Translates the dictionary senses of saved words whose meaning is in another language.
 * Uses the shared entry cache and the burst limits of the localize route; never the monthly allowance.
 */
export function createMeaningRefresh(
  deps: LocalizeDeps = defaultLocalizeDeps,
  cap = MAX_REFRESH_PER_FETCH,
): MeaningRefresh {
  return async (userId, targets) => {
    const chosen: Array<{ target: RefreshTarget; key: string }> = [];
    for (const target of targets) {
      if (chosen.length >= cap) break;
      const key = `${userId}\0${target.language}\0${target.wordKey}`;
      if (inFlight.has(key) || chosen.some((item) => item.key === key)) continue;
      if (!localizableEntry(deps, userId, target.word, target.language)) continue;
      chosen.push({ target, key });
    }
    for (const { key } of chosen) inFlight.add(key);
    for (const { target, key } of chosen) {
      try {
        const outcome = await localizeEntry(deps, userId, target.word, target.language);
        if (outcome.status === 'limited') {
          console.warn('Meaning refresh stopped: localize burst limit reached');
          break;
        }
        if (outcome.status === 'ok') {
          const translation = outcome.senses.map((sense) => sense.gloss).join('; ');
          applyMeaning(userId, target, translation, outcome.nativeCode);
        }
      } catch (error) {
        console.error('Meaning refresh error:', error);
      } finally {
        inFlight.delete(key);
      }
    }
    for (const { key } of chosen) inFlight.delete(key);
  };
}

export const scheduleMeaningRefresh = createMeaningRefresh();
