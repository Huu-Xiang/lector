/**
 * Client-side dictionary lookup. Calls /api/dictionary/lookup, which queries
 * the SQLite dictionary for the active language (built by
 * scripts/build-dictionary.ts).
 *
 * Returns the rich entry shape on a hit, or null on a miss — callers should
 * fall back to the AI translate API when null.
 */
import { getActiveLanguage, getActivePack } from './data-layer';
import { foldWord } from './languages';
import { apiFetch, hasAiRequestGuard } from './api-base';
import { AI_USAGE_EVENT } from '@/constants/storage';

export interface ExpandedDictionaryEntry {
  word: string;
  rank?: number;
  ipa?: string;
  etymology?: string;
  senses: Array<{ partOfSpeech: string; gloss: string }>;
  relatedForms?: Array<{ form: string; relation: string }>;
  lemmaInfo?: { stem: string; label: string };
  /** `dict` = built-in kaikki dict, `cache` = user-learned AI translation. */
  source?: 'dict' | 'cache';
  /** The meanings are English and `/api/translate/localize` can turn them into the reader's language. */
  needsLocalization?: boolean;
  /** Set when `senses` are already in the learner's own language. */
  senseLanguage?: string;
  /** The English definitions, kept beside translated `senses`. */
  englishSenses?: Array<{ partOfSpeech: string; gloss: string }>;
  examples?: Array<{ text: string; translation?: string }>;
  tags?: string[];
  collins?: number;
  oxford?: boolean;
}

/**
 * The same word can have different senses or localization hints for different
 * pairs of study and translation languages. Cleared on page reload, so memory is bounded by
 * how many distinct words the user looks up in one session (typically <500).
 */
const sessionCache = new Map<string, ExpandedDictionaryEntry | null>();

export async function lookupWordRemote(
  word: string,
  native: string,
): Promise<ExpandedDictionaryEntry | null> {
  const language = getActiveLanguage();
  const key = `${language}:${native}:${foldWord(word, getActivePack())}`;
  if (sessionCache.has(key)) {
    return sessionCache.get(key) ?? null;
  }

  const url = `/api/dictionary/lookup?word=${encodeURIComponent(word)}&language=${language}`;
  const res = await apiFetch(url);
  if (!res.ok) {
    // Don't cache transport errors — let the next click retry.
    return null;
  }
  const data = await res.json();
  const entry: ExpandedDictionaryEntry | null = data.entry ?? null;
  sessionCache.set(key, entry);
  return entry;
}

type LocalizedSenses = Array<{ partOfSpeech: string; gloss: string }>;

const PREFETCH_CACHE_MAX = 500;
const LOCALIZE_TIMEOUT_MS = 8000;
const LOCALIZE_TIMEOUT = Symbol('localization timeout');

async function waitForSenses(
  result: Promise<LocalizedSenses | null>,
  onLate?: (senses: LocalizedSenses) => void,
): Promise<LocalizedSenses | null | typeof LOCALIZE_TIMEOUT> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const settled = await Promise.race([
      result,
      new Promise<typeof LOCALIZE_TIMEOUT>((resolve) => {
        timeout = setTimeout(() => resolve(LOCALIZE_TIMEOUT), LOCALIZE_TIMEOUT_MS);
      }),
    ]);
    if (settled === LOCALIZE_TIMEOUT && onLate) {
      void result
        .then((senses) => {
          if (senses) onLate(senses);
        })
        .catch(() => {});
    }
    return settled;
  } finally {
    clearTimeout(timeout);
  }
}

/** Prefetched translations by `${language}:${native}:${folded word}`, oldest dropped first. */
const prefetchedSenses = new Map<string, LocalizedSenses>();
/** Words in a running prefetch request; each settles to the senses, or null on a miss. */
const inflightPrefetch = new Map<string, Promise<LocalizedSenses | null>>();

function prefetchKey(word: string, native: string): string {
  return `${getActiveLanguage()}:${native}:${foldWord(word, getActivePack())}`;
}

function rememberPrefetched(key: string, senses: LocalizedSenses): void {
  prefetchedSenses.delete(key);
  prefetchedSenses.set(key, senses);
  while (prefetchedSenses.size > PREFETCH_CACHE_MAX) {
    const oldest = prefetchedSenses.keys().next().value;
    if (oldest === undefined) break;
    prefetchedSenses.delete(oldest);
  }
}

/** Test hook: forget every prefetched and in-flight word. */
export function resetPrefetchState(): void {
  prefetchedSenses.clear();
  inflightPrefetch.clear();
}

