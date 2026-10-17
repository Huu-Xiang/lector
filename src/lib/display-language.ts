import { UI_LOCALES } from '@/i18n/locales';
import { nativeLanguageFromLocale } from './languages';

/**
 * The language of book titles, descriptions, review sites and exam labels.
 * It follows the interface language when the translation language is one the
 * interface offers. A translation language without an interface (such as
 * Japanese) is shown as chosen.
 */
export function displayLanguage(native: string, locale: string): string {
  const offered = UI_LOCALES.some((l) => nativeLanguageFromLocale(l.code) === native);
  return offered ? nativeLanguageFromLocale(locale) : native;
}
