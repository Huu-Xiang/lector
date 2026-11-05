import { matchesNative } from './translation-lang';

export function savedMeaningFits(
  entry: { translation?: string | null; translationLang?: string | null } | null | undefined,
  native: string,
): boolean {
  const translation = entry?.translation?.trim();
  return !!translation && matchesNative(translation, entry?.translationLang, native);
}

/** English senses that could not be translated stay English; every other source is in the native language. */
export function dictionaryMeaningLang(
  needsLocalization: boolean,
  localized: boolean,
  native: string,
): string {
  return needsLocalization && !localized ? 'en' : native;
}
