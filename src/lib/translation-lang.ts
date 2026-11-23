import {
  DEFAULT_NATIVE_LANGUAGE,
  isNativeLanguageCode,
  isValidLanguageCode,
  LANGUAGES,
  NATIVE_LANGUAGES,
} from './languages';

// Mirrored between api/src/lib/translation-lang.ts and src/lib/translation-lang.ts; keep both byte-identical.
export type ScriptGuess = 'ja' | 'ko' | 'zh' | 'ru' | 'ar' | 'hi' | 'bn' | 'el' | 'latin';

const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/u;
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/u;
const HAN = /\p{Script=Han}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const ARABIC = /\p{Script=Arabic}/u;
const DEVANAGARI = /\p{Script=Devanagari}/u;
const BENGALI = /\p{Script=Bengali}/u;
const GREEK = /\p{Script=Greek}/u;
const LATIN = /\p{Script=Latin}/u;

export function guessScript(text: string): ScriptGuess | null {
  if (KANA.test(text)) return 'ja';
  if (HANGUL.test(text)) return 'ko';
  if (HAN.test(text)) return 'zh';
  if (CYRILLIC.test(text)) return 'ru';
  if (ARABIC.test(text)) return 'ar';
  if (DEVANAGARI.test(text)) return 'hi';
  if (BENGALI.test(text)) return 'bn';
  if (GREEK.test(text)) return 'el';
  if (LATIN.test(text)) return 'latin';
  return null;
}

const LATIN_NATIVE = new Set<string>([
  ...NATIVE_LANGUAGES.filter((l) => guessScript(l.native) === 'latin').map((l) => l.code),
  ...Object.values(LANGUAGES)
    .filter((l) => guessScript(l.testPhrase) === 'latin')
    .map((l) => l.code),
]);

function guessMatchesNative(guess: ScriptGuess, native: string): boolean {
  if (guess === 'latin') return LATIN_NATIVE.has(native);
  if (guess === 'zh') return native.startsWith('zh') || native === 'ja';
  if (guess === 'ru') return native === 'ru' || native === 'uk';
  if (guess === 'el') return native === 'el' || native === 'grc';
  return guess === native;
}

/** Valid language tags for a stored vocab meaning: any native language or supported target language. */
export function isSupportedTranslationLang(code: unknown): code is string {
  return isNativeLanguageCode(code) || isValidLanguageCode(code);
}

/** A stored code must equal the expected code; the family label `zh` matches either Chinese variant. */
export function matchesNative(
  translation: string,
  translationLang: string | null | undefined,
  native: string,
): boolean {
  if (translationLang) {
    if (translationLang === 'zh') return native.startsWith('zh');
    return translationLang === native;
  }
  const guess = guessScript(translation);
  return guess === null || guessMatchesNative(guess, native);
}

/** The language to store for a meaning: a valid client claim, else a guess checked against the native language. */
export function resolveTranslationLang(
  translation: string,
  claimed: string | null | undefined,
  native: string,
): string | null {
  if (!translation.trim()) return null;
  if (claimed && isSupportedTranslationLang(claimed)) return claimed;
  const guess = guessScript(translation);
  if (guess === null) return null;
  if (guessMatchesNative(guess, native)) return native;
  return guess === 'latin' ? DEFAULT_NATIVE_LANGUAGE : guess;
}
