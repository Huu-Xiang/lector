import { withTimingLabel } from './ai-timing';
import { resolveLanguage } from './active-language';
import { getNativeLanguageCode } from './native-language';
import { readLearnerLevel } from './review/queue';
import {
  localizableEntry,
  localizeEntry,
  type LocalizeDeps,
  type LocalizedSense,
} from './localize-entry';
import { prefetchDailyLimiter, type TranslationBurstLimiter } from './rate-limit';

/** Words the client may offer per request. */
export const PREFETCH_MAX_CANDIDATES = 40;
/** Words the server keeps after the level and dictionary filters. */
export const PREFETCH_MAX_WORDS = 12;
/** New AI translations one request may start; the client sends one request per lesson. */
export const PREFETCH_MAX_AI_PER_REQUEST = 4;

/** Rank at which a word leaves the learner's band; ranks come from the dictionary. */
const LEVEL_RANK_FLOOR: Record<string, number> = {
  A1: 500,
  A2: 1500,
  B1: 3000,
  B2: 5000,
  C1: 8000,
  C2: 12000,
};
export const DEFAULT_RANK_FLOOR = 1000;

/** `LOOKUP_PREFETCH=0` turns the feature off. */
export function prefetchEnabled(): boolean {
  return process.env.LOOKUP_PREFETCH !== '0';
}

export function rankFloorForLevel(level: string | null): number {
  return (level && LEVEL_RANK_FLOOR[level.toUpperCase()]) || DEFAULT_RANK_FLOOR;
}

export interface PrefetchCandidate {
  word: string;
  /** Dictionary frequency rank; absent for unranked words. */
  rank?: number;
}

/** Keeps candidates in order, drops ones inside the learner's band, stops at `limit`. */
export function selectPrefetchWords(
  candidates: PrefetchCandidate[],
  rankFloor: number,
  limit = PREFETCH_MAX_WORDS,
): string[] {
  const picked: string[] = [];
  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    if (candidate.rank !== undefined && candidate.rank <= rankFloor) continue;
    picked.push(candidate.word);
  }
  return picked;
}

export interface PrefetchDeps extends LocalizeDeps {
  prefetchDailyLimiter?: TranslationBurstLimiter;
}

export interface PrefetchResult {
  senses: Map<string, LocalizedSense[]>;
  /** Words that needed a new AI translation and got one. */
  translated: number;
}

/**
 * Translates dictionary senses ahead of a tap. Cached answers come first. New AI calls are
 * capped per request and per day, and never run on the user's own key. The monthly allowance is
 * never reserved, as in `localizeEntry`.
 */
export function prefetchLocalizations(
  deps: PrefetchDeps,
  userId: string,
  words: string[],
  languageHint?: string,
): Promise<PrefetchResult> {
  return withTimingLabel('prefetch', () => runPrefetch(deps, userId, words, languageHint));
}

async function runPrefetch(
  deps: PrefetchDeps,
  userId: string,
  words: string[],
  languageHint?: string,
): Promise<PrefetchResult> {
  const result: PrefetchResult = { senses: new Map(), translated: 0 };
  if (!prefetchEnabled()) return result;

  const lang = resolveLanguage(languageHint, userId);
  const nativeCode = getNativeLanguageCode(userId);
  if (nativeCode === 'en' || nativeCode === lang) return result;

  const candidates: PrefetchCandidate[] = [];
  const headwords = new Map<string, string>();
  for (const word of new Set(words.slice(0, PREFETCH_MAX_CANDIDATES))) {
    const entry = localizableEntry(deps, userId, word, lang);
    if (!entry) continue;
    candidates.push({ word, rank: entry.rank });
    headwords.set(word, entry.lemmaInfo?.stem ?? entry.word);
  }
  const floor = rankFloorForLevel(readLearnerLevel(userId, lang));
  const selected = selectPrefetchWords(candidates, floor);

  const misses: string[] = [];
  const queued = new Set<string>();
  for (const word of selected) {
    const outcome = await localizeEntry(deps, userId, word, lang, { cacheOnly: true });
    if (outcome.status === 'ok') result.senses.set(word, outcome.senses);
    else if (outcome.status === 'miss') {
      const headword = headwords.get(word) ?? word;
      if (queued.has(headword)) continue;
      queued.add(headword);
      misses.push(word);
    }
  }

  const byok = deps.engine.resolveEntitlements(userId).byok;
  if (byok || misses.length === 0) return result;
  if (!deps.rateLimiter.tryConsume(userId, 'prefetch')) return result;

  const dailyLimiter = deps.prefetchDailyLimiter ?? prefetchDailyLimiter;
  const toTranslate: string[] = [];
  for (const word of misses.slice(0, PREFETCH_MAX_AI_PER_REQUEST)) {
    if (!dailyLimiter.tryConsume(userId, 'prefetch')) break;
    toTranslate.push(word);
  }
  const settled = await Promise.allSettled(
    toTranslate.map((word) => localizeEntry(deps, userId, word, lang)),
  );
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled' && outcome.value.status === 'ok') {
      result.senses.set(toTranslate[i], outcome.value.senses);
      result.translated += 1;
    }
  });
  return result;
}
