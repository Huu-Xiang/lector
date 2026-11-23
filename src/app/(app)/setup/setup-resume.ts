import {
  LANGUAGES,
  isNativeLanguageCode,
  learnCodeOfNative,
  type LanguageCode,
} from '@/lib/languages';

export const SETUP_RESUME_KEY = 'readfox-setup-resume';

export interface SetupResumeState {
  step: 'preferences';
  native: string;
  targetLanguage: LanguageCode;
}

function isOwnTargetLanguage(code: unknown): code is LanguageCode {
  return typeof code === 'string' && Object.hasOwn(LANGUAGES, code);
}

/** Step 2 requires a target language that differs from the learner's own native language. */
export function canEnterPreferences(
  native: string,
  targetLanguage: LanguageCode | null,
): targetLanguage is LanguageCode {
  return (
    targetLanguage !== null &&
    isOwnTargetLanguage(targetLanguage) &&
    targetLanguage !== learnCodeOfNative(native)
  );
}

/** Stash Step 1 selections before leaving `/setup` for `/vocab-test?from=setup`. */
export function writeSetupResume(native: string, targetLanguage: LanguageCode | null): void {
  if (!isNativeLanguageCode(native) || !canEnterPreferences(native, targetLanguage)) return;
  try {
    const payload: SetupResumeState = {
      step: 'preferences',
      native,
      targetLanguage,
    };
    sessionStorage.setItem(SETUP_RESUME_KEY, JSON.stringify(payload));
  } catch {
    /* storage can be blocked; returning to /setup starts cleanly at Step 1 */
  }
}

/** Consume and clear the one-shot Step 2 resume marker, or return null if absent or invalid. */
export function consumeSetupResume(): SetupResumeState | null {
  try {
    const raw = sessionStorage.getItem(SETUP_RESUME_KEY);
    if (raw === null) return null;
    sessionStorage.removeItem(SETUP_RESUME_KEY);
    const parsed = JSON.parse(raw) as Partial<Record<keyof SetupResumeState, unknown>> | null;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.step !== 'preferences' ||
      !isNativeLanguageCode(parsed.native) ||
      !isOwnTargetLanguage(parsed.targetLanguage) ||
      !canEnterPreferences(parsed.native, parsed.targetLanguage)
    ) {
      return null;
    }
    return {
      step: 'preferences',
      native: parsed.native,
      targetLanguage: parsed.targetLanguage,
    };
  } catch {
    return null;
  }
}
