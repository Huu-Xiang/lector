import type { WordState } from '@/types';
import type { LanguageConfig } from '../../languages/types';
import { foldWord, lookupByVocabKeys, tokenizeWords } from './languages';

/** Words offered to the server per lesson; the server keeps fewer. */
export const PREFETCH_MAX_CANDIDATES = 40;
/** Start of the lesson that counts as the visible first part. */
export const PREFETCH_TEXT_CHARS = 1800;
const MIN_WORD_CHARS = 3;
const SKIPPED_STATES = new Set<WordState>(['known', 'ignored']);

/** Unknown words from the start of a lesson, in reading order, one per folded form. */
export function pickPrefetchCandidates(
  text: string,
  pack: LanguageConfig,
  wordStates: Map<string, WordState>,
  limit = PREFETCH_MAX_CANDIDATES,
): string[] {
  if (pack.script.kind === 'cjk-unspaced') return [];
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const token of tokenizeWords(text.slice(0, PREFETCH_TEXT_CHARS), pack)) {
    if (picked.length >= limit) break;
    const folded = foldWord(token.text, pack);
    if (folded.length < MIN_WORD_CHARS || /\d/.test(folded) || seen.has(folded)) continue;
    seen.add(folded);
    const state = lookupByVocabKeys(wordStates, token.text, pack);
    if (state && SKIPPED_STATES.has(state)) continue;
    picked.push(token.text);
  }
  return picked;
}
