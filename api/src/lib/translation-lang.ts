import { DEFAULT_NATIVE_LANGUAGE, isNativeLanguageCode } from './languages';

// Mirrored in src/lib/translation-lang.ts; keep both in step.
export type ScriptGuess = 'ja' | 'ko' | 'zh' | 'ru' | 'ar' | 'hi' | 'latin';

const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/u;
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/u;
const HAN = /\p{Script=Han}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const ARABIC = /\p{Script=Arabic}/u;
const DEVANAGARI = /\p{Script=Devanagari}/u;
const LATIN = /\p{Script=Latin}/u;

export function guessScript(text: string): ScriptGuess | null {
  if (KANA.test(text)) return 'ja';
  if (HANGUL.test(text)) return 'ko';
  if (HAN.test(text)) return 'zh';
  if (CYRILLIC.test(text)) return 'ru';
  if (ARABIC.test(text)) return 'ar';
  if (DEVANAGARI.test(text)) return 'hi';
  if (LATIN.test(text)) return 'latin';
  return null;
}

const LATIN_NATIVE = new Set(['en', 'fr', 'es', 'de', 'it', 'pt', 'id', 'vi', 'tr']);

function guessMatchesNative(guess: ScriptGuess, native: string): boolean {
  if (guess === 'latin') return LATIN_NATIVE.has(native);
  if (guess === 'zh') return native.startsWith('zh') || native === 'ja';
  return guess === native;
}

/** A stored code must equal the native code; the family label `zh` matches either Chinese variant. */
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
  if (claimed && isNativeLanguageCode(claimed)) return claimed;
  const guess = guessScript(translation);
  if (guess === null) return null;
  if (guessMatchesNative(guess, native)) return native;
  return guess === 'latin' ? DEFAULT_NATIVE_LANGUAGE : guess;
}