/** Asks the server to translate likely lookups ahead of a tap; failures are silent. */
export async function prefetchLocalizedSenses(words: string[], native: string): Promise<void> {
  if (words.length === 0 || hasAiRequestGuard()) return;
  const pending = new Map<string, (senses: LocalizedSenses | null) => void>();
  const sent: string[] = [];
  for (const word of words) {
    const key = prefetchKey(word, native);
    if (prefetchedSenses.has(key) || inflightPrefetch.has(key)) continue;
    inflightPrefetch.set(
      key,
      new Promise((resolve) => {
        pending.set(key, resolve);
      }),
    );
    sent.push(word);
  }
  if (sent.length === 0) return;
  try {
    const res = await apiFetch('/api/translate/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: sent, language: getActiveLanguage() }),
      silentPlanLimit: true,
    });
    if (!res.ok) return;
    const data = (await res.json()) as { senses?: Record<string, LocalizedSenses> };
    for (const [word, senses] of Object.entries(data.senses ?? {})) {
      if (Array.isArray(senses) && senses.length > 0) {
        rememberPrefetched(prefetchKey(word, native), senses);
      }
    }
  } catch {
    /* a missed prefetch only costs the normal wait */
  } finally {
    for (const [key, resolve] of pending) {
      inflightPrefetch.delete(key);
      resolve(prefetchedSenses.get(key) ?? null);
    }
  }
}

/** Wait briefly for localized senses, then allow the caller to show a fallback. */
export async function localizeEntrySenses(
  word: string,
  native = '',
  onLate?: (senses: LocalizedSenses) => void,
): Promise<LocalizedSenses | null> {
  const key = prefetchKey(word, native);
  const prefetched = prefetchedSenses.get(key);
  if (prefetched) return prefetched;
  const inflight = inflightPrefetch.get(key);
  if (inflight) {
    const settled = await waitForSenses(inflight, onLate);
    if (settled === LOCALIZE_TIMEOUT) return null;
    if (settled) return settled;
  }

  const request = async () => {
    try {
      const res = await apiFetch('/api/translate/localize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, language: getActiveLanguage() }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { senses: LocalizedSenses | null };
      if (data.senses && typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AI_USAGE_EVENT));
      }
      return data.senses;
    } catch {
      return null;
    }
  };
  const settled = await waitForSenses(request(), onLate);
  return settled === LOCALIZE_TIMEOUT ? null : settled;
}

/** Drop a single cached entry (call after editing the dict to force a re-fetch).
 *  Invalidate the word across every study and translation language. */
export function invalidateLookupCache(word?: string): void {
  if (word === undefined) {
    sessionCache.clear();
    return;
  }
  const suffix = `:${foldWord(word, getActivePack())}`;
  for (const key of sessionCache.keys()) {
    if (key.endsWith(suffix)) sessionCache.delete(key);
  }
}

export interface CacheAcceptedTranslationInput {
  word: string;
  senses: Array<{ partOfSpeech: string; gloss: string }>;
  ipa?: string;
  etymology?: string;
  relatedForms?: Array<{ form: string; relation: string }>;
  sourceSentence?: string;
  language?: string;
}

/**
 * Persist an accepted AI translation into the on-device cache (lector.db).
 * Called from the read page when the user saves to vocab / marks known /
 * sets a learning level — actions that signal trust in the translation.
 *
 * Fire-and-forget: we don't block the UI on the write. Errors are logged.
 * The session lookup cache is invalidated for the word so the next click
 * re-fetches and picks up the freshly-cached entry (now with `source: 'cache'`).
 */
export async function cacheAcceptedTranslation(
  input: CacheAcceptedTranslationInput,
): Promise<void> {
  if (!input.word || !input.senses?.length) return;
  invalidateLookupCache(input.word);
  try {
    const res = await apiFetch('/api/dictionary/cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('cacheAcceptedTranslation failed:', err);
    }
  } catch (err) {
    console.warn('cacheAcceptedTranslation network error:', err);
  }
}

/**
 * Convenience: collapse an entry's first sense into the legacy
 * `{ translation, partOfSpeech }` shape used by older code paths.
 */
export function entryToLegacyTranslation(entry: ExpandedDictionaryEntry): {
  translation: string;
  partOfSpeech: string | null;
} {
  const first = entry.senses[0];
  const allGlosses = entry.senses.map((s) => s.gloss).join('; ');
  return {
    translation: allGlosses || first?.gloss || '',
    partOfSpeech: first?.partOfSpeech || null,
  };
}
