import { UI_LOCALES } from '@/i18n/locales';
import { nativeLanguageFromLocale } from './languages';

/**
 * The language of book titles, descriptions, review sites and exam labels.
 * It follows the interface language when the translation language is one the
 * interface offers. A translation language without an interface (such as
 * German) is shown as chosen.
 */
/** The text for a language; Traditional Chinese uses the Simplified text when it has none of its own. */
export function translationFor(map: Record<string, string>, code: string): string | undefined {
  return map[code] ?? (code === 'zh-TW' ? map['zh-CN'] : undefined);
}

export function displayLanguage(native: string, locale: string): string {
  const offered = UI_LOCALES.some((l) => nativeLanguageFromLocale(l.code) === native);
  return offered ? nativeLanguageFromLocale(locale) : native;
}
