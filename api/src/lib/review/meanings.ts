import { db } from '../../db';
import { lookupWord, type ExpandedDictionaryEntry } from '../dictionary-db';
import { getNativeLanguageCode } from '../native-language';

export const CHOICE_COUNT = 4;
const CANDIDATE_LIMIT = 12;

export type SenseLookup = (userId: string, word: string, language: string) => string | null;

export function foldMeaning(meaning: string): string {
  return meaning
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:!?…。，；：！？、]+$/u, '');
}

export function senseFromEntry(
  entry: Pick<ExpandedDictionaryEntry, 'senses' | 'senseLanguage'> | undefined,
  nativeCode: string,
): string | null {
  if (!entry) return null;
  const native = nativeCode.toLowerCase();
  const inNative = entry.senseLanguage
    ? entry.senseLanguage.toLowerCase() === (native.startsWith('zh') ? 'zh-cn' : native)
    : native === 'en';
  if (!inNative) return null;
  return entry.senses[0]?.gloss.trim() || null;
}

export const dictionarySense: SenseLookup = (userId, word, language) =>
  senseFromEntry(lookupWord(userId, word, language), getNativeLanguageCode(userId));

export function fillMeaning(
  userId: string,
  vocabId: string,
  word: string,
  language: string,
  lookup: SenseLookup,
): string | null {
  const sense = lookup(userId, word, language);
  if (!sense) return null;
  db.prepare(
    'UPDATE vocab SET translation = ?, translationLang = ? WHERE userId = ? AND id = ?',
  ).run(sense, getNativeLanguageCode(userId), userId, vocabId);
  return sense;
}

export interface MeaningCard {
  id: string;
  text: string;
  translation: string;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function chooseMeanings(
  correct: MeaningCard,
  pool: readonly MeaningCard[],
): string[] | null {
  const seen = new Set([foldMeaning(correct.translation)]);
  const candidates: string[] = [];
  for (const other of pool) {
    if (other.id === correct.id) continue;
    const folded = foldMeaning(other.translation);
    if (!folded || seen.has(folded)) continue;
    seen.add(folded);
    candidates.push(other.translation.trim());
  }
  if (candidates.length < CHOICE_COUNT - 1) return null;
  const length = Array.from(correct.translation.trim()).length;
  const gap = (text: string) => Math.abs(Array.from(text).length - length);
  const nearest = candidates.sort((a, b) => gap(a) - gap(b)).slice(0, CANDIDATE_LIMIT);
  const picked = shuffle(nearest).slice(0, CHOICE_COUNT - 1);
  return shuffle([correct.translation.trim(), ...picked]);
}
