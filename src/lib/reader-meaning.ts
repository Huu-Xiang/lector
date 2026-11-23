import { matchesNative } from './translation-lang';

export function expectedMeaningLanguage(
  targetLanguage: string,
  nativeLanguage: string,
  monolingual: boolean,
): string {
  return monolingual ? targetLanguage : nativeLanguage;
}

/**
 * In monolingual mode, English lessons use built-in English `dictionary-en.db`
 * senses directly at zero AI cost; every other target language routes past
 * bilingual curated senses to monolingual AI glosses while keeping the curated
 * dictionary collapsed as secondary reference (R7).
 */
export function shouldUseMonolingualAiGloss(
  targetLanguage: string,
  monolingual: boolean,
): boolean {
  return monolingual && targetLanguage !== 'en';
}

export function savedMeaningFits(
  entry: { translation?: string | null; translationLang?: string | null } | null | undefined,
  expectedLang: string,
): boolean {
  const translation = entry?.translation?.trim();
  return !!translation && matchesNative(translation, entry?.translationLang, expectedLang);
}

/**
 * True only when a saved vocab row holds a stale fallback (such as an unlocalized
 * English dictionary gloss from a failed bilingual lookup) that a bilingual reader
 * click may safely repair. Never overwrites saved bilingual or monolingual meanings
 * across mode switches (R8 / AE3).
 */
export function shouldAutoReplaceSavedMeaning(
  entry:
    | {
        translation?: string | null;
        translationLang?: string | null;
        translationSource?: string | null;
      }
    | null
    | undefined,
  targetLanguage: string,
  nativeLanguage: string,
  monolingual: boolean,
): boolean {
  if (!entry || monolingual) return false;
  if (savedMeaningFits(entry, nativeLanguage)) return false;
  if (
    entry.translation?.trim() &&
    entry.translationLang === targetLanguage &&
    (targetLanguage !== 'en' ||
      (entry.translationSource != null && entry.translationSource !== 'dictionary'))
  ) {
    return false;
  }
  return true;
}

/** English senses that could not be translated stay English; every other source is in the expected language. */
export function dictionaryMeaningLang(
  needsLocalization: boolean,
  localized: boolean,
  expectedLang: string,
): string {
  return needsLocalization && !localized ? 'en' : expectedLang;
}
