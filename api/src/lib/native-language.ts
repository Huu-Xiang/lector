import { db } from '../db';
import { DEFAULT_NATIVE_LANGUAGE, isNativeLanguageCode, nativeLanguageName } from './languages';

/** The language translations, explanations and tutor replies are written in. */
export function getNativeLanguageCode(userId: string): string {
  const row = db
    .prepare('SELECT value FROM settings WHERE userId = ? AND key = ?')
    .get(userId, 'nativeLanguage') as { value: string } | undefined;
  if (!row) return DEFAULT_NATIVE_LANGUAGE;
  const raw = row.value.replace(/^"|"$/g, '');
  return isNativeLanguageCode(raw) ? raw : DEFAULT_NATIVE_LANGUAGE;
}

export function getNativeLanguageName(userId: string): string {
  return nativeLanguageName(getNativeLanguageCode(userId));
}
