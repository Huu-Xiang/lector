import { acceptLanguageTags, isUiLocale } from '@/i18n/locales';
import type { DemoSetId } from './demo-data';

const SET_BY_LANGUAGE: Record<string, DemoSetId> = {
  zh: 'zh',
  ja: 'ja',
  ko: 'ko',
  ru: 'ru',
  es: 'es',
  fr: 'fr',
};

/** The first tag decides, by its primary subtag. Every other language learns French. */
export function demoSetFor(tags: readonly string[] | null | undefined): DemoSetId {
  const primary = tags?.[0]?.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return SET_BY_LANGUAGE[primary] ?? 'en';
}

/** A valid `NEXT_LOCALE` cookie wins. Without one, the browser languages decide. */
export function demoSetForRequest(
  localeCookie: string | null | undefined,
  acceptLanguage: string | null | undefined,
): { id: DemoSetId; fromCookie: boolean } {
  if (isUiLocale(localeCookie)) return { id: demoSetFor([localeCookie]), fromCookie: true };
  return { id: demoSetFor(acceptLanguageTags(acceptLanguage)), fromCookie: false };
}
