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

/** Whether the learner wants target-language (monolingual) explanations instead of native translations. */
export function isMonolingualExplanationsEnabled(userId: string): boolean {
  const row = db
    .prepare('SELECT value FROM settings WHERE userId = ? AND key = ?')
    .get(userId, 'monolingualExplanations') as { value: string } | undefined;
  if (!row) return false;
  try {
    return JSON.parse(row.value) === true;
  } catch {
    return row.value === 'true';
  }
}
