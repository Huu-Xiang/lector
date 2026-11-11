import { completeJson, getProvider, type LLMProvider, type ProviderAccessOptions } from './llm';
import { currentTimingLabel, recordLookupOutcome, withTimingLabel } from './ai-timing';
import { resolveLanguage } from './active-language';
import { getLanguageConfig } from './languages';
import { getNativeLanguageCode, getNativeLanguageName } from './native-language';
import {
  isCacheableGlosses,
  MAX_ENTRY_GLOSS_CHARS,
  MAX_ENTRY_SENSES,
  sharedEntryCache,
  type EntryCache,
} from './entry-cache';
import { lookupWord, type ExpandedDictionaryEntry } from './dictionary-db';
import { buildLocalizePrompt } from './translate-prompts';
import { entitlements, type EntitlementsEngine } from './entitlements';
import {
  localizeDailyLimiter,
  translationBurstLimiter,
  type TranslationBurstLimiter,
} from './rate-limit';

export interface LocalizeDeps {
  providerForUser: (userId: string, access: ProviderAccessOptions) => LLMProvider;
  engine: EntitlementsEngine;
  rateLimiter: TranslationBurstLimiter;
  dailyLocalizeLimiter: TranslationBurstLimiter;
  entryCache: EntryCache | null;
  lookupEntry: (
    userId: string,
    word: string,
    language: string,
  ) => ExpandedDictionaryEntry | null | undefined;
}

export const defaultLocalizeDeps: LocalizeDeps = {
  providerForUser: getProvider,
  engine: entitlements,
  rateLimiter: translationBurstLimiter,
  dailyLocalizeLimiter: localizeDailyLimiter,
  entryCache: sharedEntryCache,
  lookupEntry: lookupWord,
};

export interface LocalizedSense {
  partOfSpeech: string;
  gloss: string;
}

export type LocalizeOutcome =
  | { status: 'none' }
  | { status: 'limited' }
  | { status: 'miss' }
  | { status: 'ok'; senses: LocalizedSense[]; nativeCode: string };

/** The dictionary entry whose English senses `localizeEntry` would translate, or null. */
export function localizableEntry(
  deps: Pick<LocalizeDeps, 'lookupEntry'>,
  userId: string,
  word: string,
  language: string,
): ExpandedDictionaryEntry | null {
  const nativeCode = getNativeLanguageCode(userId);
  if (nativeCode === 'en' || nativeCode === language) return null;
  const entry = deps.lookupEntry(userId, word, language);
  if (!entry || entry.source === 'cache' || entry.senseLanguage || entry.senses.length === 0) {
    return null;
  }
  return entry;
}

/**
 * Translates a dictionary entry's senses into the learner's language through the shared entry
 * cache. It never reserves the monthly allowance; only the burst limits apply. With `cacheOnly`
 * a cache miss returns `miss` and calls no provider. Throws when the provider fails.
 */
export async function localizeEntry(
  deps: LocalizeDeps,
  userId: string,
  word: string,
  languageHint?: string,
  options: { cacheOnly?: boolean } = {},
): Promise<LocalizeOutcome> {
  const label = currentTimingLabel() ?? 'localize';
  const lang = resolveLanguage(languageHint, userId);
  const nativeCode = getNativeLanguageCode(userId);
  const entry = localizableEntry(deps, userId, word, lang);
  if (!entry) return { status: 'none' };
  const source = entry.senses.slice(0, MAX_ENTRY_SENSES).map((sense) => ({
    partOfSpeech: sense.partOfSpeech,
    gloss: sense.gloss.slice(0, MAX_ENTRY_GLOSS_CHARS),
  }));
  const withGlosses = (glosses: string[]): LocalizeOutcome => ({
    status: 'ok',
    nativeCode,
    senses: source.map((sense, i) => ({ ...sense, gloss: glosses[i] })),
  });

  // Inflected forms share the base word's senses, so they share its cache row.
  const headword = entry.lemmaInfo?.stem ?? entry.word;
  const cached = deps.entryCache?.get(lang, nativeCode, headword) ?? null;
  if (cached && cached.length === source.length) {
    if (!options.cacheOnly) recordLookupOutcome(label, 'hit');
    return withGlosses(cached);
  }

  if (options.cacheOnly) return { status: 'miss' };

  // Not metered: a shared answer serves every later reader, so the total cost is
  // bounded by the dictionary size. Only a burst limit stops one account from
  // draining it.
  const byok = deps.engine.resolveEntitlements(userId).byok;
  if (
    !byok &&
    (!deps.rateLimiter.tryConsume(userId, 'localize') ||
      !deps.dailyLocalizeLimiter.tryConsume(userId, 'localize'))
  ) {
    return { status: 'limited' };
  }
  recordLookupOutcome(label, 'miss');

  const result = await withTimingLabel(label, () =>
    completeJson<{ glosses?: unknown }>(deps.providerForUser(userId, { byok }), {
      messages: [
        {
          role: 'user',
          content: buildLocalizePrompt(
            getLanguageConfig(lang).name,
            getNativeLanguageName(userId),
            entry.word,
            source.map((sense) => sense.gloss),
          ),
        },
      ],
      maxTokens: 700,
      task: 'word-gloss',
    }),
  );
  if (!isCacheableGlosses(result.glosses, source.length)) {
    throw new Error('Localization returned an unexpected shape');
  }
  if (!byok) deps.entryCache?.put(lang, nativeCode, headword, result.glosses);
  return withGlosses(result.glosses);
}
