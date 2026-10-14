export interface NativeLanguage {
  code: string;
  /** English name, used inside prompts. */
  name: string;
  native: string;
}

export const DEFAULT_NATIVE_LANGUAGE = 'en';

export const NATIVE_LANGUAGES: readonly NativeLanguage[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'zh-CN', name: 'Simplified Chinese', native: '简体中文' },
  { code: 'zh-TW', name: 'Traditional Chinese', native: '繁體中文' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
];

export function isNativeLanguageCode(code: unknown): code is string {
  return typeof code === 'string' && NATIVE_LANGUAGES.some((l) => l.code === code);
}

/** Prompt name for a stored code; unknown or missing codes mean English. */
export function nativeLanguageName(code: string | null | undefined): string {
  return NATIVE_LANGUAGES.find((l) => l.code === code)?.name ?? 'English';
}

/** Best supported native language for a browser locale such as `zh-Hans-CN`. */
export function nativeLanguageFromLocale(locale: string | null | undefined): string {
  if (!locale) return DEFAULT_NATIVE_LANGUAGE;
  const lower = locale.toLowerCase();
  if (lower.startsWith('zh')) {
    return /-(tw|hk|mo|hant)/.test(lower) ? 'zh-TW' : 'zh-CN';
  }
  const base = lower.split('-')[0];
  return NATIVE_LANGUAGES.find((l) => l.code === base)?.code ?? DEFAULT_NATIVE_LANGUAGE;
}
